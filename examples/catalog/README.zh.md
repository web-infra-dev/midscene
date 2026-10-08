# 示例模板清单

`test/` 包含 Web、Android、iOS、HarmonyOS 和 Computer 五个 `midscene-test create` 起步模板，均使用 `@midscene/test`。CLI 只打包 `manifest.json` 中标为 `create` 的模板。

Web 模板参考 TodoMVC Test Runner 示例，包含确定性的初始化、校验、状态记录 Node，以及 AI 用例。设备和桌面模板参考 `midscene-example` 中的 TodoMVC 用例。manifest 记录了每个模板的参考用例及提交。其他集成示例继续留在 `midscene-example`，不进入 `create`。

生成的示例项目放在 `midscene-example` 第一层，目录名由 manifest 的 `examplePath` 指定。提交模板改动、确认对应版本的包已发布后，在该仓库的本地检出目录执行同步：

```sh
pnpm run examples:sync -- --target ../midscene-example --version <已发布版本>
pnpm run examples:sync -- --target ../midscene-example --check
```

同步命令把来源提交和生成文件哈希写入 `.midscene-generation.json`。受管项目目录里若有人工修改或额外源文件，命令会报错；`.env`、锁文件和 `node_modules` 等本地安装产物不受影响。执行 `--check` 时应检出记录的来源提交。把旧示例集中到 legacy 目录属于 `midscene-example` 仓库的后续改动。
