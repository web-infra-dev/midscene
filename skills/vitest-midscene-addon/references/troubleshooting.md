---
title: Troubleshooting
impact: HIGH
tags: debug, timeout, element-not-found, network, headed-mode
---

# Troubleshooting

## Timeout / Assertion Too Early

AI-driven tests are slower than selector-based tests. Default timeout is 180s per test. Most timeout and premature assertion failures are caused by not waiting for the page/app to be ready.

**Web** — use `waitForLoadState` + `aiWaitFor` before asserting:

```typescript
// Incorrect — assertion fires before page updates
await ctx.agent.aiTap('提交按钮');
await ctx.agent.aiAssert('提交成功');

// Correct
await ctx.agent.aiTap('提交按钮');
await ctx.page.waitForLoadState('networkidle');
await ctx.agent.aiWaitFor('提交成功提示出现');
await ctx.agent.aiAssert('提交成功');
```

**Android / iOS** — no `ctx.page`, use `aiWaitFor` instead:

```typescript
await ctx.agent.aiTap('提交按钮');
await ctx.agent.aiWaitFor('提交成功提示出现');
await ctx.agent.aiAssert('提交成功');
```

---

## Element Not Found / Wrong Element

Vague or ambiguous descriptions cause AI to match the wrong element or fail entirely.

```typescript
// Incorrect — too vague, multiple buttons may exist
await ctx.agent.aiTap('按钮');
await ctx.agent.aiTap('删除按钮');

// Correct — include position, context, or visual traits
await ctx.agent.aiTap('页面顶部的蓝色"提交"按钮');
await ctx.agent.aiTap('第一行商品的删除按钮');
```

Tips for precise descriptions:
- Include **position**: 顶部 / 底部 / 第一行 / 左侧
- Include **text content**: "提交" / "确认" / "删除"
- Include **visual traits**: 蓝色 / 大号 / 带图标的

---

## Device Connection

**Android** — ensure a device is connected and ADB is configured:

```bash
adb devices  # Should list your device
```

If using a remote device, set `MIDSCENE_ADB_REMOTE_HOST` and `MIDSCENE_ADB_REMOTE_PORT` in `.env`.

**iOS** — ensure WebDriverAgent is running on the target device/simulator:

```bash
curl http://localhost:8100/status
```

Override the port via `IOSTest.init({ deviceOptions: { wdaPort: 8100 } })`.

---

## Debugging Tips

- **Headed mode (Web)**: Use `WebTest.init({ headless: false })` to see the browser during test execution
- **Per-test override**: `fixture.create(url, testCtx, { headless: false })`
- **Midscene report**: Check the generated report for screenshots and AI decision traces
