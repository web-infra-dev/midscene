# 懂车帝示例

这个目录展示一条完整链路：维护事实输入，让 AI 生成 Test Runner Case，再用报告校正事实。

| 角色 | 文件 |
| --- | --- |
| 产品目标与预期结果 | [product-requirements.md](./features/ranking-filtering/product-requirements.md) |
| 页面入口与跳转知识 | [page-navigation.md](./app-context/page-navigation.md) |
| 排行榜组件使用知识 | [ranking-components.md](./app-context/ranking-components.md) |
| 生成 Agent 参考提示词 | [generate-cases-prompt.md](./features/ranking-filtering/generate-cases-prompt.md) |
| AI 生成的 YAML | [ranking-filtering.yaml](./test-runner/ranking-filtering.yaml) |
| 真实界面证据 | [AI 测试最佳实践](https://midscenejs.com/zh/test-runner-best-practices)中的截图 |
| Android 真机运行结果 | 运行后生成在 `midscene_run/report/` |
| 执行环境 | [midscene.config.ts](./midscene.config.ts) |

最佳实践及价格 Case 截图见 [AI 测试最佳实践](https://midscenejs.com/zh/test-runner-best-practices)。

先复制 `.env.example` 并填写模型配置，再连接并授权 Android 真机。以下命令都从仓库根目录运行：

```bash
cp packages/test/example/android-dongchedi/.env.example packages/test/example/android-dongchedi/.env
pnpm exec midscene-test describe-nodes packages/test/example/android-dongchedi
node --env-file=packages/test/example/android-dongchedi/.env packages/test/bin/midscene-test packages/test/example/android-dongchedi --project dongchedi-android
```

2026-08-28 已在 Android 真机完成复跑：5 个 Case 全部通过，未发生重试，总耗时约 14 分 41 秒。报告是运行产物，本 Demo 不将其提交到仓库。
