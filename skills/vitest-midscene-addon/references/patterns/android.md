---
title: Android Test Pattern
impact: CRITICAL
tags: pattern, android, adb, scrcpy, mobile, lifecycle
---

# Android Test Pattern

Uses `AndroidTest` from `src/context`. Connects to a device via ADB; each `fixture.create()` launches a URL/app on the shared device and creates a fresh agent.

- `ctx.agent` = `AndroidAgent` — AI methods + platform-specific: `back()`, `home()`, `recentApps()`, `launch(uri)`, `runAdbShell(cmd)`
- No `ctx.page` — use agent methods only

## Lifecycle

```typescript
const fixture = AndroidTest.init(options?);  // beforeAll + afterEach + afterAll registered automatically

it('scenario', async (testCtx) => {
  const ctx = await fixture.create('com.example.app', testCtx);  // per-test context
  // ... test body ...
});
```

Under the hood, `init()` registers these hooks:

| Hook | What happens |
|------|-------------|
| `beforeAll` | Connect to ADB device |
| each `it` | `fixture.create()` launches URL/app, creates fresh `AndroidAgent` |
| `afterEach` | Collect test report, destroy agent |
| `afterAll` | Merge reports + disconnect device |

## Scaffolding Pattern

```typescript
import { describe, it, expect } from 'vitest';
import { AndroidTest } from '../../src/context';

describe('<FEATURE_NAME>', () => {
  const fixture = AndroidTest.init({
    // deviceId: '<DEVICE_SERIAL>',     // optional: ADB device serial, omit to use first connected
    // deviceOptions: { ... },          // optional: scrcpy config, ADB path, etc.
    // agentOptions: {                  // optional: AI behavior config
    //   aiActionContext: '<SYSTEM_PROMPT>',  // e.g. 'You are an Android app testing expert.'
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
const fixture = AndroidTest.init({
  deviceId: 'emulator-5554',               // specific ADB device serial
  deviceOptions: {
    scrcpyConfig: { enabled: true },        // enable scrcpy for screenshots
  },
  agentOptions: {
    aiActionContext: 'You are an Android app testing expert.',
    appNameMapping: { WeChat: 'com.tencent.mm' }, // app name -> package name
  },
  launchDelay: 5000,                        // ms to wait after launch (default: 3000)
});
```

## Android-Specific Tips

- `fixture.create(uri)` accepts URLs (`https://...`), package names (`com.example.app`), or app names (matched via `appNameMapping`)
- Use `agent.back()` / `agent.home()` / `agent.recentApps()` for system navigation
- Use `agent.runAdbShell(cmd)` for arbitrary ADB shell commands (e.g., clear app data)
- If no `deviceId` is given, the first connected device from `adb devices` is used
- `scrcpyConfig: { enabled: true }` is recommended for screenshot-based AI recognition
