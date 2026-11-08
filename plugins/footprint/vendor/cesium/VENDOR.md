# CesiumJS runtime

This directory contains the browser build of **CesiumJS 1.147.0**, vendored so
FootPrint can render a globe without a CDN.

- Project: https://github.com/CesiumGS/cesium
- License: Apache License 2.0 (see `LICENSE.md`)
- Copyright: Cesium GS, Inc. and contributors
- The copied `Build/Cesium` directory includes CesiumJS, its Workers, Widgets,
  shaders, and the Natural Earth II / skybox assets distributed with the build.
- Third-party component notices: see `ThirdParty.json` and `CHANGES.md`.

The FootPrint plugin serves this directory at `/footprint-vendor/` and sets
`window.CESIUM_BASE_URL` to that prefix before loading `Cesium.js`.

Natural Earth II imagery is public domain, courtesy of Natural Earth
(https://www.naturalearthdata.com/). The skybox uses the Tycho star catalogue
distributed with CesiumJS. No Cesium ion token or hosted terrain is required;
the globe uses Cesium's ellipsoid terrain.
