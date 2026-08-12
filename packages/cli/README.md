# @midscene/cli

CLI tool for running Midscene automation scripts in YAML format.

See <https://midscenejs.com/yaml-script-runner.html>.

## Extract reusable UI Actions

Export each successful device operation in a Midscene HTML report as a
standalone UI Action YAML file:

```bash
midscene analyze report.html
```

The command writes to a sibling `<report-name>-ui-actions` directory by
default. Each generated YAML file contains exactly one operation and can be
loaded by `agent.aiAct(..., { loadExtraActions: [...] })`.
