# Awesome Midscene

基于 Midscene.js 开发的社区项目精选列表，涵盖不同平台和编程语言的扩展功能。

## 社区项目

### [lhuanyu/midscene-ios](https://github.com/lhuanyu/midscene-ios)

iOS Mirror 应用的自动化支持工具

- 支持 iOS 应用程序的自动化测试和交互
- 将 Midscene 的跨平台能力扩展到苹果移动生态系统

### [lhuanyu/midscene-android](https://github.com/lhuanyu/midscene-android)

在 Android 设备上直接使用 Midscene 的自动化应用，无需通过 PC 连接 ADB 设备

- 输入自然语言指令即可操作设备上的应用，也可编辑和运行 YAML 脚本，在设备上查看执行报告与历史记录
- 通过悬浮进度提示查看任务状态，并可中断执行
- Agent 和执行环境运行在设备上，提示词与截图发送至用户配置的模型服务

### [Mofangbao/midscene-pc](https://github.com/Mofangbao/midscene-pc)

支持 Windows、macOS 和 Linux 的 PC 操作设备

- 支持跨所有主流平台的桌面应用程序自动化测试和交互
- 支持本地和远程操作能力

### [Mofangbao/midscene-pc-docker](https://github.com/Mofangbao/midscene-pc-docker)

预装 Midscene-PC 服务器的 Docker 容器镜像

- 基于 Ubuntu 20 和 GNOME 桌面，最大化应用程序兼容性
- 内置 VNC 服务，支持通过浏览器监控桌面操作
- 一键命令即可在标准服务器上部署自动化客户端

### [Python51888/Midscene-Python](https://github.com/Python51888/Midscene-Python)

Python 版本的 Midscene SDK

- 为 Python 开发者提供 Midscene 的 AI 驱动自动化能力
- 支持与现有 Python 测试和自动化工作流程的集成

### [Master-Frank/midscene-java](https://github.com/Master-Frank/midscene-java)

Java 版本的 Midscene SDK

- 提供与 Python 版本类似的体验，适配 JVM 生态
- 易于整合到现有的 Java 自动化或测试流程

### [alstafeev/midscene-java](https://github.com/alstafeev/midscene-java)

Java 版本的 Midscene SDK

- 提供用于脚本化 Midscene 的 JVM 原生接口
- 无缝整合至现有的 Java 测试框架与自动化工作流程

### [KiritoKing/midscene-jev-runner](https://github.com/KiritoKing/midscene-jev-runner)

将 [Jev](https://typesafe.ai/) 决策模型接入 Playwright 和 Midscene Test 的浏览器自动化工具

- 将页面控件和可用操作整理为候选项，由 Jev 选择下一步动作与目标；需要填写文本时，再调用文本生成模型
- 可直接操作已有的 Playwright 页面，或作为 `jevAct` 步骤接入 Midscene Test，支持自定义任务完成条件校验

## 如何贡献

创建了扩展 Midscene.js 功能的项目？我们很乐意在这里展示！

要将你的项目添加到这个列表，请在 [Midscene 仓库](https://github.com/web-infra-dev/midscene) 中提交 issue，告知我们你的 awesome midscene 项目。

## 收录标准

Awesome Midscene 应当满足：
- 扩展或集成 Midscene.js 功能
- 积极维护中
- 有清晰的文档和使用示例
- 为 Midscene 社区提供价值

---

*没有看到你喜欢的平台或语言支持？考虑创建一个社区项目或为现有项目贡献代码！*
