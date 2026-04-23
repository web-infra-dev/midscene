# Backlogs

- Define the support matrix and CLI UX for running YAML via `midscene-web`.
  Background: `@midscene/web` already documents/package-describes YAML support, but the dedicated `midscene-web` CLI currently exposes only tool-style subcommands (`connect`, `tap`, `act`, etc.) rather than a YAML runner entrypoint.
  Next step: decide whether `midscene-web` should add an explicit runner command such as `run`, which `midscene` YAML runner capabilities should be reused for web-only scripts, and which general CLI features should stay exclusive to `midscene`.
  Why deferred: this needs a product/API boundary decision before implementation to avoid mixing the current tool-oriented CLI mental model with the existing cross-platform YAML runner.
