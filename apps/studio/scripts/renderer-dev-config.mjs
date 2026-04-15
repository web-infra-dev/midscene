// Single source of truth for the renderer dev server host/port.
// Imported by rsbuild.config.ts (to bind the dev server), by
// scripts/wait-for-electron-build.mjs (to probe readiness) and by
// scripts/launch-electron-dev.mjs (to tell the main process where
// to load from via MIDSCENE_STUDIO_RENDERER_URL).
export const rendererDevHost = '127.0.0.1';
export const rendererDevPort = 3210;
export const rendererDevUrl = `http://${rendererDevHost}:${rendererDevPort}`;
