---
title: Android Test Template
impact: CRITICAL
tags: template, android, adb, scrcpy, mobile
---

# Android Test Template

Uses `AndroidTestContext` from `src/context`. Connects to a device via ADB; each `create()` launches a URL/app on the shared device and creates a fresh agent.

- `ctx.agent` = `AndroidAgent` — AI methods + platform-specific: `back()`, `home()`, `recentApps()`, `launch(uri)`, `runAdbShell(cmd)`
- No `ctx.page` — use agent methods only

## Scaffolding Template

```typescript
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { AndroidTestContext } from '../../src/context';

describe('<FEATURE_NAME>', () => {
  let ctx: AndroidTestContext;

  beforeAll(() =>
    AndroidTestContext.setup({
      // deviceId: '<DEVICE_SERIAL>',     // optional: ADB device serial, omit to use first connected
      // deviceOptions: { ... },          // optional: scrcpy config, ADB path, etc.
      // agentOptions: {                  // optional: AI behavior config
      //   aiActionContext: '<SYSTEM_PROMPT>',  // e.g. 'You are an Android app testing expert.'
      // },
    }),
  );
  afterEach((testCtx) => AndroidTestContext.collectReport(ctx, testCtx));
  afterAll((suite) => AndroidTestContext.mergeAndTeardown(suite, '<FEATURE_NAME>'));

  it('<SCENARIO_1>', async (testCtx) => {
    ctx = await AndroidTestContext.create('<URL_OR_APP>', testCtx);

    await ctx.agent.aiAct('<describe the interaction>');
    await ctx.agent.aiAssert('<expected state>');
  });

  it('<SCENARIO_2>', async (testCtx) => {
    ctx = await AndroidTestContext.create('<URL_OR_APP>', testCtx);
    // ...
  });
});
```

## Setup Options

```typescript
AndroidTestContext.setup({
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

- `create(uri)` accepts URLs (`https://...`), package names (`com.example.app`), or app names (matched via `appNameMapping`)
- Use `agent.back()` / `agent.home()` / `agent.recentApps()` for system navigation
- Use `agent.runAdbShell(cmd)` for arbitrary ADB shell commands (e.g., clear app data)
- If no `deviceId` is given, the first connected device from `adb devices` is used
- `scrcpyConfig: { enabled: true }` is recommended for screenshot-based AI recognition
