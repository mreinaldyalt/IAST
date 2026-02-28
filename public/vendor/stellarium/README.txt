/* Stellarium Web Engine Vendor Files
 *
 * This directory contains pre-built Stellarium Web Engine artifacts:
 * - stellarium-web-engine.js  (Emscripten JS glue, ~104 KB)
 * - stellarium-web-engine.wasm (compiled engine, ~1.2 MB)
 *
 * License: AGPL-3.0
 * Original source: https://github.com/Stellarium/stellarium-web-engine
 * Pre-built from: https://github.com/joseturnes/TFG-StellariumWebEngine
 *   (master branch, apps/web-frontend/src/assets/js/)
 *
 * The JS file exports a `StelWebEngine` function (UMD + module.exports).
 * Call it with { wasmFile, canvas, onReady(stel) } to initialize.
 *
 * Data sources are loaded from the Stellarium CDN:
 *   https://stellarium.sfo2.cdn.digitaloceanspaces.com/
 *
 * If the engine fails to load, the application falls back to a
 * canvas-based NASA/JPL HORIZONS sky overlay with Sun/Moon markers.
 */
