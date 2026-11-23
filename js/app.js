// Bleached — linked D3 views of coral bleaching vs. CO2, ocean heat and pH.
// Data comes from pipeline/03_analysis.py -> data/processed/coral_data.json

const REGIONS = ["Australasia", "Indian Ocean & Middle East", "Pacific", "West Atlantic"];
// Rough centre of each Hughes et al. region, used to place the map circles
const REGION_XY = {
  "Australasia": [146, -16],
  "Indian Ocean & Middle East": [62, 8],
  "Pacific": [-160, 2],
  "West Atlantic": [-74, 19],
};
// NOAA Coral Reef Watch global bleaching events (shaded on the temperature chart)
const GLOBAL_EVENTS = [[1998, 1998], [2010, 2010], [2014, 2017], [2023, 2025]];

const state = { year: 2016, region: "World", sev: "all" };
const listeners = [];
const onChange = (fn) => listeners.push(fn);
const update = () => listeners.forEach((fn) => fn(state));
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ---------- tooltip ----------
const tip = document.getElementById("tip");
function showTip(event, html) {
  tip.innerHTML = html;
  tip.hidden = false;
  const pad = 14, r = tip.getBoundingClientRect();
  let x = event.clientX + pad, y = event.clientY + pad;
  if (x + r.width > window.innerWidth - 8) x = event.clientX - r.width - pad;
  if (y + r.height > window.innerHeight - 8) y = event.clientY - r.height - pad;
  tip.style.left = x + "px";
  tip.style.top = y + "px";
}
const hideTip = () => { tip.hidden = true; };

// ---------- load ----------
Promise.all([
  fetch("data/processed/coral_data.json").then((r) => r.json()),
  fetch("data/geo/land-110m.json").then((r) => r.json()),
]).then(([data, land]) => {
  const R = data.results;
  const climate = data.climate;
  const bleach = data.bleaching;
  const byRegion = d3.group(bleach, (d) => d.region);

  renderKpis(R);
  renderChainNote(R);
  lineChart("#chart-co2", climate, "co2_ppm", { fmt: (v) => v.toFixed(1) + " ppm" });
  lineChart("#chart-sst", climate, "sst_anomaly_c", {
    fmt: (v) => (v > 0 ? "+" : "") + v.toFixed(2) + " °C", bands: GLOBAL_EVENTS,
  });
  lineChart("#chart-ph", climate, "ph", { fmt: (v) => v.toFixed(3) });
  setupControls();
  mapChart(land, byRegion);
  barChart(byRegion);
  dumbbellChart(byRegion);
  scatterChart(byRegion.get("World"), climate, R);
  update();
}).catch((err) => {
  document.querySelector("main").insertAdjacentHTML("afterbegin",
    `<p class="wrap note">The data didn't load (${err.message}). Open this page through a web server (e.g. GitHub Pages or <code>python -m http.server</code>), not as a file.</p>`);
});

// ---------- KPI tiles ----------
function renderKpis(R) {
  const p = R.by_period;
  const tiles = [
    { num: `${p["1980s"].severe_per_year.toFixed(1)} → ${p["2010-16"].severe_per_year.toFixed(1)}`, unit: "per year",
      lbl: `Severe bleaching events at 100 reefs, 1980s vs 2010–16 (${R.severe_per_year_ratio_2010s_vs_1980s}×)`,
      src: "Hughes et al. 2018" },
    { num: `+${R.regression_severe_on_sst.slope_events_per_0_1C.toFixed(1)}`, unit: "events",
      lbl: `More severe events per year for every +0.1 °C of ocean warming (r = ${R.corr_sst_vs_severe.pearson_r})`,
      src: "this analysis, 1980–2016" },
    { num: `${R.context.noaa_crw_4th_event_reef_area_pct}%`, unit: "of reef area",
      lbl: "Hit by bleaching-level heat in the 4th global event, Jan 2023 – Sep 2025",
      src: "NOAA Coral Reef Watch" },
  ];
  d3.select("#kpis").selectAll("div").data(tiles).join("div").attr("class", "kpi")
    .html((t) => `<span class="num">${t.num} <small>${t.unit}</small></span><span class="lbl">${t.lbl}</span><span class="src">${t.src}</span>`);
}

function renderChainNote(R) {
  document.getElementById("chain-note").textContent =
    `CO₂ rose from ${R.co2["1980"]} ppm in 1980 to ${R.co2["2025"]} ppm in 2025 (+${R.co2.change_1980_2025_pct}%). ` +
    `Across 1959–2025, CO₂ and sea-surface temperature move together (r = ${R.corr_co2_vs_sst_1959_2025}). ` +
    `Seawater pH fell from ${R.ph.first} (${R.ph.first_year}) to ${R.ph.last} (${R.ph.last_year}), about ${R.ph.acidity_increase_pct}% more acidic. ` +
    `Shaded bands on the temperature chart are NOAA's four global bleaching events.`;
}

// ---------- line chart (CO2, SST, pH) ----------
function lineChart(sel, rows, key, { fmt, bands = [] }) {
  const W = 360, H = 190, m = { t: 10, r: 14, b: 24, l: 44 };
  const pts = rows.filter((d) => d[key] != null && d.year >= 1980);
  const x = d3.scaleLinear().domain([1980, 2025]).range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain(d3.extent(pts, (d) => d[key])).nice().range([H - m.b, m.t]);
  const svg = d3.select(sel).append("svg").attr("viewBox", `0 0 ${W} ${H}`)
    .attr("role", "img").attr("aria-label", d3.select(sel).select(".ttl").text() + ", 1980 to 2025");

  svg.append("g").attr("class", "bands").selectAll("rect").data(bands).join("rect")
    .attr("x", (b) => x(b[0] - 0.5)).attr("width", (b) => x(b[1] + 0.5) - x(b[0] - 0.5))
    .attr("y", m.t).attr("height", H - m.b - m.t).attr("fill", "var(--band)");
  svg.append("g").attr("class", "gridline").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat(""));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).tickValues([1980, 1990, 2000, 2010, 2020]).tickFormat(d3.format("d")).tickSizeOuter(0));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(4).tickSizeOuter(0)).call((g) => g.select(".domain").remove());
  svg.append("path").datum(pts).attr("fill", "none").attr("stroke", "var(--climate)")
    .attr("stroke-width", 2).attr("stroke-linejoin", "round")
    .attr("d", d3.line().x((d) => x(d.year)).y((d) => y(d[key])));

  const marker = svg.append("line").attr("class", "yr-marker").attr("y1", m.t).attr("y2", H - m.b);
  const dot = svg.append("circle").attr("r", 4.5).attr("fill", "var(--climate)")
    .attr("stroke", "var(--surface)").attr("stroke-width", 2);

  // hover crosshair + tooltip
  const hover = svg.append("line").attr("stroke", "var(--muted)").attr("y1", m.t).attr("y2", H - m.b).attr("opacity", 0);
  svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b)
    .attr("fill", "transparent")
    .on("pointermove", (ev) => {
      const yr = Math.round(x.invert(d3.pointer(ev)[0]));
      const d = pts.find((p) => p.year === yr);
      if (!d) return hideTip();
      hover.attr("x1", x(yr)).attr("x2", x(yr)).attr("opacity", 0.6);
      showTip(ev, `<b>${yr}</b><br>${fmt(d[key])}`);
    })
    .on("pointerleave", () => { hover.attr("opacity", 0); hideTip(); });

  onChange((s) => {
    const d = pts.find((p) => p.year === s.year);
    marker.attr("x1", x(s.year)).attr("x2", x(s.year));
    dot.attr("opacity", d ? 1 : 0).attr("cx", x(s.year)).attr("cy", d ? y(d[key]) : 0);
  });
}

// ---------- controls ----------
function setupControls() {
  const select = d3.select("#region");
  select.selectAll("option").data(["World", ...REGIONS]).join("option")
    .attr("value", (d) => d).text((d) => (d === "World" ? "All regions" : d));
  select.on("change", (ev) => { state.region = ev.target.value; update(); });

  d3.selectAll("#severity button").on("click", (ev) => {
    state.sev = ev.currentTarget.dataset.v;
    d3.selectAll("#severity button").attr("aria-pressed", function () { return this.dataset.v === state.sev; });
    update();
  });

  const slider = document.getElementById("year");
  slider.addEventListener("input", () => { state.year = +slider.value; update(); });
  onChange((s) => {
    slider.value = s.year;
    document.getElementById("year-out").textContent = s.year;
    select.property("value", s.region);
  });

  let timer = null;
  const btn = document.getElementById("play");
  btn.addEventListener("click", () => {
    if (timer) { clearInterval(timer); timer = null; btn.textContent = "▶ Play"; return; }
    if (state.year >= 2016) state.year = 1979;
    btn.textContent = "❚❚ Pause";
    timer = setInterval(() => {
      state.year += 1; update();
      if (state.year >= 2016) { clearInterval(timer); timer = null; btn.textContent = "▶ Play"; }
    }, 450);
  });
}

const valueOf = (d, sev) => (sev === "all" ? d.total : d[sev]);
const sevLabel = { all: "bleaching events", severe: "severe events", moderate: "moderate events" };

// ---------- map ----------
function mapChart(land, byRegion) {
  const W = 620, H = 330;
  const proj = d3.geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], { type: "Sphere" });
  const path = d3.geoPath(proj);
  const svg = d3.select("#chart-map").append("svg").attr("viewBox", `0 0 ${W} ${H}`)
    .attr("role", "img").attr("aria-label", "World map with one circle per reef region");
  svg.append("path").datum(topojson.feature(land, land.objects.land)).attr("class", "land").attr("d", path);
  [23.44, -23.44].forEach((lat) => {
    const yy = proj([0, lat])[1];
    svg.append("line").attr("x1", 6).attr("x2", W - 6).attr("y1", yy).attr("y2", yy)
      .attr("stroke", "var(--line)").attr("stroke-dasharray", "3 5");
  });
  const maxV = d3.max(REGIONS, (r) => d3.max(byRegion.get(r), (d) => d.total));
  const rScale = d3.scaleSqrt().domain([0, maxV]).range([0, 46]);

  const g = svg.append("g").selectAll("g").data(REGIONS).join("g")
    .attr("transform", (r) => `translate(${proj(REGION_XY[r])})`)
    .style("cursor", "pointer")
    .on("click", (ev, r) => { state.region = state.region === r ? "World" : r; update(); })
    .on("pointermove", (ev, r) => {
      const d = byRegion.get(r).find((p) => p.year === state.year);
      showTip(ev, `<b>${r}, ${state.year}</b><br>Severe: ${d.severe} · Moderate: ${d.moderate}<br><span style="opacity:.7">Click to filter</span>`);
    })
    .on("pointerleave", hideTip);
  g.append("circle").attr("r", 48).attr("fill", "transparent"); // generous hover target
  // dashed ring shown when a region had zero events, so it doesn't vanish from the map
  const ring = g.append("circle").attr("fill", "none").attr("stroke", "var(--muted)")
    .attr("stroke-width", 1.5).attr("stroke-dasharray", "2 3");
  const bubble = g.append("circle").attr("fill", "var(--severe)").attr("fill-opacity", 0.8)
    .attr("stroke", "var(--surface)").attr("stroke-width", 2);
  const label = g.append("text").attr("class", "lbl-ink").attr("text-anchor", "middle");
  const shortName = (r) => (r === "Indian Ocean & Middle East" ? "Indian Ocean & M.E." : r);

  onChange((s) => {
    const cap = s.sev === "all" ? "Events" : s.sev[0].toUpperCase() + s.sev.slice(1) + " events";
    d3.select("#map-title").text(`${cap} by region, ${s.year}`);
    const v = (r) => valueOf(byRegion.get(r).find((p) => p.year === s.year), s.sev);
    bubble.transition().duration(250).attr("r", (r) => rScale(v(r)));
    ring.attr("r", (r) => (v(r) === 0 ? 7 : 0));
    label.attr("y", (r) => -Math.max(rScale(v(r)), 7) - 7).text((r) => `${shortName(r)}: ${v(r)}`);
    g.attr("opacity", (r) => (s.region === "World" || s.region === r ? 1 : 0.35));
  });
}

// ---------- stacked bars ----------
function barChart(byRegion) {
  const W = 480, H = 330, m = { t: 12, r: 10, b: 26, l: 34 };
  const svg = d3.select("#chart-bars").append("svg").attr("viewBox", `0 0 ${W} ${H}`)
    .attr("role", "img").attr("aria-label", "Bleaching events per year, stacked by severity");
  const x = d3.scaleBand().domain(d3.range(1980, 2017)).range([m.l, W - m.r]).padding(0.18);
  const y = d3.scaleLinear().range([H - m.b, m.t]);
  const grid = svg.append("g").attr("class", "gridline").attr("transform", `translate(${m.l},0)`);
  const yAxis = svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`);
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).tickValues([1980, 1990, 2000, 2010, 2016]).tickSizeOuter(0));
  const barsG = svg.append("g");
  const legend = d3.select("#chart-bars").append("div").attr("class", "legend")
    .html(`<span><i style="background:var(--moderate)"></i>Moderate (≤30% bleached)</span><span><i style="background:var(--severe)"></i>Severe (&gt;30%)</span>`);

  onChange((s) => {
    const rows = byRegion.get(s.region);
    const keys = s.sev === "all" ? ["moderate", "severe"] : [s.sev];
    const stack = d3.stack().keys(keys)(rows);
    y.domain([0, d3.max(rows, (d) => d3.sum(keys, (k) => d[k])) || 1]).nice();
    grid.call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(""));
    yAxis.call(d3.axisLeft(y).ticks(5).tickSizeOuter(0)).call((g) => g.select(".domain").remove());
    d3.select("#bars-title").text(`${s.region === "World" ? "All regions" : s.region}: ${sevLabel[s.sev]} per year`);

    barsG.selectAll("g.layer").data(stack, (d) => d.key).join("g").attr("class", "layer")
      .attr("fill", (d) => `var(--${d.key})`)
      .selectAll("rect").data((d) => d.map((v) => Object.assign(v, { key: d.key })))
      .join("rect")
      .attr("x", (d) => x(d.data.year)).attr("width", x.bandwidth())
      .attr("y", (d) => y(d[1])).attr("height", (d) => Math.max(0, y(d[0]) - y(d[1]) - (d[1] > d[0] ? 1 : 0)))
      .attr("rx", 1.5)
      .attr("opacity", (d) => (d.data.year === s.year ? 1 : 0.72));

    // full-height hit targets for hover + click
    barsG.selectAll("rect.hit").data(rows, (d) => d.year).join("rect").attr("class", "hit")
      .attr("x", (d) => x(d.year) - 1).attr("width", x.bandwidth() + 2).attr("y", m.t).attr("height", H - m.t - m.b)
      .attr("fill", "transparent").style("cursor", "pointer")
      .on("click", (ev, d) => { state.year = d.year; update(); })
      .on("pointermove", (ev, d) => showTip(ev, `<b>${d.year}</b><br>Severe: ${d.severe}<br>Moderate: ${d.moderate}`))
      .on("pointerleave", hideTip)
      .raise();
  });
}

// ---------- dumbbell: severe events per year, 1980s vs 2010-16 ----------
function dumbbellChart(byRegion) {
  const W = 480, H = 220, m = { t: 26, r: 40, b: 26, l: 150 };
  const rate = (r, a, z) => d3.mean(byRegion.get(r).filter((d) => d.year >= a && d.year <= z), (d) => d.severe);
  const rows = REGIONS.map((r) => ({ r, early: rate(r, 1980, 1989), late: rate(r, 2010, 2016) }))
    .sort((a, b) => b.late - b.early - (a.late - a.early));
  const svg = d3.select("#chart-dumbbell").append("svg").attr("viewBox", `0 0 ${W} ${H}`)
    .attr("role", "img").attr("aria-label", "Severe bleaching events per year by region, 1980s compared with 2010 to 2016");
  const x = d3.scaleLinear().domain([0, d3.max(rows, (d) => Math.max(d.early, d.late))]).nice().range([m.l, W - m.r]);
  const y = d3.scaleBand().domain(rows.map((d) => d.r)).range([m.t, H - m.b]).padding(0.4);
  svg.append("g").attr("class", "gridline").attr("transform", `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).ticks(5).tickSize(-(H - m.t - m.b)).tickFormat(""));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).ticks(5).tickSizeOuter(0));
  const row = svg.append("g").selectAll("g").data(rows).join("g")
    .attr("transform", (d) => `translate(0,${y(d.r) + y.bandwidth() / 2})`)
    .on("pointermove", (ev, d) => showTip(ev, `<b>${d.r}</b><br>1980s: ${d.early.toFixed(1)} severe/yr<br>2010–16: ${d.late.toFixed(1)} severe/yr`))
    .on("pointerleave", hideTip);
  row.append("rect").attr("x", 0).attr("y", -y.bandwidth()).attr("width", W).attr("height", y.bandwidth() * 2).attr("fill", "transparent");
  row.append("text").attr("class", "lbl-ink").attr("x", m.l - 12).attr("dy", "0.35em").attr("text-anchor", "end").text((d) => d.r);
  row.append("line").attr("x1", (d) => x(d.early)).attr("x2", (d) => x(d.late)).attr("stroke", "var(--line)").attr("stroke-width", 3);
  row.append("circle").attr("cx", (d) => x(d.early)).attr("r", 6).attr("fill", "var(--surface)").attr("stroke", "var(--muted)").attr("stroke-width", 2);
  row.append("circle").attr("cx", (d) => x(d.late)).attr("r", 6).attr("fill", "var(--severe)").attr("stroke", "var(--surface)").attr("stroke-width", 2);
  row.append("text").attr("class", "lbl-muted").attr("x", (d) => x(Math.max(d.early, d.late)) + 10).attr("dy", "0.35em")
    .text((d) => `${d.late >= d.early ? "+" : ""}${(d.late - d.early).toFixed(1)}`);
  d3.select("#chart-dumbbell").append("div").attr("class", "legend")
    .html(`<span><i style="background:var(--surface);border:2px solid var(--muted);border-radius:50%"></i>1980s average</span><span><i style="background:var(--severe);border-radius:50%"></i>2010–16 average</span><span>severe events per year</span>`);
}

// ---------- scatter: SST anomaly vs severe events ----------
function scatterChart(world, climate, R) {
  const W = 480, H = 220, m = { t: 14, r: 16, b: 34, l: 40 };
  const sst = new Map(climate.map((d) => [d.year, d.sst_anomaly_c]));
  const pts = world.map((d) => ({ year: d.year, x: sst.get(d.year), y: d.severe }));
  const x = d3.scaleLinear().domain(d3.extent(pts, (d) => d.x)).nice().range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain([0, d3.max(pts, (d) => d.y)]).nice().range([H - m.b, m.t]);
  const svg = d3.select("#chart-scatter").append("svg").attr("viewBox", `0 0 ${W} ${H}`)
    .attr("role", "img").attr("aria-label", "Scatter plot of sea-surface temperature anomaly against severe bleaching events, one dot per year");
  svg.append("g").attr("class", "gridline").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat(""));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat((v) => v.toFixed(1)).tickSizeOuter(0));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(4).tickSizeOuter(0)).call((g) => g.select(".domain").remove());
  svg.append("text").attr("x", W - m.r).attr("y", H - 4).attr("text-anchor", "end").text("sea-surface temp. anomaly (°C)");
  svg.append("text").attr("x", m.l + 4).attr("y", m.t + 4).text("severe events");

  const fit = R.regression_severe_on_sst, b1 = fit.slope_events_per_0_1C * 10, b0 = fit.intercept;
  const [x0, x1] = x.domain();
  svg.append("line").attr("x1", x(x0)).attr("x2", x(x1))
    .attr("y1", y(Math.max(0, b0 + b1 * x0))).attr("y2", y(b0 + b1 * x1))
    .attr("stroke", "var(--muted)").attr("stroke-dasharray", "5 4");
  svg.append("text").attr("class", "lbl-ink").attr("x", x(x1) - 4).attr("y", y(b0 + b1 * x1) - 10).attr("text-anchor", "end")
    .text(`r = ${R.corr_sst_vs_severe.pearson_r}, p < 0.001`);

  const dots = svg.append("g").selectAll("circle").data(pts).join("circle")
    .attr("cx", (d) => x(d.x)).attr("cy", (d) => y(d.y)).attr("r", 5)
    .attr("fill", "var(--climate)").attr("fill-opacity", 0.7).attr("stroke", "var(--surface)").attr("stroke-width", 1.5)
    .style("cursor", "pointer")
    .on("click", (ev, d) => { state.year = d.year; update(); })
    .on("pointermove", (ev, d) => showTip(ev, `<b>${d.year}</b><br>SST anomaly: +${d.x.toFixed(2)} °C<br>Severe events: ${d.y}`))
    .on("pointerleave", hideTip);
  const tag = svg.append("text").attr("class", "lbl-ink");
  [1998, 2010, 2016].forEach((yr) => {
    const d = pts.find((p) => p.year === yr);
    svg.append("text").attr("class", "lbl-muted").attr("x", x(d.x) - 8).attr("y", y(d.y) + 4).attr("text-anchor", "end").text(yr);
  });

  onChange((s) => {
    dots.attr("fill", (d) => (d.year === s.year ? "var(--severe)" : "var(--climate)"))
      .attr("fill-opacity", (d) => (d.year === s.year ? 1 : 0.7))
      .attr("r", (d) => (d.year === s.year ? 7 : 5));
    dots.filter((d) => d.year === s.year).raise();
  });
}
