# shareBrowserContext 登录状态共享测试

这个测试套件用于验证 `shareBrowserContext: true` 配置下,多个 YAML 文件间是否能正确共享登录状态。

## 问题描述

在修复之前,即使设置了 `shareBrowserContext: true` 和 `concurrent: 1`,第二个 YAML 文件仍然无法访问第一个文件设置的登录状态。

### 根本原因

每个 YAML 文件调用 `browser.newPage()` 创建新的 Page 实例:
- ✓ **Cookie** 可以共享 (通过 Browser 实例)
- ✗ **localStorage** 无法共享 (每个 Page 独立)
- ✗ **sessionStorage** 无法共享 (每个 Page 独立)

## 解决方案

当 `shareBrowserContext: true` 时,创建一个共享的 Page 实例,所有 YAML 文件复用这个 Page:

```typescript
// batch-runner.ts:110
if (needsBrowser && this.config.shareBrowserContext) {
  browser = await puppeteer.launch({ ... });
  sharedPage = await browser.newPage(); // 创建共享 Page

  // 将共享 Page 分配给所有文件
  for (const context of fileContextList) {
    context.options.page = sharedPage;
  }
}
```

```typescript
// agent-launcher.ts:250-258
if (existingPage) {
  // 复用已存在的 Page,保留所有存储
  page = existingPage;
} else {
  // 创建新 Page
  page = await browserInstance.newPage();
}
```

## 测试文件

### HTML 页面
- `share-context-test.html` - 测试页面,支持登录/登出和存储状态检查

### YAML 脚本
- `01-login.yaml` - 第一个文件,执行登录操作
- `02-check-login.yaml` - 第二个文件,检查登录状态是否保留
- `index.yaml` - 批量执行配置

### 测试验证
`packages/cli/tests/ai/share-browser-context.test.ts`

## 运行测试

```bash
# 运行 AI 测试
cd packages/cli
npx nx test:ai @midscene/cli -- share-browser-context.test.ts

# 手动运行 YAML 文件
npx midscene tests/share_context_test_scripts/index.yaml
```

## 预期结果

### 第一个文件 (01-login.yaml)
```javascript
{
  cookie_authToken: "test-token-12345",      // ✓
  localStorage_userId: "user-123",            // ✓
  sessionStorage_sessionId: "session-xyz-789" // ✓
}
```

### 第二个文件 (02-check-login.yaml) - 修复后
```javascript
{
  cookie_authToken: "test-token-12345",      // ✓ 保留
  localStorage_userId: "user-123",            // ✓ 保留 (FIXED!)
  sessionStorage_sessionId: "session-xyz-789" // ✓ 保留 (FIXED!)
}
```

## 修改的文件

1. `packages/cli/src/batch-runner.ts` - 创建共享 Page
2. `packages/cli/src/create-yaml-player.ts` - 传递 Page 参数
3. `packages/web-integration/src/puppeteer/agent-launcher.ts` - 支持复用 Page

## 注意事项

- 只有当 `shareBrowserContext: true` 时才会复用 Page
- 如果 `shareBrowserContext: false`,每个文件仍然会创建独立的浏览器实例
- 共享 Page 意味着所有 YAML 文件在同一个浏览器标签页中执行
- 如果需要在不同标签页执行,应该使用 `shareBrowserContext: false`
