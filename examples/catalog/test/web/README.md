# {{PROJECT_NAME}}

A Midscene Test project for Web, based on the TodoMVC Test Runner example. For direct Playwright integration, see the separate [Playwright example](https://github.com/web-infra-dev/midscene-example/tree/main/playwright-demo).

If you skipped installation during creation, run `{{INSTALL_COMMAND}}`. The `postinstall` script automatically generates `midscene-node-spec.web.md` after each dependency installation. If lifecycle scripts are disabled, run `{{RUN_NODES_COMMAND}}` manually.

Copy `.env.example` to `.env`, then choose and configure a model using the [supported models and setup guide](https://midscenejs.com/model-common-config.html). Do not commit `.env` to your repository; inject the model configuration as environment variables in CI.

After configuring `.env`, run `{{VERIFY_MODEL_COMMAND}}` from the project directory to check model connectivity and Midscene compatibility. This check does not require a browser or device. If it fails, see [Model debugging and observability](https://midscenejs.com/model-debugging-observability.html) before running tests.

Install Chromium before the first test: `{{CHROMIUM_INSTALL_COMMAND}}`.

`cases/todo.yaml` visits the public React TodoMVC page. `beforeEach` runs `todo.setup` to open All view, clear page storage, reload, and verify an empty list through the DOM, then creates three Todos through `todo.seed`. The first case checks the seed with `todo.expectState`; the second deletes and completes Todos with AI, then checks the exact remaining state. `afterEach` records the page state through `todo.captureState`. The site must be reachable when tests run.

Run tests with `{{TEST_COMMAND}}`. Read `midscene-node-spec.web.md` for the available Nodes and their inputs.

After changing Node registrations in `midscene.config.ts`, run `{{RUN_NODES_COMMAND}}` to refresh the spec. This loads the configuration without connecting to a device or running tests. Extension factories must only acquire runtime resources inside Node execution.

Tests run serially and stop after the first failed case (`test.bail: 1`). Reports are saved and the browser is closed on failure. Reports are written to `midscene_run/report/`.

`setup` starts one shared browser; `fileSetup` creates an independent browser context, page and Agent for each test file. Increase `test.maxConcurrentFiles` to run more files simultaneously. Cases inside each file remain sequential; Case retries reuse that file's environment.
