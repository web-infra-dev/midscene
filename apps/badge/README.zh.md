# @midscene/badge

通过 Cloudflare Worker 将 Midscene Test 结果渲染为可嵌入 Markdown 的 SVG 徽章。

```md
![Midscene Test](https://<your-domain>/e2e?pass=42&fail=3&skipped=5)
```

## 查询参数

| 参数 | 必填 | 取值 |
| --- | --- | --- |
| `pass` | 是 | 0–9999999 的整数，通过数 |
| `fail` | 是 | 0–9999999 的整数，失败数 |
| `skipped` | 否 | 0–9999999 的整数，跳过数，默认 `0` |
| `style` | 否 | `flat`（默认，20px）、`large`（28px）、`card`（双行） |
| `theme` | 否 | `light`（默认）或 `dark`，仅影响 `card` |

三种样式都会在跳过数大于 0 时显示灰色的 skipped 区域。卡片总数及底部比例条包含跳过用例；通过率为 `pass / (pass + fail)`，不计跳过用例。没有已执行用例时，通过率为 `0%`。

无效参数返回 `400`，正文包含纯文本错误说明。首页提供中英文说明、实时预览及 Markdown 示例。

## E2E by Midscene.js

无需填写数字的静态徽章：

```md
[![E2E by Midscene.js](https://<your-domain>/by-midscene)](https://midscenejs.com)
```

可选 `style`：`flat`（默认，20px）或 `large`（28px）。

## 缓存

- 浏览器、代理和 Cloudflare 边缘缓存时间为 24 小时：`Cache-Control: public, max-age=86400, s-maxage=86400`。
- 边缘缓存使用经过验证和规范化的参数；参数顺序、前导零及显式默认值不会产生额外缓存。
- `ETag` 包含所有影响输出的参数，匹配时返回 `304`。

修改样式时递增 `src/badge.ts` 中的 `BADGE_VERSION`。部署后边缘缓存立即使用新版本；已缓存的客户端最多保留旧版 24 小时。

## 本地开发

```bash
pnpm --filter @midscene/badge dev
pnpm exec nx test @midscene/badge
pnpm --filter @midscene/badge typecheck
```

开发服务默认地址为 http://localhost:8787。

由于 GitHub camo 禁止 SVG 中的外部图片，Logo 以 Base64 PNG 内嵌。`assets/logo-96.png` 是 `apps/site/docs/public/images/brand/midscene-icon.png` 的缩小版本；替换后运行 `pnpm --filter @midscene/badge generate-logo` 重新生成 `src/logo.ts`。

## 部署

生产环境通过 `.github/workflows/badge.yml` 部署。PR 执行测试、类型检查和 Worker 打包验证；相关修改合并到 `main` 后自动部署，也可在 `main` 手动触发 **Badge service** 工作流。其他分支仅验证。

工作流使用专用的 `CLOUDFLARE_BADGE_API_TOKEN` 仓库密钥和 `CLOUDFLARE_ACCOUNT_ID` 变量。令牌独立于报告发布令牌，需要 Web Infra 账户的 Workers 脚本部署权限和 `midscenejs.com` 区域的自定义域名管理权限；仅有 Pages 权限不足。CI 不应使用开发者的 Wrangler OAuth 凭据。

Wrangler 根据 `wrangler.jsonc` 管理 `midscene-badge` Worker 和 `badge.midscenejs.com` 自定义域名。发布后工作流检查首页及 `/e2e` 接口。
