---
title: Troubleshooting
impact: HIGH
tags: debug, timeout, element-not-found, network, headed-mode
---

# Troubleshooting

## Timeout Errors

**Impact: HIGH** — AI-driven tests are slower than traditional selector-based tests. Default timeout is 180s per test.

```typescript
// Incorrect — no explicit wait, page may not be ready
await ctx.agent.aiAssert('商品列表显示正常');

// Correct — wait for page readiness before asserting
await ctx.page.waitForLoadState('networkidle');
await ctx.agent.aiWaitFor('商品列表加载完成');
await ctx.agent.aiAssert('商品列表显示正常');
```

---

## Element Not Found

**Impact: HIGH** — Vague descriptions cause AI to match the wrong element or fail entirely.

```typescript
// Incorrect — too vague, multiple buttons may exist
await ctx.agent.aiTap('按钮');

// Correct — include position, color, or text for precision
await ctx.agent.aiTap('页面顶部的蓝色"提交"按钮');
```

---

## Network Waiting

**Impact: HIGH** — Assertions after navigation/submission may run before the page updates.

```typescript
// Incorrect — assertion fires before response arrives
await ctx.agent.aiTap('提交按钮');
await ctx.agent.aiAssert('提交成功');

// Correct — wait for network to settle first
await ctx.agent.aiTap('提交按钮');
await ctx.page.waitForLoadState('networkidle');
await ctx.agent.aiAssert('提交成功');
```

---

## Multiple Similar Elements

**Impact: MEDIUM** — Ambiguous targets cause unpredictable clicks.

```typescript
// Incorrect — which delete button?
await ctx.agent.aiTap('删除按钮');

// Correct — specify row or context
await ctx.agent.aiTap('第一行商品的删除按钮');
```

---

## Headless vs Headed Mode (Web only)

**Impact: LOW** — Use headed mode for visual debugging.

```typescript
// Default — headless (for CI)
ctx = await WebTestContext.create('https://example.com', testCtx);

// Debug — headed mode to see the browser
ctx = await WebTestContext.create('https://example.com', testCtx, { headless: false });
```

---

## Android: No Device Found

**Impact: HIGH** — Ensure a device is connected and ADB is configured.

```bash
adb devices  # Should list your device
```

If using a remote device, set `MIDSCENE_ADB_REMOTE_HOST` and `MIDSCENE_ADB_REMOTE_PORT` in `.env`.

---

## iOS: WDA Connection Failed

**Impact: HIGH** — Ensure WebDriverAgent is running on the target device/simulator.

```bash
# Check WDA status (default port 8100)
curl http://localhost:8100/status
```

Override the port via `IOSTestContext.setup({ deviceOptions: { wdaPort: 8100 } })`.
