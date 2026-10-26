# CLI 标签页操作

同一会话中的命令需要使用相同的连接模式：

```sh
midscene-web tabs
midscene-web switch-tab --id <子标签页ID>
midscene-web take_screenshot
midscene-web switch-tab --id <父标签页ID>
```

`tabs` 返回 JSON 数组，包含 `id`、`title`、`url` 和 `active`。`active` 表示 Midscene 当前操作的页面。点击会打开新标签页的链接之前，先记下父页面 ID；点击之后，再用 `tabs` 找到子页面。如果网站延迟打开页面，等页面出现后再次执行 `tabs`。ID 对应已有标签页，切换不会重新导航或刷新页面。目标不存在或已关闭时，命令会报错。

CLI 会保留弹出的新页面，不再关闭新页面并让父页面跳转到对应 URL。Puppeteer 和 CDP 模式复用已有的 BrowserAgent，关闭自动跟随新页面的行为。`switch-tab` 保存选中的目标，后续 CLI 命令继续操作该页。自然语言 `act` 也可以使用 BrowserAgent 的页面操作能力，命令退出时会保存最后操作的页面。

CDP 模式需要在每条命令中传入 `--cdp <endpoint>`，也可以设置 `MIDSCENE_CDP_ENDPOINT` 并传入 `--cdp`。Bridge 模式需要在每条命令中传入 `--bridge`。Bridge 列出当前 Chrome 窗口的标签页，切换时激活目标页，后续 CLI 命令连接前台标签页。因此，手动切换前台标签页也会影响后续 Bridge 命令。本功能需要更新 Midscene 扩展；从源码测试时，请重新构建并加载扩展。

`disconnect` 断开连接。Puppeteer 模式的 `close` 会关闭整个浏览器，不是只关闭当前标签页。
