# 示例模板清单

`test/` 包含 Web、Android、iOS、HarmonyOS 和 Computer 五个 `midscene-test create` 起步模板，均使用 `@midscene/test`。CLI 只打包 `manifest.json` 中标为 `create` 的模板。

Web 模板参考 TodoMVC Test Runner 示例，包含确定性的初始化、校验、状态记录 Node，以及 AI 用例。设备和桌面模板参考 `midscene-example` 中的 TodoMVC 用例。manifest 记录了每个模板的参考用例及提交。其他集成示例继续留在 `midscene-example`，不进入 `create`。

每条用例先通过 `todo.setup` 准备 All 视图。Web 自动清理存储并通过 DOM 校验空列表后初始化任务；设备和桌面模板用 AI 检查空列表，未就绪时停止并提示手动清理。所有模板均串行运行，首次用例失败即停止后续用例。

生成的示例项目放在 `midscene-example` 第一层，目录名由 manifest 的 `examplePath` 指定。提交模板改动、确认对应版本的包已发布后，从 Midscene 主仓库执行以下命令，同步到已存在的 `midscene-example` 检出目录：

```sh
pnpm run examples:sync -- --target ../midscene-example --version <已发布版本>
pnpm run examples:sync -- --target ../midscene-example --check
```

相对目标路径以调用 pnpm 时所在的目录为准。目标必须是仓库根目录，且至少有一个 remote 指向 `web-infra-dev/midscene-example`；使用 fork 时，请把官方仓库添加为 upstream remote。目录不存在或指向其他仓库时，命令会在写入文件前报错。

同步命令把来源提交和生成文件哈希写入 `.midscene-generation.json`。受管项目目录里若有人工修改或额外源文件，命令会报错；`.env`、锁文件和 `node_modules` 等本地安装产物不受影响。执行 `--check` 时应检出记录的来源提交。把旧示例集中到 legacy 目录属于 `midscene-example` 仓库的后续改动。

模板以 `gitignore` 保存忽略规则，确保包管理器将其包含在发布压缩包中。create 和同步命令生成项目时都会将文件名还原为 `.gitignore`。
