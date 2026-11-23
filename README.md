# Bleached: coral bleaching vs. rising CO₂

CIS4930 Final Project, Sanai Andrews. Option A: Web Application (D3.js).

**Question:** As atmospheric CO₂ has risen, how have the frequency and severity of coral bleaching events changed, which reef regions are most affected, and what other factors (ocean heat, acidification) move with it?

## Run it locally

The page loads JSON with `fetch`, so it needs a small web server (opening `index.html` directly won't load the data):

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## Deploy to GitHub Pages

1. Create a public repo and push this folder (with `index.html` at the root).
2. Repo **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root**.
3. The live URL is `https://<your-username>.github.io/<repo-name>/`.

## Data pipeline

```bash
pip install pandas scipy
python pipeline/01_collect.py     # downloads raw CSVs into data/raw/
python pipeline/02_preprocess.py  # cleans, validates, merges -> data/processed/
python pipeline/03_analysis.py    # stats + coral_data.json for the web app
```

| Step | File | What it does |
|---|---|---|
| Collect | `pipeline/01_collect.py` | Downloads the four raw datasets below. |
| Preprocess | `pipeline/02_preprocess.py` | Renames/types columns; checks the four regions sum to the World row (8 of 37 years differ by 1 event, so World is used for global totals); averages pH cruises into calendar years and drops years with < 6 samples; drops the incomplete 2026 temperature year. Writes `cleaning_log.txt`. |
| Analyze | `pipeline/03_analysis.py` | Per-decade rates, severe share, mass-bleaching years, regional change, Pearson/Spearman correlations, linear fit of severe events on SST, year-over-year (detrended) correlation, pH/CO₂ change. Writes `analysis_results.json` and `coral_data.json`. |
| Visualize | `index.html`, `js/app.js`, `css/style.css` | Linked D3 views: line charts (CO₂, SST, pH), map, stacked bars, dumbbell, scatter; year slider, region filter, severity toggle, tooltips. |

## Data sources

| Dataset | Provider | License |
|---|---|---|
| Coral bleaching events at 100 locations, 1980–2016 | Hughes et al. (2018), *Science* 359:80–83, via [Our World in Data](https://ourworldindata.org/grapher/coral-bleaching-events) | CC BY 4.0 (OWID) |
| Mauna Loa annual mean CO₂ | [NOAA Global Monitoring Laboratory](https://gml.noaa.gov/ccgg/trends/) | Public domain (US Gov) |
| Sea-surface temperature anomaly (vs 1861–1890) | Met Office Hadley Centre HadSST 4.2, via [Our World in Data](https://ourworldindata.org/grapher/sea-surface-temperature-anomaly) | Open Government Licence / CC BY 4.0 |
| Seawater pH, Station ALOHA | Hawaii Ocean Time-series (SOEST), via [Our World in Data](https://ourworldindata.org/grapher/seawater-ph) | CC BY 4.0 (OWID) |
| Context figures (4th global event, 84.4% reef area) | [NOAA Coral Reef Watch](https://coralreefwatch.noaa.gov/satellite/research/coral_bleaching_report.php), [GCRMN 2025](https://gcrmn.net/2025-report/) | cited, not redistributed |

External code: [D3.js](https://d3js.org) v7.8.5 and [TopoJSON client](https://github.com/topojson/topojson-client) v3.0.2 (ISC/BSD), world land shapes from [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth, public domain).

## Limitations

- The bleaching dataset ends in 2016 and covers 100 fixed locations, so it misses the 2023–25 global event and isn't a census of all reefs.
- Regions are broad (4), so the map shows region-level circles, not individual reefs.
- Correlation with temperature is not proof of cause on its own; it agrees with NOAA's and the literature's physical explanation.
- pH comes from a single open-ocean station (Hawaii), not from reefs themselves.
