# npm Trusted Publisher 配置指引

本仓库的 `release.yml` 已改为使用 **npm Trusted Publishers (OIDC) + Sigstore
provenance** 发包，不再依赖长效 `NPM_TOKEN` secret。要让发布真正能跑通，每个
要发布的包都需要在 npmjs.com 上配置一次 Trusted Publisher。

## 一次性准备

1. **删除/吊销** GitHub 仓库里旧的 `NPM_TOKEN` secret（确认 workflow 已经
   不再引用它之后再删）。这一步避免长效 token 继续暴露，强制走 OIDC。
2. 确认 `web-infra-dev/midscene` 组织里所有要发布的包的 npm owner 包含一个
   有"Admin"权限的 maintainer 账号，并已开启 2FA — npm 要求 Trusted
   Publisher 由 admin 配置。

## 每个包都要做的事

登录 https://www.npmjs.com，进入 **Package settings → Publishing access →
Trusted Publishers → GitHub Actions → Add publisher**，按下面字段填写：

| 字段 | 值 |
| --- | --- |
| Organization or user | `web-infra-dev` |
| Repository | `midscene` |
| Workflow filename | `release.yml` |
| Environment name | *(留空)* |

> Workflow filename **只填文件名**，不要带 `.github/workflows/` 前缀。
> Environment 我们没有用 GitHub Environments 保护 release.yml，所以留空。

需要逐个配置的 26 个包（这是当前仓库里 `private !== true` 的全部）：

- `@midscene/android`
- `@midscene/android-mcp`
- `@midscene/android-playground`
- `@midscene/cli`
- `@midscene/computer`
- `@midscene/computer-linux`
- `@midscene/computer-mac`
- `@midscene/computer-mcp`
- `@midscene/computer-playground`
- `@midscene/computer-win`
- `@midscene/core`
- `@midscene/harmony`
- `@midscene/harmony-mcp`
- `@midscene/harmony-playground`
- `@midscene/ios`
- `@midscene/ios-mcp`
- `@midscene/ios-playground`
- `@midscene/mcp`
- `@midscene/playground`
- `@midscene/playground-app`
- `@midscene/recorder`
- `@midscene/shared`
- `@midscene/visualizer`
- `@midscene/web`
- `@midscene/web-bridge-mcp`
- `@midscene/webdriver`

> 这份列表用 `find packages -maxdepth 2 -name package.json` + `private` 判定
> 自动得到，下次新增/下线包记得同步更新本文件以及 npmjs.com 的 publisher 配置。

## 验证

1. 在一个临时分支上手动触发 `Release` workflow，`version` 选 `prepatch`。
2. workflow 跑到 `release` 步骤时观察日志里 `npm notice` 输出，正常应看到
   每个包都有 `Provenance` 段落，并打印 GitHub workflow run URL。
3. 发布后访问任一包的页面（如
   <https://www.npmjs.com/package/@midscene/core>），右侧会显示 "Provenance"
   徽章，点开能看到本仓库的 commit SHA 与 workflow 名称。

## 失败排查

- `403 Forbidden: ... You must be logged in` —— 多半是这个包没配
  Trusted Publisher，或者填写的 `repo` / `workflow filename` 不匹配。
- `404 Not Found: ... no trusted publisher` —— 同上。
- `provenance generation failed` 且日志提到 `id-token` —— 检查 release job
  里 `permissions: id-token: write` 是否保留；compose action 调用链上任何
  缺权限的步骤都会让 OIDC token 拿不到。
- `pnpm publish` 报 unknown flag `--provenance` —— 说明 `pnpm/action-setup`
  装到了 < 9.5 的版本，回 `release.yml` 检查 `version` 字段。
