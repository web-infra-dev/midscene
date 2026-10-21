# Grounding 跑分

该 Vitest 测试套件对 `../testcases` 中的每个用例执行一次 `aiLocate`，使用原语言指令和原始截图。预测点的中心落在 `[top, right, bottom, left]` Ground Truth 边界内（含边界）时判为正确；`REFUSAL` 仅在 `aiLocate` 明确报告未找到目标时判为正确。

在仓库根目录安装工作区依赖，配置 Midscene 模型环境变量，然后执行：

```sh
pnpm --dir benchmark/grounding-new/evaluation evaluate
```

至少配置 `MIDSCENE_MODEL_NAME` 以及该模型所需的 API 参数，例如 `MIDSCENE_MODEL_API_KEY` 和 `MIDSCENE_MODEL_BASE_URL`。如使用单独的定位模型，还需配置 `MIDSCENE_LOCATE_MODEL_NAME` 及其 API 参数。结果文件名优先使用定位模型名，否则使用默认模型名。

可用 Vitest 的名称筛选参数只运行单题：

```sh
pnpm --dir benchmark/grounding-new/evaluation evaluate -t GUI-MOBILE100-factors-v1-023
```

每次执行会创建 `output/<Date.now()>/<model-name>-<testcase-name>.json`。JSON 记录指令、Ground Truth、预测、正确性、耗时及执行错误。答错或执行报错时，会先写入 JSON，再使对应的 Vitest 测试失败。`output` 目录已被 Git 忽略；目前不生成汇总报告。
文件名中的模型名如含字母、数字、`.`、`_`、`-` 以外的字符，会将其替换为 `_`；JSON 内仍保留原模型名。
