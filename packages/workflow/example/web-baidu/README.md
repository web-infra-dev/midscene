# 百度首页检查

本项目使用 Playwright 启动 Chromium，并用 Midscene Web 检查百度首页是否正常加载。

模型配置从当前进程的环境变量读取。默认使用无头模式。设置 `HEADLESS=false` 可以显示浏览器窗口。

在仓库根目录运行：

```bash
packages/workflow/bin/midscene-workflow packages/workflow/example/web-baidu
```
