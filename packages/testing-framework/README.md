# @midscene/testing-framework

Runtime for Midscene's AI-native UI Testing Framework. It turns a
`midscene.config.ts` plus natural-language YAML cases into an Rstest run, and
can export a standalone native Rstest project.

See the guide for the full topic and usage:

**https://midscenejs.com/ui-testing-framework.html**

## Programmatic API

- `defineMidsceneConfig` — type-only config helper.
- `runMidsceneTest` — run a config's YAML cases in-process through Rstest.
- `emitRstestProject` — export a self-contained native Rstest project.
- `registerMidsceneSuite` / `defineMidsceneCaseTest` — runtime entries used by
  the generated bootstrap module and emitted `e2e/*.test.ts` files.

`@rstest/core` is a peer dependency; install it in your test project (or in the
project exported for native Rstest).
