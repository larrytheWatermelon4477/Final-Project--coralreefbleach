"""Step 1 - COLLECT: download the raw datasets into data/raw/.

Run from the project root:  python pipeline/01_collect.py

Every file is saved untouched so the later steps can be re-run from scratch.
If a download fails (e.g. no internet), the copy already in data/raw/ is kept.
"""
from pathlib import Path
import urllib.request

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
RAW.mkdir(parents=True, exist_ok=True)

OWID = "?v=1&csvType=full&useColumnShortNames=false"
SOURCES = {
    # Hughes et al. (2018), 100 fixed reef locations, 1980-2016, via Our World in Data
    "owid_coral_bleaching_events.csv":
        "https://ourworldindata.org/grapher/coral-bleaching-events.csv" + OWID,
    # NOAA GML, Mauna Loa annual mean CO2 (ppm)
    "co2_annmean_mlo.csv":
        "https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_annmean_mlo.csv",
    # Met Office HadSST 4.2 via Our World in Data, anomaly vs 1861-1890 (deg C)
    "owid_sst_anomaly.csv":
        "https://ourworldindata.org/grapher/sea-surface-temperature-anomaly.csv" + OWID,
    # Hawaii Ocean Time-series (Station ALOHA) seawater pH via Our World in Data
    "owid_seawater_ph.csv":
        "https://ourworldindata.org/grapher/seawater-ph.csv" + OWID,
}


def fetch(name: str, url: str) -> None:
    dest = RAW / name
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "cis4930-final-project"})
        with urllib.request.urlopen(req, timeout=60) as r:
            dest.write_bytes(r.read())
        print(f"[ok]   {name}")
    except Exception as exc:  # keep going; use the cached copy
        status = "cached copy kept" if dest.exists() else "MISSING"
        print(f"[fail] {name}: {exc} ({status})")


if __name__ == "__main__":
    for name, url in SOURCES.items():
        fetch(name, url)
