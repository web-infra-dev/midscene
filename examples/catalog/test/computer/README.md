# {{PROJECT_NAME}}

A Midscene Test project for Computer, based on the TodoMVC case in `midscene-example/computer/vitest-demo`.

If you skipped installation during creation, run `{{INSTALL_COMMAND}}`. The `postinstall` script automatically generates `midscene-node-spec.computer.md` after each dependency installation. If lifecycle scripts are disabled, run `{{RUN_NODES_COMMAND}}` manually.

Copy `.env.example` to `.env`, then choose and configure a model using the [supported models and setup guide](https://midscenejs.com/model-common-config.html). Do not commit `.env` to your repository; inject the model configuration as environment variables in CI.

Prepare the local desktop using the [desktop setup guide](https://midscenejs.com/platforms/desktop.html), including system dependencies and permissions. Set COMPUTER_DISPLAY_ID to select a display. For headless Linux, install Xvfb and enable MIDSCENE_COMPUTER_HEADLESS_LINUX.

`cases/todo.yaml` opens React TodoMVC in Safari on macOS or Chrome on Windows/Linux, adds three tasks, deletes one, completes another, filters Completed, and checks the remaining title and input placeholder. The page must be reachable from the desktop. Use a fresh browser profile or clear TodoMVC storage before rerunning the case.

Run tests with `{{TEST_COMMAND}}`. Read `midscene-node-spec.computer.md` for the available Nodes and their inputs.

After changing Node registrations in `midscene.config.ts`, run `{{RUN_NODES_COMMAND}}` to refresh the spec. This loads the configuration without connecting to a device or running tests. Extension factories must only acquire runtime resources inside Node execution.

Reports are written to `midscene_run/report/`.
