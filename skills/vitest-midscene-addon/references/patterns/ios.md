---
title: iOS Test Pattern
impact: CRITICAL
tags: pattern, ios, wda, webdriveragent, mobile, lifecycle
---

# iOS Test Pattern

Uses `IOSTest` from `src/context`. Connects via WebDriverAgent; each `fixture.create()` launches a URL/app on the shared device and creates a fresh agent.

- `ctx.agent` = `IOSAgent` — AI methods + platform-specific: `home()`, `appSwitcher()`, `launch(uri)`, `runWdaRequest(req)`
- No `ctx.page` — use agent methods only

## Lifecycle

```typescript
const fixture = IOSTest.init(options?);  // beforeAll + afterEach + afterAll registered automatically

it('scenario', async (testCtx) => {
  const ctx = await fixture.create('com.apple.mobilesafari', testCtx);  // per-test context
  // ... test body ...
});
```

Under the hood, `init()` registers these hooks:

| Hook | What happens |
|------|-------------|
| `beforeAll` | Connect to device via WebDriverAgent |
| each `it` | `fixture.create()` launches URL/app, creates fresh `IOSAgent` |
| `afterEach` | Collect test report, destroy agent |
| `afterAll` | Merge reports + disconnect device |

## Scaffolding Pattern

```typescript
import { describe, it, expect } from 'vitest';
import { IOSTest } from '../../src/context';

describe('<FEATURE_NAME>', () => {
  const fixture = IOSTest.init({
    // deviceOptions: { ... },          // optional: WDA port, device UDID, etc.
    // agentOptions: {                  // optional: AI behavior config
    //   aiActionContext: '<SYSTEM_PROMPT>',  // e.g. 'You are an iOS app testing expert.'
    // },
  });

  it('<SCENARIO_1>', async (testCtx) => {
    const ctx = await fixture.create('<URL_OR_APP>', testCtx);

    await ctx.agent.aiAct('<describe the interaction>');
    await ctx.agent.aiAssert('<expected state>');
  });

  it('<SCENARIO_2>', async (testCtx) => {
    const ctx = await fixture.create('<URL_OR_APP>', testCtx);
    // ...
  });
});
```

## Setup Options

```typescript
const fixture = IOSTest.init({
  deviceOptions: {
    wdaPort: 8100,                          // WDA port (default: 8100)
  },
  agentOptions: {
    aiActionContext: 'You are an iOS app testing expert.',
    appNameMapping: { Safari: 'com.apple.mobilesafari' },
  },
  launchDelay: 5000,                        // ms to wait after launch (default: 3000)
});
```

## iOS-Specific Tips

- Requires a running WebDriverAgent instance on the target device/simulator
- `fixture.create(uri)` accepts URLs (`https://...`), bundle IDs (`com.apple.mobilesafari`), or app names (matched via `appNameMapping`)
- Use `agent.home()` / `agent.appSwitcher()` for system navigation
- Use `agent.runWdaRequest(req)` for direct WebDriverAgent API calls
- Verify WDA is running: `curl http://localhost:8100/status`
