# International Astronomical Studies

> Komputasi hisab menentukan awal Ramadan berdasarkan data ephemeris NASA/JPL HORIZONS menggunakan Algoritma Newton–Raphson

**Skripsi S1 Muhammad Reinaldy Santoso Alaratte**
**KKC DEV**

---

## Overview

A web application for computing the start of Ramadan using the **Muhammadiyah (Wujudul Hilal)** criterion. All Sun/Moon positional data is sourced from the **NASA/JPL HORIZONS API**. The conjunction (new moon) time is computed using the **Newton–Raphson** root-finding algorithm. Sky visualization uses a canvas-based planetarium with NASA-driven Sun/Moon markers.

## Features

- **Menu 1 — Ramadan Prediction**: Input year + location → compute prediction using HORIZONS data + NR algorithm
- **Menu 2 — Stellarium View**: Planetarium sky view with NASA/JPL HORIZONS-driven Sun/Moon positions
- **Evaluation**: Compare predictions against Muhammadiyah ground truth data
- **About**: Methodology, data sources, and credits
- **Bilingual**: Full English/Indonesian language toggle

## Tech Stack

- Next.js 16 (App Router) + TypeScript
- TailwindCSS
- pnpm
- luxon (datetime), suncalc (sunset), tz-lookup (timezone)
- vitest (testing)
- Stellarium Web Engine (AGPL) — optional for sky visualization

## HORIZONS_MODE

Set the `HORIZONS_MODE` environment variable:

- `live` (default): Query NASA/JPL HORIZONS API directly. Requires internet access.
- `mock`: Use local mock data from `data/mock_horizons/`. Works offline.

Configure in `.env.local`:
```
HORIZONS_MODE=live
```

For offline demo:
```
HORIZONS_MODE=mock
```

## Quick Start

### Prerequisites
- Node.js 20 LTS
- pnpm

### Install & Run
```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build
pnpm start
```

### Demo Scenario
1. Open http://localhost:3000
2. Set Year: **2029**, Location: **Bekasi** (lat: -6.2383, lon: 106.9756), Timezone: Asia/Jakarta
3. Click **Compute Prediction** / **Hitung Prediksi**
4. View results, NASA data panel, Newton-Raphson audit
5. Click **Open Stellarium** to jump to sky view at the predicted datetime
6. In Stellarium View, adjust time and location freely

## Data Files

### `data/anchors_syaban.json`
Contains Sya'ban 1 dates for each Gregorian year. The conjunction search window is `syaban1 + 15d` to `syaban1 + 55d`.

Format:
```json
[
  { "gregorianYear": 2029, "syaban1LocalDate": "2028-12-17" }
]
```

Note: `syaban1LocalDate` can be in the previous Gregorian year (year-crossing allowed).

### `data/ground_truth_muhammadiyah.json`
Contains known Ramadan 1 dates for validation.

Format:
```json
[
  { "year": 2029, "ramadan1": "2029-01-16", "source": "Muhammadiyah projection" }
]
```

### `data/mock_horizons/`
Mock HORIZONS data files for offline demo mode. Contains:
- `sun_geo_eclon.json` — Sun geocentric ecliptic longitude
- `moon_geo_eclon.json` — Moon geocentric ecliptic longitude
- `sun_topo_azel.json` — Sun topocentric AZ/EL
- `moon_topo_azel.json` — Moon topocentric AZ/EL

## API Routes

### `GET /api/predict?year=YYYY&lat=..&lon=..&tz=..`
Returns full prediction result including:
- ramadan1LocalDate, ramadanStartLocalDateTime
- conjunction/sunset times  
- Moon/Sun positions at sunset
- Rule A/B evaluation
- Newton-Raphson iteration log
- Bisection validation

### `GET /api/sky?lat=..&lon=..&tz=..&datetimeLocal=..`
Returns topocentric AZ/EL for Sun and Moon from HORIZONS.

### `POST /api/evaluate`
Compare predictions against ground truth. Body: `{ predictions: { "2029": "2029-01-16", ... } }`

## Methodology

### Muhammadiyah Wujudul Hilal Criterion
- **Rule A**: Conjunction (new moon) occurs before local sunset on date D
- **Rule B**: Moon's topocentric altitude > 0° at sunset on date D

If both A & B fulfilled: Ramadan starts at sunset of date D.

### Newton-Raphson Conjunction
- Target: `f(t) = wrapTo180(ObsEcLon_moon - ObsEcLon_sun) = 0`
- Data: HORIZONS QUANTITIES='31' at GEOCENTER
- Derivative: Central difference, δ = 60s
- Convergence: |f| < 1e-6° AND |step| < 0.2s
- Max iterations: 30
- Scan step: 6 hours
- Validation: Bisection to ~2s precision when bracket available

## AGPL License Notice (Stellarium Web Engine)

Stellarium Web Engine is licensed under AGPL-3.0. If the engine is included in this project, its source code and modifications must be made available under the same license. See https://github.com/Stellarium/stellarium-web-engine for details.

The engine files would be placed in `public/vendor/stellarium/` if built. The sky visualization fallback (canvas overlay) does not require the engine.

## Audit Trail — Commands Executed

```
# Project initialization
pnpm init
pnpm add next@latest react@latest react-dom@latest
pnpm add -D typescript @types/node @types/react @types/react-dom tailwindcss @tailwindcss/postcss postcss eslint eslint-config-next prettier vitest @vitejs/plugin-react
pnpm add luxon suncalc tz-lookup
pnpm add -D @types/luxon @types/suncalc

# Testing
pnpm test

# Build
pnpm build

# Development
pnpm dev
```

## Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout with Navbar/Footer
│   ├── page.tsx            # Menu 1: Ramadan Prediction
│   ├── globals.css         # Tailwind imports
│   ├── stellarium/
│   │   └── page.tsx        # Menu 2: Stellarium View
│   ├── evaluasi/
│   │   └── page.tsx        # Evaluation page
│   ├── about/
│   │   └── page.tsx        # About page
│   └── api/
│       ├── predict/route.ts
│       ├── sky/route.ts
│       └── evaluate/route.ts
├── components/
│   ├── I18nProvider.tsx     # Language context provider
│   ├── Navbar.tsx           # Navigation bar
│   └── Footer.tsx           # Footer with watermark
├── lib/
│   ├── i18n.ts             # Bilingual dictionary (EN/ID)
│   ├── mathAngle.ts        # Angle math utilities
│   ├── horizonsClient.ts   # HORIZONS API client (live+mock+cache)
│   ├── horizonsQueries.ts  # HORIZONS query builders
│   ├── newMoonNR.ts        # Newton-Raphson conjunction finder
│   ├── sunset.ts           # Sunset calculation
│   ├── wujudulHilalRule.ts # Muhammadiyah rule evaluation
│   ├── ramadanFromSyaban.ts # Full prediction pipeline
│   ├── evaluation.ts       # Ground truth comparison
│   └── __tests__/          # Unit tests
│       ├── mathAngle.test.ts
│       ├── horizonsClient.test.ts
│       ├── wujudulHilalRule.test.ts
│       └── evaluation.test.ts
├── types/
│   └── tz-lookup.d.ts      # Type declaration
data/
├── anchors_syaban.json
├── ground_truth_muhammadiyah.json
└── mock_horizons/
    ├── sun_geo_eclon.json
    ├── moon_geo_eclon.json
    ├── sun_topo_azel.json
    └── moon_topo_azel.json
```
