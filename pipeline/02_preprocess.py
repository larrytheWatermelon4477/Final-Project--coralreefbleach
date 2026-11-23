"""Step 2 - PREPROCESS: clean, validate and merge the raw files.

Run from the project root:  python pipeline/02_preprocess.py
Outputs:
  data/processed/bleaching_by_region.csv   tidy: region, year, moderate, severe, total
  data/processed/climate_by_year.csv       year, co2_ppm, sst_anomaly_c, ph
  data/processed/cleaning_log.txt          what was changed / checked and why
"""
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW, OUT = ROOT / "data" / "raw", ROOT / "data" / "processed"
OUT.mkdir(parents=True, exist_ok=True)
log = []

# ---------- coral bleaching events (Hughes et al. 2018) ----------
b = pd.read_csv(RAW / "owid_coral_bleaching_events.csv")
b = b.rename(columns={"Entity": "region", "Year": "year",
                      "Moderate (<30%)": "moderate", "Severe (>30%)": "severe"})
b = b[["region", "year", "moderate", "severe"]]
b["region"] = b["region"].replace({"Indian Ocean/Middle East": "Indian Ocean & Middle East"})
b[["moderate", "severe"]] = b[["moderate", "severe"]].fillna(0).astype(int)
b["total"] = b["moderate"] + b["severe"]
log.append(f"Bleaching: {len(b)} rows, {b.region.nunique()} entities, "
           f"{b.year.min()}-{b.year.max()}, missing values: {int(b.isna().sum().sum())}")

# Validation: do the four regions add up to the 'World' row?
regions = b[b.region != "World"].groupby("year")[["moderate", "severe"]].sum()
world = b[b.region == "World"].set_index("year")[["moderate", "severe"]]
diff = (regions - world)
bad = diff[(diff != 0).any(axis=1)]
log.append(f"Check regions-sum vs World: {len(bad)} of {len(world)} years differ "
           f"(max abs diff {int(diff.abs().max().max())} event). Decision: use the "
           "published World row for global totals, regional rows for regional views.")
for yr, row in bad.iterrows():
    log.append(f"   {yr}: moderate diff {int(row.moderate):+d}, severe diff {int(row.severe):+d}")
b.to_csv(OUT / "bleaching_by_region.csv", index=False)

# ---------- CO2 (NOAA Mauna Loa) ----------
co2 = pd.read_csv(RAW / "co2_annmean_mlo.csv", comment="#")
co2.columns = [c.strip().lower() for c in co2.columns]
co2 = co2.rename(columns={"mean": "co2_ppm"})[["year", "co2_ppm"]]
log.append(f"CO2: {len(co2)} annual means, {co2.year.min()}-{co2.year.max()}")

# ---------- Sea-surface temperature anomaly (HadSST, World) ----------
sst = pd.read_csv(RAW / "owid_sst_anomaly.csv")
sst = sst[sst["Entity"] == "World"].rename(columns={"Year": "year", "Average": "sst_anomaly_c"})
sst = sst[["year", "sst_anomaly_c"]]
LAST_COMPLETE_YEAR = 2025  # the 2026 value only covers part of the year
log.append(f"SST anomaly: {len(sst)} years, {sst.year.min()}-{sst.year.max()} "
           f"(deg C vs 1861-1890 baseline). Dropped years after {LAST_COMPLETE_YEAR} "
           "(incomplete year).")
sst = sst[sst.year <= LAST_COMPLETE_YEAR]

# ---------- Seawater pH (Hawaii Ocean Time-series, irregular ~monthly cruises) ----------
ph = pd.read_csv(RAW / "owid_seawater_ph.csv")
ph["year"] = pd.to_datetime(ph["Day"]).dt.year
counts = ph.groupby("year")["Monthly average"].count()
ph_y = ph.groupby("year")["Monthly average"].mean().rename("ph").reset_index()
MIN_SAMPLES = 6  # pH swings seasonally; a year with few cruises would be biased
thin = counts[counts < MIN_SAMPLES].index.tolist()
ph_y = ph_y[~ph_y.year.isin(thin)]
log.append(f"pH: {len(ph)} cruise measurements -> calendar-year means. Dropped years with "
           f"< {MIN_SAMPLES} samples (seasonal bias): {thin}")

# ---------- merge ----------
climate = co2.merge(sst, on="year", how="outer").merge(ph_y, on="year", how="outer")
climate = climate[climate.year >= 1959].sort_values("year")
climate.to_csv(OUT / "climate_by_year.csv", index=False)
log.append(f"Merged climate table: {len(climate)} years, {climate.year.min()}-{climate.year.max()}")

(OUT / "cleaning_log.txt").write_text("\n".join(log) + "\n")
print("\n".join(log))
