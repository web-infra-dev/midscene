# {{PROJECT_NAME}}

A Midscene Test project for HarmonyOS, based on the TodoMVC case in `midscene-example/harmony/vitest-demo`.

If you skipped installation during creation, run `{{INSTALL_COMMAND}}`. The `postinstall` script automatically generates `midscene-node-spec.harmony.md` after each dependency installation. If lifecycle scripts are disabled, run `{{RUN_NODES_COMMAND}}` manually.

Copy `.env.example` to `.env`, then choose and configure a model using the [supported models and setup guide](https://midscenejs.com/model-common-config.html). Do not commit `.env` to your repository; inject the model configuration as environment variables in CI.

After configuring `.env`, run `{{VERIFY_MODEL_COMMAND}}` from the project directory to check model connectivity and Midscene compatibility. This check does not require a browser or device. If it fails, see [Model debugging and observability](https://midscenejs.com/model-debugging-observability.html) before running tests.

Connect a HarmonyOS device and verify it with `hdc list targets`. Set HARMONY_DEVICE_ID to select a device. Set HDC_HOME if hdc is not on PATH.

`cases/todo.yaml` opens the browser on React TodoMVC, adds three tasks, deletes one, completes another, filters Completed, and checks the visible task and remaining count. The page must be reachable on the device. `beforeEach` runs `todo.setup` from `midscene.config.ts` to open the page in All view and wait for its input, then uses `aiAssert` to require an empty list, including completed tasks, with no blocking dialogs. Existing tasks are left unchanged. If the check fails, the test stops before changing tasks. Select All and delete every task (including completed tasks), or clear only the TodoMVC website data; close blocking dialogs and rerun. For model or connection errors, resolve the reported cause first. This AI check can misjudge the page, so inspect the report when it fails.

Run tests with `{{TEST_COMMAND}}`. Read `midscene-node-spec.harmony.md` for the available Nodes and their inputs.

After changing Node registrations in `midscene.config.ts`, run `{{RUN_NODES_COMMAND}}` to refresh the spec. This loads the configuration without connecting to a device or running tests. Extension factories must only acquire runtime resources inside Node execution.

Tests run serially and stop after the first failed case (`test.bail: 1`). Reports are saved and connections are released on failure. Reports are written to `midscene_run/report/`.

Each test file creates its own Agent through `fileSetup` and releases it afterward. The Project is limited to one file at a time because this starter connects to a single device or desktop. Before increasing the Project limit, provide independent devices/displays through your resource allocator.
