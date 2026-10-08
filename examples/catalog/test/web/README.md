# {{PROJECT_NAME}}

A Midscene Test project for Web, based on the TodoMVC Test Runner example. For direct Playwright integration, see the separate [Playwright example](https://github.com/web-infra-dev/midscene-example/tree/main/playwright-demo).

If you skipped installation during creation, run `{{INSTALL_COMMAND}}`. The `postinstall` script automatically generates `midscene-node-spec.web.md` after each dependency installation. If lifecycle scripts are disabled, run `{{RUN_NODES_COMMAND}}` manually.

Copy `.env.example` to `.env`, then choose and configure a model using the [supported models and setup guide](https://midscenejs.com/model-common-config.html). Do not commit `.env` to your repository; inject the model configuration as environment variables in CI.

Install Chromium before the first test: `{{CHROMIUM_INSTALL_COMMAND}}`.

`cases/todo.yaml` visits the public React TodoMVC page. `beforeEach` resets its local storage and creates three Todos through `todo.seed`. The first case checks the seed with `todo.expectState`; the second deletes and completes Todos with AI, then checks the exact remaining state. `afterEach` records the page state through `todo.captureState`. The site must be reachable when tests run.

Run tests with `{{TEST_COMMAND}}`. Read `midscene-node-spec.web.md` for the available Nodes and their inputs.

After changing Node registrations in `midscene.config.ts`, run `{{RUN_NODES_COMMAND}}` to refresh the spec. This loads the configuration without connecting to a device or running tests. Extension factories must only acquire runtime resources inside Node execution.

Reports are written to `midscene_run/report/`.
