# shareBrowserContext 登录状态共享测试

这个测试套件用于验证 `shareBrowserContext: true` 配置下,多个 YAML 文件间是否能正确共享登录状态。

## 问题描述

在修复之前,即使设置了 `shareBrowserContext: true` 和 `concurrent: 1`,第二个 YAML 文件仍然无法访问第一个文件设置的登录状态。

### 根本原因

每个 YAML 文件调用 `browser.newPage()` 创建新的 Page 实例:
- ✓ **Cookie** 可以共享 (Browser 级别，域名共享)
- ✓ **localStorage** 可以共享 (Origin 级别，域名共享)
- ✗ **sessionStorage** 无法共享 (Tab/Page 级别，每个 Page 独立)

**关键问题**: 当登录状态存储在 sessionStorage 时，会导致后续文件无法访问。

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
- `share-context-test.html` - 登录/登出测试页面
- `session-storage-test.html` - sessionStorage 专项测试页面

### YAML 脚本

#### 登录状态测试
- `01-login.yaml` - 第一个文件,执行登录操作
- `02-check-login.yaml` - 第二个文件,检查登录状态是否保留
- `03-continue-state.yaml` - 使用 `continueFromPreviousPage` 保留完整 JS 状态
- `index.yaml` - 批量执行配置（登录测试）
- `index-continue.yaml` - 批量执行配置（continueFromPreviousPage 测试）

#### sessionStorage 专项测试
- `01-set-session.yaml` - 设置 sessionStorage
- `02-check-session.yaml` - 验证 sessionStorage 是否保留
- `index-session.yaml` - shareBrowserContext=true（应该成功）
- `index-session-no-share.yaml` - shareBrowserContext=false（应该失败）

### 测试验证
- `packages/cli/tests/ai/share-browser-context.test.ts` - 登录状态集成测试
- `packages/cli/tests/ai/session-storage-preservation.test.ts` - sessionStorage 专项测试

## 运行测试

```bash
cd packages/cli

# 运行登录状态集成测试
npx nx test:ai @midscene/cli -- share-browser-context.test.ts

# 运行 sessionStorage 专项测试
npx nx test:ai @midscene/cli -- session-storage-preservation.test.ts

# 手动运行 YAML 文件
npx midscene tests/share_context_test_scripts/index.yaml
npx midscene tests/share_context_test_scripts/index-session.yaml

# 验证修复前的行为（应该失败）
npx midscene tests/share_context_test_scripts/index-session-no-share.yaml
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
  localStorage_userId: "user-123",            // ✓ 保留 (本来就共享)
  sessionStorage_sessionId: "session-xyz-789" // ✓ 保留 (FIXED! 修复前会丢失)
}
```

### sessionStorage 验证 (02-check-session.yaml)

**修复前** (shareBrowserContext=false):
```javascript
{
  sessionToken: null,           // ❌ 丢失
  sessionUserId: null,          // ❌ 丢失
  localPreferences: "dark-mode" // ✓ localStorage 仍然存在
}
// 测试失败: "sessionStorage.authToken was lost!"
```

**修复后** (shareBrowserContext=true):
```javascript
{
  sessionToken: "test-token-12345", // ✓ 保留
  sessionUserId: "user-999",        // ✓ 保留
  localPreferences: "dark-mode"     // ✓ 保留
}
// 测试通过 ✅
```

## 修改的文件

1. `packages/cli/src/batch-runner.ts` - 创建共享 Page
2. `packages/cli/src/create-yaml-player.ts` - 传递 Page 参数
3. `packages/web-integration/src/puppeteer/agent-launcher.ts` - 支持复用 Page

## 关键发现

通过 `tests/verify-storage-between-pages.mjs` 验证了实际存储行为:

**不同 Page 实例之间**:
- ✅ Cookies 共享 (Browser 级别)
- ✅ localStorage 共享 (Origin 级别)
- ❌ sessionStorage 不共享 (Page 级别)

**同一个 Page 实例内** (即使调用 page.goto()):
- ✅ Cookies 保留
- ✅ localStorage 保留
- ✅ sessionStorage 保留

因此，修复的核心是**复用同一个 Page 实例**，这样 sessionStorage 才能在 YAML 文件间共享。

## 注意事项

- 只有当 `shareBrowserContext: true` 时才会复用 Page
- 如果 `shareBrowserContext: false`,每个文件仍然会创建独立的浏览器实例
- 共享 Page 意味着所有 YAML 文件在同一个浏览器标签页中执行
- 如果需要在不同标签页执行,应该使用 `shareBrowserContext: false`
- 大多数登录失败问题是由于 sessionStorage 丢失导致的
