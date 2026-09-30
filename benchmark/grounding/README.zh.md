# Grounding 测评

[English](./README.md)

使用当前仓库构建的 `@midscene/core` `Agent.aiLocate`，评测固定的
**Web v4.7 + Mobile v4.6，共 200 题**。运行器和交互报告迁自
`midscene-evaluation`，运行时无需另一个评测仓库或后台服务。

## 快速开始

在仓库根目录执行（Node、pnpm 版本遵循根目录 `package.json`）：

```sh
pnpm install --ignore-scripts
pnpm exec nx build @midscene/core
cd benchmark/grounding
cp .env.example .env
# 编辑 .env，填写模型、地址和 key。
pnpm validate:data
pnpm evaluate --env-file .env
```

默认跑全部 200 题，每题一次，使用原始 HD 图片、原 query、`aiLocate`、
`deepLocate=false`。SDK 固定来自本仓库 `packages/core/dist/es/index.mjs`，
**修改 core 后需要重新构建**。首次运行自动构建报告模板，也可提前执行
`pnpm build:report-template`。在 `benchmark/` 目录可直接运行：

```sh
pnpm --dir grounding evaluate --env-file /absolute/path/model.env
```

### 冒烟与筛选

```sh
pnpm evaluate --env-file .env --platform web --category basic --limit 1
pnpm evaluate --env-file .env --platform mobile --category refusal --limit 1
pnpm evaluate --env-file .env --concurrency 3 --run-id my-grounding-run
```

`--cases ID,ID` 指定题目，`--output-dir PATH` 改变运行产物的根目录。
已有结果的 run ID 禁止覆盖。模型配置错误、缺失题目、无效 GT 或数据哈希变化
会直接报错，不会悄悄跳过。完整参数见 `pnpm evaluate --help`。

### 模型配置

必填：`MIDSCENE_MODEL_NAME`、`MIDSCENE_MODEL_FAMILY`、
`MIDSCENE_MODEL_BASE_URL`、`MIDSCENE_MODEL_API_KEY`。env 文件仅作为配置解析，
不执行 shell 内容。`--model NAME --family FAMILY` 可覆盖模型；
`--api-type responses` 使用 Responses，`--api-type chat-completions` 使用
Chat Completions。env 文件支持 `MIDSCENE_MODEL_PROTOCOL=openai-responses`
或 `openai-chat`，也兼容旧的 `MIDSCENE_MODEL_API_TYPE=responses`。
显式 protocol 优先于旧配置，CLI 参数覆盖两者。模型 JSON 支持同值的
`protocol` 字段，也兼容 `apiType: "responses"`。报告记录实际传给 SDK 的
`MIDSCENE_MODEL_PROTOCOL`。可用模型及协议仍取决于供应商和当前 SDK。

对于提供 `/v2/crawl` 的 ModelHub 通道，可以启用本地转发：

```sh
pnpm evaluate --env-file /absolute/path/modelhub.env \
  --model qwen3.7-plus --family qwen3 --modelhub-crawl
```

base URL 填 `/v2/crawl` 之前的地址。转发器仅监听本机，将 SDK 的
Chat Completions 请求原样转发，key 仅保存在内存中。报告会脱敏；报告中的
本地临时端口仅用于记录，不能用于重跑。

多个模型合并报告：复制 `examples/models.example.json` 到 Git 忽略的
`_private/` 目录，填写模型与认证配置，然后执行：

```sh
pnpm evaluate --config examples/run-config.json --models-file _private/models.json
```

空的模型、题目选择表示全部已配置模型、全部 200 题。并发数按 provider 控制，
不是所有 provider 的总并发。LangSmith 默认关闭；显式开启时需自行提供
`LANGSMITH_API_KEY` 或 `LANGCHAIN_API_KEY`。

## 数据与计分

| 平台 | Basic | Functional | Reason | Refusal | 合计 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Web v4.7 | 30 | 40 | 25 | 5 | 100 |
| Mobile v4.6 | 30 | 40 | 25 | 5 | 100 |

来源、许可、抽样与审计信息见 [DATASET.md](./DATASET.md)。原始 `index.json`
和截图按字节保留，运行前校验 SHA-256；数据目录不参与自动格式化。此集合不含 PC。

- 正常定位：预测点落在原 GT 框内即正确。
- Refusal：仅 SDK 解析器明确返回 `not-found` 时算正确；API 404、超时、
  解析失败都不能当作正确拒答。
- 所有 API/解析失败保留在计划分母中。未执行项单列为待执行，未完成运行不宣称最终成绩。
- 调用成功与答案正确分开统计，返回有效但错误的点仍算答案错误。

本次 core 改造为错误路径增加明确拒答标记，不修改 query、GT、坐标解析和定位提示词。
以前 SDK 版本的历史成绩不等于本仓库重新测出的成绩。

## 报告产物

每轮写入 `output/runs/<run-id>/`：

| 文件 | 内容 |
| --- | --- |
| `report.html` | 截图、数据、JS、CSS 全内嵌的交互报告，可单文件分享 |
| `report-live.html` | 读取同目录结果文件的进度报告 |
| `results.json`、`state.json` | 逐题预测、错误、计分、进度、版本记录 |
| `run-config.json` | 本轮标准化配置，不含模型认证信息 |
| `dataset-snapshot.json`、`images/` | 本轮题目来源信息及原始截图副本 |
| `midscene-main.diff` | 运行时 core 相对 `origin/main` 的差异 |

报告保留模型对比、GT/预测框、逐题详情，支持 Web/Mobile 和四分类统计与筛选。
保留全部原图的 200 题 HTML 约 300 MB。可离线从结果重新生成报告，无需调用模型：

```sh
pnpm report output/runs/<run-id>/results.json
```

查看进度报告需在 run 目录启动本地 HTTP 服务，例如
`python3 -m http.server 8000 --bind 127.0.0.1`，保留同目录 JSON 和图片。
完成版 `report.html` 可直接打开，不依赖外部图片、脚本或样式。

## 开发校验

```sh
pnpm validate:data
pnpm typecheck
pnpm test
```

集成测试通过本地 HTTP 固定响应服务调用真实本地 SDK，覆盖定位命中、错误拒答、
正确拒答、API 失败分母、产物、脱敏和重复 run ID；不会调用外部模型。
core 定向测试在仓库根目录执行：

```sh
pnpm exec nx test @midscene/core -- tests/unit-test/grounding-locate-not-found.test.ts tests/unit-test/task-runner/index.test.ts
```
