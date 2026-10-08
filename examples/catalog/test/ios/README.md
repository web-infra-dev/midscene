# {{PROJECT_NAME}}

A Midscene Test project for iOS, based on the TodoMVC case in `midscene-example/ios/vitest-demo`.

If you skipped installation during creation, run `{{INSTALL_COMMAND}}`. The `postinstall` script automatically generates `midscene-node-spec.ios.md` after each dependency installation. If lifecycle scripts are disabled, run `{{RUN_NODES_COMMAND}}` manually.

Copy `.env.example` to `.env`, then choose and configure a model using the [supported models and setup guide](https://midscenejs.com/model-common-config.html). Do not commit `.env` to your repository; inject the model configuration as environment variables in CI.

Start WebDriverAgent and set WDA_HOST and WDA_PORT, or set WDA_BASE_URL for a gateway URL with a path prefix. Set WDA_MJPEG_URL for a separate remote MJPEG stream, or WDA_MJPEG_PORT for a direct connection.

`cases/todo.yaml` opens React TodoMVC, adds three tasks, deletes one, completes another, filters Completed, and checks the visible task and remaining count. The page must be reachable on the device. Use a fresh browser profile or clear TodoMVC storage before rerunning the case.

Run tests with `{{TEST_COMMAND}}`. Read `midscene-node-spec.ios.md` for the available Nodes and their inputs.

After changing Node registrations in `midscene.config.ts`, run `{{RUN_NODES_COMMAND}}` to refresh the spec. This loads the configuration without connecting to a device or running tests. Extension factories must only acquire runtime resources inside Node execution.

Reports are written to `midscene_run/report/`.
