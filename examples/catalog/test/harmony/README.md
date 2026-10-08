# {{PROJECT_NAME}}

A Midscene Test project for HarmonyOS, based on the TodoMVC case in `midscene-example/harmony/vitest-demo`.

If you skipped installation during creation, run `{{INSTALL_COMMAND}}`. The `postinstall` script automatically generates `midscene-node-spec.harmony.md` after each dependency installation. If lifecycle scripts are disabled, run `{{RUN_NODES_COMMAND}}` manually.

Copy `.env.example` to `.env`, then choose and configure a model using the [supported models and setup guide](https://midscenejs.com/model-common-config.html). Do not commit `.env` to your repository; inject the model configuration as environment variables in CI.

Connect a HarmonyOS device and verify it with `hdc list targets`. Set HARMONY_DEVICE_ID to select a device. Set HDC_HOME if hdc is not on PATH.

`cases/todo.yaml` opens the browser on React TodoMVC, adds three tasks, deletes one, completes another, filters Completed, and checks the visible task and remaining count. The page must be reachable on the device. Use a fresh browser profile or clear TodoMVC storage before rerunning the case.

Run tests with `{{TEST_COMMAND}}`. Read `midscene-node-spec.harmony.md` for the available Nodes and their inputs.

After changing Node registrations in `midscene.config.ts`, run `{{RUN_NODES_COMMAND}}` to refresh the spec. This loads the configuration without connecting to a device or running tests. Extension factories must only acquire runtime resources inside Node execution.

Reports are written to `midscene_run/report/`.
