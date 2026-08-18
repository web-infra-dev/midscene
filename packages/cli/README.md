# @midscene/cli

CLI tool for running Midscene automation scripts in YAML format.

See <https://midscenejs.com/yaml-script-runner.html>.

## Export an Action Manifest

Export successful device operations from a Midscene HTML report into one
reusable `*.actions.yaml` manifest:

```bash
midscene analyze report.html
```

The command writes to a sibling `<report-name>-ui-actions` directory by
default. The generated manifest contains one entry per successful device
operation and can be loaded by
`agent.aiAct(..., { loadExtraActions: [...] })`.
