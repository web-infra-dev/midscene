# Example catalog

`test/` contains the five `midscene-test create` starters: Web, Android, iOS, HarmonyOS, and Computer. Every starter uses `@midscene/test`. The CLI packages only entries marked `create` in `manifest.json`.

The Web starter follows the TodoMVC Test Runner example, including deterministic seed/check/capture Nodes and an AI case. The device and desktop starters follow the TodoMVC cases in `midscene-example`. Each manifest entry records the reference case and commit. Other integrations remain in `midscene-example`; they are not copied into `create`.

Generated example projects belong at the root of `midscene-example` under the `examplePath` names in the manifest. After the source changes are committed and the matching packages are published, sync a checkout of that repository:

```sh
pnpm run examples:sync -- --target ../midscene-example --version <published-version>
pnpm run examples:sync -- --target ../midscene-example --check
```

The sync command records the source commit and hashes of generated files in `.midscene-generation.json`. It refuses modified or extra source files inside managed project directories, while leaving local install artifacts such as `.env`, lockfiles, and `node_modules` alone. Run `--check` from the recorded source commit. Reorganizing older examples under a legacy directory is a separate change in `midscene-example`.
