# Example catalog

`test/` contains the five `midscene-test create` starters: Web, Android, iOS, HarmonyOS, and Computer. Every starter uses `@midscene/test`. The CLI packages only entries marked `create` in `manifest.json`.

The Web starter follows the TodoMVC Test Runner example, including deterministic seed/check/capture Nodes and an AI case. The device and desktop starters follow the TodoMVC cases in `midscene-example`. Each manifest entry records the reference case and commit. Other integrations remain in `midscene-example`; they are not copied into `create`.

Before every case, `todo.setup` prepares All view. Web clears storage and checks the empty state through the DOM before seeding. Device and desktop starters use AI to check the empty state and stop with manual cleanup instructions if it is not ready. All starters run serially and stop after the first failed case.

Generated example projects belong at the root of `midscene-example` under the `examplePath` names in the manifest. After the source changes are committed and the matching packages are published, run these commands from the main Midscene repository to sync an existing checkout of `midscene-example`:

```sh
pnpm run examples:sync -- --target ../midscene-example --version <published-version>
pnpm run examples:sync -- --target ../midscene-example --check
```

Relative target paths are resolved from the directory where you invoked pnpm. The target must be a repository root with a remote pointing to `web-infra-dev/midscene-example`; for a fork, add the official repository as an upstream remote. Missing directories and other repositories are rejected before any files are written.

The sync command records the source commit and hashes of generated files in `.midscene-generation.json`. It refuses modified or extra source files inside managed project directories, while leaving local install artifacts such as `.env`, lockfiles, and `node_modules` alone. Run `--check` from the recorded source commit. Reorganizing older examples under a legacy directory is a separate change in `midscene-example`.

Templates store ignore rules in `gitignore` so package managers include them in published tarballs. Both create and sync restore the filename to `.gitignore` in generated projects.
