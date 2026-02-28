# Stellarium Web Engine Data

This directory contains minimal placeholder data files for the Stellarium Web Engine.

For full star catalogs, skycultures, DSO data, landscapes, and milky way survey tiles,
download from: https://github.com/Stellarium/stellarium-web-engine

The engine will gracefully degrade when full data files are not present —
it will still render the sky, planets, sun, and moon correctly using its
built-in ephemeris calculations.

## Directory Structure

```
data/
├── stars/          — Star catalog (HiPS tiles)
├── skycultures/
│   └── western/    — Western constellation data
├── dso/            — Deep Sky Objects catalog
├── landscapes/
│   └── guereins/   — Ground landscape panorama
└── surveys/
    └── milkyway/   — Milky Way survey tiles
```
