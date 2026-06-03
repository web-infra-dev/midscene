# Smoke tests

These are standalone smoke scripts (not part of `vitest`). Build the package
first (`npx nx build @midscene/testing-framework`), then run with `node`.

| Script | What it checks | Needs network? | Needs a browser? |
| ------ | -------------- | -------------- | ---------------- |
| `pi-wiring.mjs` | Decision C′: Pi registers a custom base-URL provider, resolves the API key, selects the model, and activates the `report_verdict` tool. No model call. | no | no |
| `browser-smoke.mjs` | Real headless Chrome: discover + parse the example cases, launch the web UI Agent, navigate, capture a screenshot, and drive the engine (runtime node + verify) with a **stubbed** agent runtime. | no | yes |
| `model-smoke.mjs` | Full end-to-end: runs the real example cases with the real UI Agent (`ui`) and real Pi runtime (`verify`/`soft`/`agent`) on the same model endpoint. | yes (model endpoint) | yes |

`pi-wiring.mjs` and `browser-smoke.mjs` run in CI-like sandboxes. `model-smoke.mjs`
requires `MIDSCENE_MODEL_BASE_URL` / `MIDSCENE_MODEL_API_KEY` / `MIDSCENE_MODEL_NAME`
(and a VL `MIDSCENE_MODEL_FAMILY`) and a network path to that endpoint.
