# check-logs

Verify whether the demo server log records a failed login.

## Where the log lives

The log file is `example/server.log`, relative to the project root (it sits
next to this example's `midscene.config.ts`).

## Line format

Each line is `<ISO-8601 timestamp> <LEVEL> <component>: <message>`, e.g.

```
2026-06-10T08:55:12Z WARN auth: failed login attempt for role "admin" (invalid password)
```

## What to do

Read the file and check whether at least one `WARN auth:` line describing a
failed login attempt exists (look for "failed login attempt").

Answer with the JSON verdict:

```json
{ "pass": true, "reason": "found 1 failed-login WARN line at 08:55:12Z" }
```

Set `"pass": false` (with a short reason) if no such line exists or the file
cannot be read.
