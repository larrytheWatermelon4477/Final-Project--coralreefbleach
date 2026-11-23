"""Step 3 - ANALYZE: answer the research question and export data for the web app.

Question: As atmospheric CO2 rose, how did the frequency and severity of coral
bleaching change, which reef regions were hit hardest, and what other factors
(ocean heat, acidification) move with it?

Run from the project root:  python pipeline/03_analysis.py
Outputs:
  data/processed/analysis_results.json   the numbers quoted in the app/slides
  data/processed/coral_data.json         everything the web app draws
"""
from pathlib import Path
import json
import numpy as np
import pandas as pd
from scipy import stats

ROOT = Path(__file__).resolve().parent.parent
P = ROOT / "data" / "processed"
b = pd.read_csv(P / "bleaching_by_region.csv")
c = pd.read_csv(P / "climate_by_year.csv")

world = b[b.region == "World"].set_index("year")
regions = b[b.region != "World"]
R = {}

# ---- 1. Frequency & severity over time (per-year averages by period) ----
periods = {"1980s": (1980, 1989), "1990s": (1990, 1999),
           "2000s": (2000, 2009), "2010-16": (2010, 2016)}
R["by_period"] = {}
for name, (a, z) in periods.items():
    w = world.loc[a:z]
    R["by_period"][name] = {
        "years": int(len(w)),
        "severe_per_year": round(w.severe.mean(), 2),
        "moderate_per_year": round(w.moderate.mean(), 2),
        "total_per_year": round(w.total.mean(), 2),
        "severe_share_pct": round(100 * w.severe.sum() / w.total.sum(), 1),
    }
R["severe_per_year_ratio_2010s_vs_1980s"] = round(
    R["by_period"]["2010-16"]["severe_per_year"] / R["by_period"]["1980s"]["severe_per_year"], 1)

# ---- 2. Mass-bleaching years and the gap between them ----
MASS = 10  # >= 10 severe events in one year across the 100 locations
mass_years = world[world.severe >= MASS].index.tolist()
R["mass_bleaching_threshold"] = MASS
R["mass_bleaching_years"] = mass_years
R["gaps_between_mass_years"] = [int(y2 - y1) for y1, y2 in zip(mass_years, mass_years[1:])]
top3 = world.severe.sort_values(ascending=False).head(3)
R["top_severe_years"] = {int(k): int(v) for k, v in top3.items()}

# ---- 3. Which regions are hit hardest ----
reg = regions.groupby("region")[["severe", "moderate", "total"]].sum()
reg["severe_share_pct"] = (100 * reg.severe / reg.total).round(1)
R["regions_1980_2016"] = reg.sort_values("severe", ascending=False).to_dict(orient="index")
recent = regions[regions.year >= 2010].groupby("region").severe.sum()
early = regions[regions.year < 1990].groupby("region").severe.sum()
R["regions_severe_1980s_vs_2010_16"] = {
    r: {"1980s": int(early.get(r, 0)), "2010-16": int(recent.get(r, 0))} for r in reg.index}

# ---- 4. Link to ocean heat and CO2 (1980-2016 overlap) ----
m = world.join(c.set_index("year"), how="inner")


def corr(x, y):
    pr, pp = stats.pearsonr(m[x], m[y])
    sr, sp = stats.spearmanr(m[x], m[y])
    return {"pearson_r": round(pr, 2), "pearson_p": float(f"{pp:.2g}"),
            "spearman_rho": round(sr, 2), "spearman_p": float(f"{sp:.2g}")}


R["corr_sst_vs_severe"] = corr("sst_anomaly_c", "severe")
R["corr_sst_vs_total"] = corr("sst_anomaly_c", "total")
R["corr_co2_vs_severe"] = corr("co2_ppm", "severe")
R["corr_co2_vs_sst_1959_2025"] = round(
    c.dropna(subset=["co2_ppm", "sst_anomaly_c"])[["co2_ppm", "sst_anomaly_c"]].corr().iloc[0, 1], 2)
fit = stats.linregress(m.sst_anomaly_c, m.severe)
R["regression_severe_on_sst"] = {
    "slope_events_per_0_1C": round(fit.slope / 10, 2), "intercept": round(fit.intercept, 2),
    "r_squared": round(fit.rvalue ** 2, 2), "p": float(f"{fit.pvalue:.2g}")}
# Detrended check: year-to-year changes, so a shared upward trend can't drive r
d = m[["sst_anomaly_c", "severe"]].diff().dropna()
dr, dp = stats.pearsonr(d.sst_anomaly_c, d.severe)
R["corr_detrended_year_to_year"] = {"pearson_r": round(dr, 2), "p": float(f"{dp:.2g}")}

# ---- 5. Climate drivers: how much have they changed? ----
def val(col, yr):
    return float(c.loc[c.year == yr, col].iloc[0])

R["co2"] = {"1980": val("co2_ppm", 1980), "2016": val("co2_ppm", 2016), "2025": val("co2_ppm", 2025)}
R["co2"]["change_1980_2025_pct"] = round(100 * (R["co2"]["2025"] / R["co2"]["1980"] - 1), 1)
R["sst"] = {"1980": round(val("sst_anomaly_c", 1980), 2), "2016": round(val("sst_anomaly_c", 2016), 2),
            "2024": round(val("sst_anomaly_c", 2024), 2), "2025": round(val("sst_anomaly_c", 2025), 2),
            "warmest_year": int(c.loc[c.sst_anomaly_c.idxmax(), "year"])}
phd = c.dropna(subset=["ph"])
y0, y1 = int(phd.year.min()), int(phd.year.max())
dph = val("ph", y1) - val("ph", y0)
R["ph"] = {"first_year": y0, "first": round(val("ph", y0), 3), "last_year": y1,
           "last": round(val("ph", y1), 3), "change": round(dph, 3),
           "acidity_increase_pct": round(100 * (10 ** (-dph) - 1), 0),
           "trend_per_decade": round(10 * stats.linregress(phd.year, phd.ph).slope, 3)}

# ---- 6. Context facts from published reports (not computed here) ----
R["context"] = {
    "noaa_crw_4th_event_reef_area_pct": 84.4,   # 1 Jan 2023 - 30 Sep 2025, >= 83 countries
    "noaa_crw_3rd_event_reef_area_pct": 68.2,   # 2014-2017
    "noaa_crw_4th_event_countries": 83,
    "amcs_marine_life_relies_on_reefs": "over one quarter",
}

(P / "analysis_results.json").write_text(json.dumps(R, indent=2))

# ---- export for the web app ----
web = {
    "bleaching": b.to_dict(orient="records"),
    "climate": c.replace({np.nan: None}).to_dict(orient="records"),
    "results": R,
}
(P / "coral_data.json").write_text(json.dumps(web, separators=(",", ":")))
print(json.dumps(R, indent=2))
