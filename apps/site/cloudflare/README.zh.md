# 根域名跳转

`redirects.mjs` 管理 `midscenejs.com` 的三条有序 Cloudflare Single Redirect
规则。所有跳转均使用 HTTP 301，目标为 HTTPS `www.midscenejs.com`，并保留查询参数。

- 中国大陆（`ip.src.country eq "CN"`）：`/` → `/zh/`，文档路径 → `/zh` + 原路径。
  已有 `/zh/` 前缀的路径保持中文路径。
- 所有地区的 `/zh` 直接跳到 `/zh/`，避免站点再补一次尾斜杠。
- 其他访问保留原路径。共享资源 `/images/`、`/static/` 和根目录元数据文件不添加语言前缀。

规则仅匹配根域名，不改变 `www`、其他子域名和 Pages 预览域名的行为。
`docs/public/_redirects` 中的旧页面规则仍独立生效；旧网址可能还需要跳转一次到替代页面。

## 部署

`Site redirects` 工作流验证 PR，在改动合入 `main` 后部署，也可在 `main` 上手动触发。

合入前需配置仓库：

- 变量 `CLOUDFLARE_ZONE_ID`：`midscenejs.com` 的 zone ID。
- Secret `CLOUDFLARE_API_TOKEN`：需要读取该 zone 的 ruleset 和编辑 Single Redirects
  的权限。现有 Pages 部署 token 可能需要补充权限。
- 根域名 DNS 必须开启 Cloudflare 代理。根域名与 `www` 都需已有可用的 TLS 和 DNS。
  脚本不修改 DNS 或 TLS 设置。

若跳转阶段入口不存在，`deploy.mjs` 会创建入口；否则仅更新或新增三个稳定的
`midscene_apex_*` ref，并将其放在现有规则之前，保留其他规则及其相对顺序。
这样根域名的请求就不会先命中已有的中国地区跳转。写入后会回读并核验规则内容和优先级。
部署期间应避免同时在控制台手动修改规则。

手动部署时，提供上述两个环境变量并执行：

```sh
node apps/site/cloudflare/deploy.mjs
```

部署后，分别从中国大陆及其他地区检查响应状态与 `Location`。
客户端设置 `CF-IPCountry` 请求头不能模拟 Cloudflare 的 `ip.src.country`。
中国大陆访问 `/` 应直接收到 `301 Location: https://www.midscenejs.com/zh/`。

参考：[Single Redirects API](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/create-api/)、
[规则排序](https://developers.cloudflare.com/ruleset-engine/rulesets-api/update-rule/)。
