# Grounding Benchmark 设计与技术方案

更新日期：2026-11-13。

本文描述已实现的 Grounding Benchmark SDK、CLI、页面、数据契约和构建方式。以下行为、默认参数及产物格式是当前实现约定。

## 1. 目标与边界

`@midscene/benchmark-grounding` 提供题库加载、查看、模型测评和报告生成能力，可被其他包作为 SDK 调用，也可由本包 CLI 调用。

| 能力 | 输入 | 输出 |
| --- | --- | --- |
| Viewer | 题目集合 | 只读题库页面，默认通过 CLI 启动并打开浏览器 |
| Runner | 题目集合、模型调用配置、模型 metadata、执行参数 | 独立题目与 metadata 快照、逐题结果 |
| Reporter | 某次运行目录中的快照和结果 | 可通过 `file:///` 独立打开的单文件 HTML |

已确认的边界：

- 本包与旧 benchmark 工程在构建、发布和运行时相互独立，不建立跨工程代码引用、路径依赖或数据同步逻辑。现有 viewer 仅作为界面风格参照，样式由本包独立维护，Logo 和 favicon 使用现成的公开图片 URL。
- Viewer 与 Reporter 的页面风格必须与当前 `benchmark/grounding-new/viewer` 一致。允许用 CSS、Less 或必要的轻量组件／样式库重写，但实现方式不能改变视觉风格。
- `runBenchmark` 以入口接管的原始文件字节为唯一数据来源。实际校验、快照、模型指令和图片、GT 及一致性记录均从这一份运行数据产生，接管后不再读取调用方可变对象或源题库。
- `src` 仅提供可调用的方法，通过函数参数接收配置，不加载 `.env`，不读取或修改环境变量来切换模型。
- 单次尝试使用 `timeoutMs`，与 `durationMs` 使用同一计时起点和耗时口径；`durationMs >= timeoutMs` 即为超时，立即返回失败，不等待厂商请求或清理结束，也不为取消请求修改其他 Midscene 包。
- `retries` 默认值为 `2`，表示首次执行之外最多重试两次，即每个模型／题目组合最多执行三次。只重试可恢复的执行错误，不重试有效定位或明确拒识所产生的错误答案。
- CLI 负责环境变量、参数解析、终端交互、启动服务和打开浏览器。
- CLI 的 `run` 完成测评后默认使用与独立 `report` 命令相同的逻辑生成并打开静态报告。两者都可用 `--no-open` 关闭自动打开；`run --no-report` 同时跳过生成和打开。此编排留在 CLI，`runBenchmark` 仅负责测评与结果落盘。
- `createViewer` 接收题目集合及可选的 `imageBaseUrl`，不提供标题参数。默认内嵌图片；CLI 传入本地图片路由前缀，按需读取原图。每次页面刷新均重新加载题库并调用该方法，不复用上次请求的题目数据或 HTML。
- `runBenchmark` 在执行前接收自定义 metadata，与 presets 合并后，按本次参测模型注入公开调用身份并保存独立快照；reporter 只读取该快照，不再接收 metadata 或读取当前 presets。
- CLI 的模型调用配置和自定义 metadata 都只允许来自环境变量，包括 `.env` 和命令行环境变量赋值，不接受 JSON、TS、JS 等配置文件。
- 公司测试用例及测评数据不得上传 Hugging Face，也不默认使用其他公开托管服务。
- 不增加截图压缩、图片分片、公开托管或题库缓存系统。HTTP Viewer 通过本地服务按需读取原图；静态报告内嵌代码、样式、题目截图及测评数据，Logo 和 favicon 可通过网络加载。
- 使用 TypeScript、React 和成熟 SDK；主要流程按顺序写在所属文件中，不建设额外的 service、repository、provider 或插件框架。
- 本阶段不设计跨 benchmark 的通用框架；后续系列包出现明确共性后再决定是否提取。

## 2. 数据和身份

### 2.1 Testcase

每道题由独立目录保存：

```text
testcases/<testcase-name>/
├── index.json
├── index.sha256
└── image.png 或 image.jpg
```

`index.json` 的顶级字段顺序及含义：

| 字段 | 含义 |
| --- | --- |
| `schemaVersion` | 数据格式版本，从 `1` 开始的正整数，仅随格式变化递增 |
| `name` | 题目名称，与目录名一致 |
| `platform` | `web` 或 `mobile` |
| `category` | `item` 分类和字符串类型的 `reason` |
| `instruction` | `{ en, zh }` 双语指令 |
| `instructionLanguage` | 本题实际执行时选择的指令语言 |
| `groundTruth` | 原图像素坐标 `[top, right, bottom, left]` 或字符串 `REFUSAL` |
| `reference` | 来源、图片格式及 SHA-256、原始到终态的修订说明、收录时间等 |

`index.sha256` 保存 `index.json` 原始文件字节的 SHA-256，生成格式为 64 位小写十六进制值加一个换行。它不是解析 JSON 后重新序列化得到的哈希。修改内容或格式化 JSON 后都需要重新生成。

第一版仅支持 testcase `schemaVersion: 1`，遇到未知版本明确报错，不猜测字段含义或自动升级格式。

### 2.2 模型调用配置

模型调用配置传给 runner，不承担报告价格、性能或视觉样式的配置职责。

| 字段 | 用途 |
| --- | --- |
| `baseUrl` | 模型服务入口 |
| `apiKey` | 调用凭据，仅用于请求 |
| `name` | 实际 API 模型 ID |
| `family` | Midscene SDK 适配器 |
| `displayName` | 展示名称及 metadata 匹配键；省略时统一补为 `name` |
| `protocol` | 可选协议，如 `openai-chat`、`openai-responses` |
| `reasoningEnabled` | 可选的 `boolean \| 'default'`，明确交给 SDK 处理；省略或 `'default'` 保留 SDK 默认行为 |

必要的其他 SDK 调用选项后续根据实际支持情况补充，不在本包另写供应商协议适配层。

一次运行中的有效 `displayName` 必须唯一。输出目录名经过文件名转换后也必须唯一，否则执行前报错。模型身份和 metadata 匹配始终使用有效 `displayName`，不根据目录名或模型名前缀推断；结果中的身份必须与 metadata 快照一致。

Runner 和 Reporter 使用同一安全文件名规则推导模型结果目录：`displayName.replace(/^\.+$|[^a-zA-Z0-9._-]/g, '_')`，并按忽略大小写的目录名检查唯一性。目录名不作为 metadata 字段保存。

### 2.3 模型 metadata

`ReportMeta` 只描述公开的报告参考信息，与 API Key、Base URL 等连接配置分离。调用方通过 `runBenchmark({ meta })` 传入；`meta` 及其 `models`、`families` 均可省略，未提供的条目使用 presets。

这是调用输入的结构，调用方无需在 metadata 中填写模型调用身份。runner 从实际 `models` 配置中提取身份并注入 `meta.json.models`，只保存本次参测模型；持久化结构见第 4.2 节。

```ts
const meta = {
  models: {
    'my-model': {
      displayFamily: 'Example Family',
      reference: {
        source: 'Public reference source',
        url: 'https://example.com/model',
        observedAt: '2026-11-12T00:00:00Z',
        pricing: {
          currency: 'USD',
          inputPerToken: 0.000001,
          outputPerToken: 0.000005,
        },
        performance: {
          timeToFirstTokenMs: 1000,
          outputTokensPerSecond: 100,
        },
      },
    },
  },
  families: {
    'Example Family': {
      color: '#9363d8',
      logo: 'local-logo.svg',
    },
  },
};
```

以上数值仅用于说明结构，不是任何模型的实际参考值。

- `models` 的键就是 `displayName`，不维护额外的别名映射。
- `displayFamily` 精确对应 `families` 的键；它与调用配置中的 SDK `family` 是两个概念。
- 价格分别记录输入、输出单 Token 价格。支持 USD；CNY 需要同时记录汇率及其来源、时间。价格来源和适用条件由引用信息说明。
- 性能提供 TTFT 与输出吞吐量，或完整响应延迟；根据实际提供的指标计算估算耗时，不另设性能类型或分位标记。
- 预设位于 `src/presets`，保存已知模型、家族及公开 Logo URL，不包含连接配置或内部凭据。Logo 直接使用 `metadata.json` 中的 HTTPS 地址，图标集 CDN 锁定版本。
- presets 视为合法数据，直接导出 `metadata.json`，运行时仅校验外部自定义 metadata；`runBenchmark` 在首次 `await` 前独立捕获覆盖合并结果。`models` 按 `displayName`、`families` 按家族名称整条覆盖，不引入递归合并规则，自定义同名条目中未填写的字段不会从原条目补回。
- 本次参测模型的合并 metadata 与公开调用身份保存为独立快照。HTTP(S) Logo 地址和已有图片 data URI 原样保存；自定义本地 Logo 在运行开始时读取并转为 data URI，不保留调用方对象、本地文件路径或对当前 presets 的依赖。
- 合并后仍缺少 metadata 的模型展示 Score、实测耗时和用量；依赖参考数据的估算显示 `—`。

## 3. 核心方法

以下 TypeScript 签名用于表达设计契约，实际类型优先从 Zod schema 和 SDK 现有类型推导。

### 3.1 `loadTestcases`

```ts
async function loadTestcases(
  options: {
    directory?: string;
    names?: string[];
    onProgress?: (progress: {
      name: string;
      testcaseSha256?: string;
      error?: Error;
    }) => void;
  } = {},
): Promise<
  Array<{
    testcase: Testcase;
    testcaseSha256: string;
    files: Record<string, Buffer>;
  }>
>;
```

`directory` 省略时使用本包自带题库，相对路径按当前工作目录解析。`names` 是可选的题目名称过滤器，按完整名称精确匹配，不解释为 glob 或正则表达式。

- 不传 `names` 时，加载并校验目录中的全部题目。
- 传入 `names` 时，只加载并校验选中的题目；未选中题目的文件内容不读取、不校验。
- 指定名称不存在、名称重复或选择集合为空时明确报错，不静默忽略。
- 返回顺序始终按题目名称字典序排列，不受 `names` 的传入顺序影响。
- `onProgress` 是可选的同步回调，每道选中题目检查完成后调用一次；`error` 省略表示通过，并提供已校验的 `testcaseSha256`，即 `index.json` 的完整 SHA-256。失败时不提供散列值。题目并行检查，回调按题名字典序触发；前序题目完成后即可输出，不必等待整批检查结束。SDK 本身不输出日志。
- 单题失败不会中断其他题目的检查。全部完成后，如有失败，抛出包含逐题诊断的 `AggregateError`，`errors` 按题名字典序保存各题错误，不返回部分成功集合。错误保留原始 `cause`，缺失文件明确指出题号和文件名。
- 根目录不可读、空选择或重复名称属于整体输入错误，立即抛出。

每条返回记录包含：

- `testcase`：`index.json` 解析后的完整对象，不补写或改动字段。
- `testcaseSha256`：从 `index.sha256` 读取并去掉首尾空白后的值。
- `files`：`index.json`、`index.sha256` 和原图三个文件的原始字节。图片键为 `image.png` 或 `image.jpg`。

以下将这条包含解析对象、SHA 和原始文件字节的记录称为 `LoadedTestcase`。其中 `testcase` 便于调用方查看和筛选，runner 的实际执行数据须从它接管的文件字节重新解析，不能将调用方可修改的解析对象作为另一份独立事实来源。

执行流程：

1. 枚举根目录下的题目子目录，普通文件不视为题目。
2. 根据 `names` 确定本次加载范围，检查选择非空且无重复；逐题检查目录及名称是否合法。
3. 读取选中题目的 JSON、SHA 文件和图片，将原始字节保存在内存中。
4. 校验 JSON 结构、受支持的格式版本及目录名与 `name` 的一致性。
5. 校验 SHA 文件的内容，并比较 JSON 原始字节的实际 SHA-256。
6. 比较图片实际 SHA-256 与 `reference.image.sha256`。
7. 通过 Shared 的 `getSharp()` 直接读取原始图片 Buffer 的 metadata，校验尺寸、GT 的结构、坐标顺序及原图边界；拒识题仍须有合法截图。校验不将原图转换为 Base64，也不改写图片。
8. 本次选中的题目全部通过后，按名称字典序返回完整集合。

目录不存在、题库为空、文件缺失、数据不合法或任意哈希不匹配时整体抛错，不返回部分成功集合。

该方法不写快照、不调用模型、不修改源文件、不重生成 SHA，也不自动修正或迁移题目。校验范围是结构和文件一致性，不代替人工检查题意与答案的正确性。

### 3.2 `runTestcase`

```ts
async function runTestcase({
  testcase,
  model,
  timeoutMs,
}): Promise<AttemptResult>;
```

执行一个模型与一道题的一次尝试，不承担批量调度、外层重试或输出目录管理。

`testcase` 参数是包含 JSON、SHA 和图片字节的 `LoadedTestcase`，不是只有 JSON 字段的 `Testcase`。由 `runBenchmark` 调用时，仅接收其私有、已校验的运行记录；该方法不从原题库或调用方保存的路径重新加载文件。

`timeoutMs` 覆盖本次尝试的整个执行过程，与 `profiling.durationMs` 使用同一计时起点和耗时口径。从 `runTestcase` 开始执行计时，到最终判定并返回结果时截止，不包含排队、外层重试间隔或结果写盘。

- 从运行记录中取出 `instruction[instructionLanguage]` 作为实际指令，GT 也取自该记录。
- 使用同一运行记录的原图字节构造静态截图 Agent，交给 `aiLocate`；通过显式 `modelConfig` 传参，不通过修改环境变量切换模型。
- 返回定位、拒识或执行错误，以及该次尝试的 SDK 用量和耗时。
- Jev 必要的模型输入缩放只从同一私有原图派生，快照原图、原始 GT 和图片 SHA 均不改变。预测点和框按实际缩放前后的宽、高分别还原到原图坐标，不假定取整后的水平与垂直缩放比例完全相等。
- 定位点位于 GT 框内且包含边界时正确；拒识题只有明确拒识才正确。
- 只有明确的 `not-found` 属于 `REFUSAL`；调用失败、解析失败和超时不能冒充拒识。
- 正常路径完成 Agent 清理后判定结果，清理耗时计入本次尝试；若在此之前超时，则立即返回 `ERROR`，不等待清理完成。
- 返回前冻结本次输出和已获得的用量。超时后到达的响应不能将失败改成成功、补写用量或覆盖结果；后台清理与异常处理不得阻塞返回或形成未处理的 Promise rejection。

### 3.3 `runBenchmark`

```ts
async function runBenchmark({
  testcases,
  models,
  meta,
  outputDirectory,
  concurrency,
  retries,
  timeoutMs,
  onProgress,
}): Promise<{ directory: string }>;
```

`testcases` 是本次实际要执行的加载结果，可以由 `loadTestcases` 按名称选择，也可以是调用方进一步筛选后的子集。`models` 是调用配置数组。`meta` 是可选的 `ReportMeta`，省略时使用 presets。`outputDirectory` 显式指定输出根目录。

入口接管与一致性规则：

- 在首次异步等待前，同步复制本批题目的文件 Buffer 和用于交叉比对的解析对象，并记录当时的 SHA 字符串。Buffer 副本具有独立内存；后续流程只访问这些私有副本，不继续持有或读取调用方的可写引用。
- 对接管的 `index.json`、`index.sha256`、图片字节重新完成格式、哈希和图片边界校验，并从私有 `index.json` 字节重新解析出执行对象。
- 调用方提供的解析对象及 SHA 必须与接管的文件内容一致；例如只改了解析对象中的 prompt 或 GT、但未同步原始文件时，立即报错，不执行模型，也不静默采用其中一份。
- 后续保存快照、构造静态截图、选择实际语言指令、调用 `aiLocate`、按 GT 评分以及填写结果 `input`，均只使用这一份私有、已校验的运行记录。
- 同一道题在所有模型及全部重试中使用同一份运行数据。调用方或源目录在接管后发生变化，不影响本次运行。

主要流程按顺序实现：

1. 同步接管题目字节及交叉比对值，完成上述校验，并检查输入、题目及模型身份唯一性；将自定义 metadata 与 presets 覆盖合并，只保留本次参测模型的条目，再从实际调用配置注入公开身份。将本地 Logo 转为 data URI、保留 HTTP(S) 地址及已有 data URI。
2. 创建新的 run 目录；已有同名目录时拒绝覆盖。
3. 在开始模型调用前，保存本批题目的独立快照及合并后的 metadata 快照，全部写入完成后才开始执行。
4. 创建各模型的结果目录，建立模型与题目的执行队列。每道结果的 `input` 记录与 `meta.json` 一致的模型身份。
5. 调度 `runTestcase`，按规则重试，记录每次尝试。
6. 每个模型／题目组合完成后立即保存结果并通知 `onProgress`。
7. 全部模型／题目组合的结果写入完成后，返回运行目录。

进度回调传递 `completed`、`total`、模型展示名 `model`、`testcase`、`status`、`correct`、`profiling`、`attemptCount`，以及最终执行错误的可选 `error`。`profiling` 为全部尝试的聚合耗时和用量，`attemptCount` 包括首轮与重试；缺失用量保持缺失，不以零补齐。`error` 仅包含结果中已脱敏的错误信息。整个事件独立复制，调用方修改回调参数不影响落盘结果或后续执行。它不暴露 runner 私有的题目对象或文件 Buffer，不承载模型凭据，也不要求核心层打印或重绘终端。

该 SDK 方法在全部结果落盘后，仅返回 `{ directory }`，不计算跨题汇总或生成 HTML。runner 只写入 `meta.json`、独立的 `testcases` 快照和 `results`。CLI 的 run 命令收到返回值后，默认接续报告生成流程并打开报告。

### 3.4 `createViewer`

```ts
async function createViewer({
  testcases,
  imageBaseUrl,
}: {
  testcases: LoadedTestcase[];
  imageBaseUrl?: string;
}): Promise<string>;
```

装配只包含题库的页面，返回 HTML，页面品牌标题固定为 `Midscene Grounding Benchmark`，不接受自定义标题；浏览器页签标题可以附带当前页面或题号。复用报告的页面模板与展示组件；CLI 通过本地 HTTP 服务提供该 HTML 并打开浏览器。

该方法不启动服务、不打开浏览器、不写文件，也不增加评审、编辑或模型调用能力。它只装配传入的数据，不重新读取源题库或监听文件变化。

图片引用方式由 `imageBaseUrl` 决定：

- 省略时，将原图转为 data URI，返回可独立打开的 HTML。
- 提供时，HTML 使用该前缀下按题名寻址、携带图片 `sha256` 查询参数的 URL；调用方提供对应的只读图片服务。CLI 使用 `/images` 前缀，初始页面不包含全部截图的 Base64。

两种方式都校验接管的原始题目文件，不提供跳过校验或信任已加载数据的标记。`imageBaseUrl` 仅供 Viewer 使用；`createReport` 仍只接收 `runDirectory`，始终从运行快照内嵌图片。

每次页面刷新时，由 CLI 服务重新调用 `loadTestcases`，再将最新结果传给 `createViewer({ testcases, imageBaseUrl: '/images' })` 并返回 HTML。CLI 不缓存题目集合或生成后的 HTML，页面及图片响应均设置 `Cache-Control: no-store`；包构建时生成的 UI 模板可以复用。该行为不需要定时刷新或文件监听。

### 3.5 `createReport`

```ts
async function createReport({ runDirectory }): Promise<string>;
```

扫描本次运行目录中的 `meta.json`、独立 `testcases` 快照和 `results`，完成交叉校验，依据这些数据计算报告统计并装配 HTML。`evaluationId` 取运行目录的名称；参测模型集合与具体调用版本来自 `meta.json.models`，结果目录按各条目的 `displayName` 推导。

- 不读取当前包内题库来替换快照。
- 不接收 metadata 参数，不读取当前 presets，也不读取 CLI 的模型调用配置或 metadata 环境变量。metadata 快照缺失或格式不合法时明确报错，不以当前预设补齐。
- 校验 metadata 的模型 map 键与条目的 `displayName` 一致，并校验按安全文件名规则推导的结果目录唯一性。每个结果子目录必须对应一个参测模型；组内结果的 `input.model`、`input.family` 和 `input.displayName` 必须与对应 metadata 的 `name`、`family` 和 `displayName` 一致，拒绝未记录模型的额外结果目录。
- 核对结果 `consistency.testcaseSha256` 与独立题目快照的一致性；核对结果文件名、`input.testcase` 和所属模型分组，拒绝重复结果或没有对应题目快照的结果。
- 核对结果 `input` 的平台、实际语言指令和 GT 与快照一致；最终输出须等于最后一次尝试的输出，并按快照 GT 重新核对每次尝试的 `correct`。任一失配明确报错。
- 题目快照必须是独立的普通目录和三个原始文件，拒绝软链接；metadata 快照须包含完整的 `models`、`families`，Logo 可为 HTTP(S) URL 或图片 data URI，不接受本地文件路径。
- 每个参测模型的总题数等于题目快照数量，缺失数量由 metadata 中模型集合 × 题目矩阵与已有结果之差计算。有缺失时展示已保存结果，并显著标明缺失数量。结果目录为空或完全缺失的模型仍保留在报告中，其全部题目显示 `No result`。
- 报告嵌入本次运行保存的 metadata，使用快照中的 Logo 地址或 data URI，不下载 Logo。后续修改 presets 或调用方原始数据，不改变快照中的参考数据和 URL；远端图片内容不承诺冻结。
- 返回 HTML 字符串，由调用层决定保存位置及是否打开。

## 4. 独立快照与输出格式

### 4.1 快照必须物理独立

```text
<outputDirectory>/<run-id>/
├── meta.json
├── report.html（CLI run 默认生成）
├── testcases/
│   └── <testcase-name>/
│       ├── index.json
│       ├── index.sha256
│       └── image.png 或 image.jpg
└── results/
    └── <model-directory>/
        └── <testcase-name>.json
```

- run-id 使用开始时间的毫秒时间戳。
- `report.html` 由 CLI 在测评完成后生成；指定 `run --no-report` 或直接调用 SDK 的 `runBenchmark` 时不生成此文件。
- 快照写入的是 runner 入口接管并通过校验的同一批私有原始字节，不能先校验后再次从源路径复制，也不能改用调用方原始 Buffer。
- 题目的 JSON 和 SHA 文件不重新序列化或格式化，图片不改写或缩放。
- 不使用软链接或硬链接，不引用包内图片路径作为快照资源。
- runner 的执行对象由这些字节解析，实际指令、截图和 GT 均来自该对象及对应原图；reporter 只使用本次运行落盘的快照。内存中的运行数据与快照内容必须一致，不进行二次加载后替换。
- 原题库修改或删除后，快照及其执行、报告能力不受影响。
- 题目快照的文件内容与其 SHA 不一致，或结果引用的题目快照缺失时，后续一致性检查应报错，而不是静默替换或更新结果哈希。

### 4.2 Metadata 快照

`meta.json` 保存本次参测模型的实际调用身份及外部 `meta` 与 presets 覆盖合并后的参考 metadata。调用输入仍使用 `ReportMeta`；runner 注入身份后形成完整快照，生成报告时不重新执行合并。

- `models` 仅包含本次参测模型，键为有效 `displayName`，值中也显式保存相同的 `displayName`。`families` 的键是 `displayFamily`。
- 每个模型条目保存 `name`、`family` 和 `displayName`，分别对应实际调用的完整模型 ID、SDK 模型家族和有效展示名；可选 `protocol`、`reasoningEnabled` 按实际配置保存。`displayFamily`、`reference` 等参考字段取合并后的 metadata，不保存 `directory`。
- 身份字段由 runner 从实际模型调用配置白名单提取并最后写入，不能被参考 metadata 覆盖。调用方无需在 `ReportMeta` 中手填身份字段。
- Reporter 以这些模型条目为参测模型集合，按 `displayName` 推导的安全目录名读取结果；空目录或缺失目录不会使模型从报告消失。
- 合并结果转换为独立的 JSON 数据后保存，不与调用方继续共享可修改的对象。
- 预设直接导出 `metadata.json` 中的公开 Logo URL，图标集 CDN 使用固定版本；自定义 Logo 的相对文件路径按调用时的工作目录解析。
- 在运行开始时读取自定义本地 Logo 原始字节，并将其转为 data URI 写入 `families[*].logo`。HTTP(S) 地址及已有图片 data URI 原样保存，不下载远端图片；快照不保留本地 Logo 文件路径。
- `meta.json` 不包含 API Key、Base URL 或完整模型调用配置。
- 原始 metadata、本地 Logo 文件或 presets 后续修改、删除后，仅保留运行目录仍可重新生成报告；估算价格、性能、颜色及 Logo URL 不变。URL 指向的远端图片可能变化或不可用，不视为冻结的图片快照。
- 快照整体缺失或不合法时 reporter 报错；快照内某个模型没有参考价格或性能数据时，对应估算正常显示 `—`。

### 4.3 单题结果

```ts
{
  schemaVersion: 1,
  consistency: {
    testcaseSha256: '...',
  },
  input: {
    testcase: 'MOBILE-v1-001',
    model: 'api-model-id',
    family: 'qwen3',
    displayName: 'my-model',
    platform: 'mobile',
    instruction: '...',
    groundTruth: [0, 100, 100, 0],
  },
  output: {
    type: 'POINT', // 或 REFUSAL、ERROR
    correct: true,
    center: [50, 50],
    // 可选 rect、dpr 或错误信息
  },
  profiling: {
    // 全部尝试的耗时及可获得的 SDK 用量汇总
  },
  attempts: [
    // 每次尝试的 output 和 profiling
  ],
}
```

最终结果使用最后一次尝试的输出；每次尝试的记录独立保留。哈希直接记录执行前读取并校验的值，结束时不重新计算。

错误记录只包含必要的名称、代码和信息，不直接转储完整请求、认证头或模型调用配置。

`profiling` 保存 `durationMs`、`usageStatus` 及可获得的 `calls`、`totalPromptTokens`、`totalCompletionTokens`、`totalTokens`、`totalCachedInput`、`totalTimeCostMs`；`usageNote` 说明不完整用量的原因。最终结果汇总全部尝试，不把缺失字段补为零。

| `usageStatus` | 含义 |
| --- | --- |
| `complete` | 全部已观察请求均提供有效的输入、输出和总 Token 用量；Jev 使用 SDK 已校验的完整用量 |
| `partial` | 已获得部分用量，但至少一次请求字段不完整，或仅有无法验证原始完整性的 SDK 汇总 |
| `missing` | 没有可获得的 Token 用量；已观察到的请求数及耗时仍可保留 |

每个 Agent 通过自己的 `createOpenAIClient` 包装 SDK 提供的 transport，不修改全局 fetch 或其他包。非流式 Chat／Responses 响应从副本读取原始 `usage`：输入取 `prompt_tokens`／`input_tokens`，输出取 `completion_tokens`／`output_tokens`，总量取 `total_tokens`，缓存输入取对应 details 中的 `cached_tokens`。`calls` 统计实际观察到的请求；`totalTimeCostMs` 是这些请求的耗时合计，包含传输和响应读取，不表示纯模型计算时间。原响应仍交给 SDK 解析。

未经过该 transport 的调用保留 `onLLMUsage` 数据；Jev 正常输出采用已校验的完整用量，其他无法确认原始完整性的 SDK 回调标记为 `partial`。超时后到达的响应和用量不再写入本次结果。费用与参考耗时估算仅纳入全部尝试均具备完整所需用量的题目，已知的部分 Token 仍可用于诊断展示。

## 5. 调度、重试和超时

SDK 与 CLI 使用相同的当前默认参数：

| 参数 | 默认值 | 含义 |
| --- | --- | --- |
| `concurrency` | `64` | 全局同时执行的 `runTestcase` 尝试数量 |
| `retries` | `2` | 首次执行之外最多重试两次，最多执行三次 |
| `timeoutMs` | `60000` | 单次尝试的整体超时，与 `durationMs` 同口径，等待排队不计入 |

调度使用 p-queue，重试使用 p-retry，不另写任务池或重试框架。任务应覆盖全部模型和题目的组合，并避免按顺序等待每个入队任务而意外串行执行。

`concurrency` 是全局模型 × testcase 尝试的并发上限，不是模型数量，也不是每个模型各自的题目并发数。不同模型的任务交错入队；重试重新入队并共享同一并发上限，等待重试不占用执行名额。

### 5.1 重试口径

- 调用失败、超时和输出解析失败可以重试。
- 参数或题库结构错误不重试；明确的鉴权等确定性错误不反复请求。
- 有效预测即使答错也不重试，明确拒识同样不重试。
- SDK 请求级重试显式关闭，由 runner 统一控制，避免两层重试倍增。
- SDK 在一次定位内的实际模型调用数量如实记录，不能假设一次尝试必然只有一次 HTTP 调用。
- Token 和耗时汇总覆盖全部尝试，不能只保留最终成功尝试的成本。
- 不可获得的用量不伪造为零；缺失值及有效样本数量应在报告统计中保留。

### 5.2 超时行为（已确认）

`timeoutMs` 是整个单次尝试的超时，不是 SDK 单次 HTTP 请求的超时。即使一次定位涉及多个内部请求，它们也共用本次尝试的时间预算。

计时及判定规则：

1. `runTestcase` 开始时确定计时起点，正常完成与超时使用同一个经过时长计算。
2. 从图片准备、Agent 创建、模型调用到正常清理都计入 `durationMs`，排队等待、外层重试间隔和结果写盘不计入。
3. 一旦经过时长达到阈值，立即返回失败结果，`output.type` 为 `ERROR`，`correct` 为 `false`，错误信息明确标识超时。
4. 正常流程完成时也必须检查实际经过时长。即使超时计时器尚未得到执行，只要 `durationMs >= timeoutMs`，仍判为超时；恰好等于阈值也失败。
5. 判定和记录使用同一份实际经过时长，不将 `durationMs` 强行改成 `timeoutMs`，也不先对展示数值取整再判定。

超时返回不等待模型调用、Agent 清理或厂商请求真正终止。后台工作只能完成必要的清理与异常处理，不能再次写入该任务的测评结果文件、修改最终结果或将迟到的成功响应用于本次成绩。

runner 收到超时失败后，可按现有重试规则开始下一次尝试；新的尝试独立计时。调度按照已返回的任务状态释放并发名额，不以厂商请求是否真实结束作为条件。

本包不承诺取消厂商侧执行，不为实现这一超时行为修改其他 Midscene 包，也不以 SDK 是否开放取消接口作为实现前提。

## 6. Viewer 与 Reporter 界面

### 6.1 共用展示组件

两种页面复用 React、样式、题目筛选和截图标注组件，但不共用运行时数据文件或后端依赖。

Viewer 的数据来自调用方传入的题目；Reporter 的数据来自本次运行的独立快照。核心 UI 只消费已经装配好的数据，不推断包目录或运行目录。

两种页面的平台、分类、来源和预期结果筛选以 HashRouter 查询参数为唯一状态来源：`platform`、`category`、`dataset` 和 `outcome`，空值省略，不使用 localStorage。例如 `#/testcases/WEB-v1-001?platform=web&category=Basic+Element&model=my-model`。这四项变化时使用 replace 更新当前历史记录，刷新和浏览器前进／后退从 URL 恢复。搜索词只保存在页面本地状态，不写入或读取 URL，刷新后清空。

切题、上一题／下一题、键盘导航、模型切换及根路由重定向保留查询参数。清除筛选会清空本地搜索词，并只从 URL 移除上述四项，保留 `model` 等其他参数；深链接指定的已有题目不符合筛选时，回退到首个匹配题而不清空筛选，不存在的题目显示 `Testcase not found`。没有匹配题目时保留结构筛选，刷新后按保留的结构筛选重新计算结果。Overview 的模型详情和矩阵跳转会清空题库筛选及本地搜索，确保打开指定题目和模型。

Viewer 和报告的题库页面统一使用 `↑`／`↓` 切换上一题／下一题；报告中使用 `←`／`→` 切换当前题目的上一模型／下一模型。切换按当前题目和模型列表顺序进行，首尾不循环，选中的模型标签自动滚动到可见位置。Overview 不响应这些快捷键；输入框、筛选菜单和原尺寸截图的方向键保留其自身行为，已处理事件或带修饰键的操作不触发全局导航。

页面风格以当前 `benchmark/grounding-new/viewer` 为明确基准，要求一致，不另行设计一套近似风格。需要保留的视觉特征包括：

- Logo、标题、页签、筛选栏和导航层级的呈现方式。
- 字体、字号、颜色、背景、间距、边框、圆角、阴影和控件状态。
- 题库侧栏、详情区域、截图工具栏及 Ground Truth／预测标注的样式。
- 模型表现图表、胶囊标签、图例、Tooltip 和报告表格的样式。
- 表格表头、排序、滚动区域、卡片尺寸及响应式布局规律。

现有样式和视觉资源已移植到包内，React 组件按本包接口与字段组织。样式使用 CSS，未增加 Less 或额外组件库；图表使用 Recharts 并沿用现有视觉风格。

移植后的样式由本包独立维护、构建并内嵌到页面，品牌 Logo 和 favicon 使用 Midscene 官方图片地址，家族 Logo 使用 metadata 中的图片地址或 data URI；不在运行或构建时导入旧 viewer，也不要求旧工程继续存在。新增的逐题模型切换及报告内容沿用同一套视觉规范。

风格一致性针对本方案中对应的只读页面和控件，功能范围仍由 Viewer 与 Reporter 的契约决定，不额外引入候选题管理、评审编辑或多次测评管理功能。

验收时在相同视口下，以相同题目和模型结果对照现有页面，检查页面布局、控件、截图标注、图表和表格的风格一致性。样式内部重写不能改变这一验收要求。

### 6.2 Viewer

独立 Viewer 只提供题目浏览，不显示顶部页签导航。

保持只读题库查看器的核心能力：

- 按题目名称字典序浏览。
- 搜索，以及平台、分类、来源和定位／拒识筛选。
- 查看双语指令、分类依据和来源信息。
- 原图、GT 开关、缩放及适应画布。
- 上一题／下一题及键盘导航，顺序遵循筛选后的列表。

默认由 CLI 一个命令启动并展示。使用 Hono 本地服务提供页面，通过 open 打开默认浏览器；服务端只承担必要的数据和资源提供，不增加写 API。每次页面刷新都重新加载题库并生成 HTML，新增、修改或删除题目后无需重启 CLI。

HTTP Viewer 复用报告的内联脚本与样式模板，截图通过本地 `/images` 只读路由按需获取，不要求全部图片内嵌。每次图片 GET 都单独加载并校验对应题目的 JSON、SHA、图片格式、图片 SHA 和 GT 边界；请求中的 `sha256` 必须等于当前图片 SHA，不匹配时返回 `409`，提示刷新页面，避免旧页面的 GT 与已更新图片混用。SDK 默认生成的 Viewer 仍内嵌截图。

### 6.3 Reporter

报告包含两个视角：

1. `Overview`：报告默认首页，依次展示 Model Performance Overview、Model Performance Breakdown、Testcase Score Overview。
2. `Testcases`：第二个页签，查看本次实际执行的题目，并快速切换各模型的结果。

报告根路由默认进入 `#/overview`；独立 Viewer 默认进入 `#/testcases`。已有逐题深链接仍可直接定位题目和模型。

报告页顶部标题为 `Midscene Grounding Benchmark - Evaluation <run-id>`，Overview 不再单独重复显示测评编号；浏览器页签同步显示该标题。独立 Viewer 的顶部标题保持 `Midscene Grounding Benchmark`。

Reporter 的 UI 数据包含 `evaluationId`、由 metadata 快照确定的 `models`、题目快照、结果、metadata 和报告统计，不携带运行配置或执行状态对象。独立 Viewer 只需要题目数据。

逐题交互约定：

- 提供模型切换器及各模型通过、失败、错误和缺失状态。
- 切换模型时保持当前题目和图片缩放；切换题目时尽量保持所选模型。
- 原图同时展示 GT 和所选模型的预测点／框，用量和错误详情随模型更新。
- 点击矩阵单元格，进入对应题目并选中对应模型。
- 结果缺失显示 `No result`，不与预测错误混淆。

散点图沿用 Score 对平均估算模型耗时的展示方式、线性断轴及固定下方胶囊。模型图例可内嵌三维小雷达，不重新引入复杂退避和布线算法。

### 6.4 静态报告单文件约束

`createReport` 生成的静态报告必须是完整的一个 HTML 文件，内嵌：

- JavaScript 和 CSS；字体使用系统字体。
- 本次使用的题目、原图、GT 和修订信息。
- 测评结果、统计和实际采用的 metadata。

包构建时通过 Rsbuild 生成内联脚本和样式的页面模板；生成每份报告时只装配数据，不重复运行前端构建。

原图转为 data URI，每个 testcase 保存一份供全部模型共享。报告家族 Logo 直接使用 `meta.json` 中保存的 HTTP(S) URL 或 data URI，不下载图片、不读取当前预设或调用方的本地文件。品牌 Logo 和 favicon 使用 `https://midscenejs.com/favicon.png`，公开图标 URL 由浏览器加载。

嵌入数据应采用正确转义的 JSON，避免题目中的文本被解释为 HTML 或脚本。

使用 React Router 的 HashRouter，例如 `#/overview` 和 `#/testcases/WEB-v1-090?model=my-model`，不依赖服务端路由重写。

报告生成后不再依赖 Node.js、后端服务、本地 API、运行目录或当前包题库，用户复制一个 HTML 文件即可通过 `file:///` 直接打开。Logo 和 favicon 加载需要网络；题目截图、结果、图表计算和交互所需的脚本与样式均在文件内。来源链接供用户主动访问。

## 7. 统计口径

报告统计统一由 `core/summary.ts` 中的 `calculateSummary` 计算，返回类型为 `ReportSummary`，不在 reporter 和各组件之间复制公式。reporter 从运行目录中的题目、metadata 快照及结果计算统计，不使用生成报告时的最新预设；runner 不计算或保存跨题统计。

| 指标 | 当前口径 |
| --- | --- |
| Score | 正确结果数／已有最终结果数 × 100，范围 0–100，不显示百分号 |
| 错误 | 计入最终结果数，视为不正确 |
| 缺失 | metadata 中每个参测模型以题目快照数量为总题数；缺失不计入 Score 分母，独立显示数量；有缺失时必须显著标记 |
| Token、费用和实测耗时 | 有效非负样本的算术平均；零计入，缺失排除 |
| Token 用量 | 汇总全部尝试中可获得的 SDK 用量，不重复加算推理 Token |
| 估算费用 | 单题输入／输出分别计价，计入全部尝试，再对有效样本求平均 |
| 参考估算耗时 | 调用数 × TTFT + max(输出 Token − 调用数, 0)／输出吞吐量；单位统一后计算 |
| 提供完整响应延迟时的参考耗时 | 调用数 × 参考完整响应延迟 |
| Estimated Model Duration Avg. | min(参考估算平均耗时, max(实测平均耗时 − 100ms, 0)) |
| Speed | 60／平均估算耗时（秒），单位 cases/min，不乘 Score |
| Affordability | 1／平均估算费用（USD），单位 cases/$1，不乘 Score |

先分别计算参考估算和实测的平均值，再对这两个均值应用耗时修正；不能逐题取最小值后再求平均。缺少实测时使用参考估算；缺少参考性能时不产生该估算指标。

各指标独立记录有效样本数量。无法获得完整用量的失败尝试不得默认为零成本；报告需能体现用量缺失和估算覆盖情况。

参考性能是跨供应商统计或某次观测值，不作为实际服务性能保证。100ms 是固定近似值，不是实际测得的网络时延。实测均值为零、等于或小于 100ms 时，修正后的耗时为 0ms，零值不能作为缺失值排除；平均耗时或费用为零时，对应速率不生成无限值，显示 `—`。

P50 使用模型等权的原始指标中位数，在显示取整和雷达对数映射之前计算。筛选置灰不改变坐标范围或 P50 参考。

## 8. CLI

### 8.1 职责与技术选型

| 用途 | 当前技术 |
| --- | --- |
| 命令、参数、帮助和异步处理 | Commander.js |
| 配置和数据校验 | Zod，复用核心层 schema |
| `.env` 加载 | dotenv，仅 CLI 使用 |
| 打开浏览器或报告 | open |
| Viewer 本地服务 | Hono、@hono/node-server |
| CLI 展示 | tinyrainbow 提供统一运行标识、状态配色及层级；@clack/prompts 提供 spinner 和实时进度条 |
| 执行进度 | 订阅 `onProgress` 展示结果、耗时、输入／输出 Token、调用与尝试次数及用量覆盖 |

四个子命令分别定义在 `cli/validate.ts`、`cli/viewer.ts`、`cli/run.ts` 和 `cli/report.ts`；`cli/index.ts` 负责统一注册、帮助、版本和进程退出。每次调用创建新的命令实例，命令处理只完成参数读取、核心方法调用、文件输出和必要的服务管理。

所有子命令使用与 Vitest 测试过程类似的终端布局：运行标识、品牌及版本、当前工作目录、彩色 `✓ PASS`／`× FAIL`／`× ERROR` 状态和完成或错误提示。共用 `cli/output.ts` 的标题、状态行、耗时和多行输出格式；帮助信息也使用相同标题，`--version` 保持单行版本号。颜色按终端能力启用并尊重 `NO_COLOR`；仅交互终端显示实时进度条，重定向或 CI 输出保留完整静态日志。

run 默认在完成测评后接续报告生成；report 命令保留，用于独立生成、重新生成或重试报告。两个入口共用一处报告生成、文件输出及浏览器打开逻辑，默认在写入成功后打开报告，不启动另一个 CLI 进程。

Viewer 服务只保留题库目录和名称过滤器等启动参数，不把已加载的题目集合或生成后的 HTML 长期保存在请求处理函数外。每次页面请求依次执行 `loadTestcases({ directory, names })`、`createViewer({ testcases, imageBaseUrl: '/images' })` 并返回禁用缓存的 HTML，确保浏览器刷新时看到最新题库，同时保留启动时选择的题目范围。图片 GET 只加载并校验请求中的单道题，不复用页面请求的内存记录。

CLI 提供以下命令：

```sh
midscene-benchmark-grounding validate
midscene-benchmark-grounding viewer
midscene-benchmark-grounding run
midscene-benchmark-grounding report ./output/<run-id> --output report.html
```

以下命令、参数和默认行为均已实现。`src` 不替调用方选择进程退出方式。

### 8.2 模型调用配置与自定义 metadata 只来自环境变量

环境变量继续使用 `MIDSCENE_GROUNDING_EVALUATION_CONFIG`，值是包含 `models` 和可选 `meta` 的 JSON 对象。`models` 是模型调用配置数组，`meta` 与 SDK 的 `ReportMeta` 结构一致。JSON 只是环境变量值的编码格式，不是配置文件。

`.env` 示例：

```dotenv
MIDSCENE_GROUNDING_EVALUATION_CONFIG='{
  "models": [
    {
      "baseUrl": "https://example.com/v1",
      "apiKey": "your-api-key",
      "name": "api-model-id",
      "family": "qwen3",
      "displayName": "my-model",
      "protocol": "openai-chat"
    }
  ],
  "meta": {
    "families": {
      "Example Family": {
        "color": "#9363d8",
        "logo": "./logos/example.svg"
      }
    },
    "models": {
      "my-model": {
        "displayFamily": "Example Family"
      }
    }
  }
}'
```

- 命令行环境变量赋值或已有进程环境变量优先于 `.env`。
- `.env` 不应纳入版本控制。
- 不支持模型调用配置或 metadata 的文件参数，也不支持 `--api-key` 参数。
- CLI 加载、解析并校验环境变量后，将 `models`、`meta` 分别以普通对象传给 `runBenchmark`，合并 presets 和保存快照由 runner 负责。
- 模型 metadata 与连接配置保持独立字段；省略 `meta` 时 runner 使用 presets。上例仅提供家族归属与展示信息，整条覆盖后未填写价格、性能，相应估算显示 `—`。
- `report` 命令只接收运行目录及输出选项，不读取该环境变量，也不允许生成报告时重新指定 metadata。

### 8.3 `validate`：校验题库

```sh
midscene-benchmark-grounding validate
midscene-benchmark-grounding validate --testcases ./testcases --names MOBILE-v1-001 WEB-v1-001
```

| 参数 | 默认行为 | 含义 |
| --- | --- | --- |
| `--testcases <directory>` | 使用包内题库 | 题库根目录 |
| `--names <name...>` | 全部题目 | 按完整题目名称精确选择，空格分隔 |

复用 `loadTestcases({ directory, names, onProgress })`，校验 JSON 结构与格式版本、目录和题目名称、JSON SHA-256、图片 SHA-256、格式与尺寸，以及 GT 结构、坐标顺序和图片边界。不判断题目语义、指令歧义或 GT 是否指向正确元素。

本命令不加载 `.env`，不需要模型配置，不调用模型、不写文件、不启动服务或浏览器。按题名字典序逐题单行输出：通过项为绿色 `PASS 题号 SHA-256 <完整散列值>`，散列值对应 `index.json`；失败项为红色 `FAIL 题号: 原因`。支持终端超链接时，通过项与失败项的题名均可点击打开对应题目的 `index.json`；未检测到支持时，以该文件的绝对路径代替题名，供终端或 IDE 自动识别文件链接。默认链接指向包内题库，指定 `--testcases` 时指向该目录。逐题结果统一写入 stdout，避免分流导致显示乱序；失败摘要写入 stderr，不直接暴露原始文件系统错误。检查完全部选中题目后汇总通过数、失败数和总数；全部通过退出 `0`，有任意失败退出 `1`。根目录不可读或选择参数有误时直接给出整体输入错误。

### 8.4 `viewer`：查看题库

```sh
midscene-benchmark-grounding viewer \
  --testcases ./testcases \
  --names MOBILE-v1-001 WEB-v1-001 \
  --host 127.0.0.1 \
  --port 4319 \
  --no-open
```

所有参数均可省略：

| 参数 | 默认行为 | 含义 |
| --- | --- | --- |
| `--testcases <directory>` | 使用包内题库 | 题库根目录 |
| `--names <name...>` | 全部题目 | 按完整题目名称精确选择，空格分隔 |
| `--host <host>` | `127.0.0.1` | 服务监听地址；需要内网访问时显式传 `0.0.0.0` |
| `--port <port>` | `4319` | 服务端口 |
| `--no-open` | 启动后自动打开浏览器 | 指定后只输出地址，不自动打开 |

执行行为：

1. 显示品牌标题和题库校验 spinner，解析参数、验证题库，启动 Hono 只读服务。
2. 显示 Ready 耗时、Local 访问地址、题库及 Web／Mobile 数量，并提示只读、刷新读取最新题库及 Ctrl+C 停止。默认打开浏览器；监听 `0.0.0.0` 时浏览器使用本机可访问的地址。
3. 每次浏览器请求页面都重新加载选定题目并调用 `createViewer({ testcases, imageBaseUrl: '/images' })`，页面不内嵌全部截图，响应设置 `Cache-Control: no-store`。
4. 浏览器按需请求 `/images` 下的原图。服务端单题加载并完成文件、图片及 GT 校验后，核对 `sha256` 查询参数，再返回原始图片字节；SHA 不匹配返回 HTTP `409`，图片响应也禁用缓存。
5. 用户手动刷新即可看到最新题库。页面不定时刷新，服务不监听文件变化，也不使用上次生成的 HTML 回退。
6. 某次刷新校验失败时返回明确的错误页面和 HTTP `500`，服务继续运行，便于修复数据后再次刷新。

输出是持续运行的 HTTP 服务及终端中的访问地址，不写报告文件，不读取模型配置环境变量。端口占用时明确报错，不自动切换端口。按 Ctrl+C 停止服务。

### 8.5 `run`：执行测评

```sh
midscene-benchmark-grounding run

midscene-benchmark-grounding run \
  --output ./output \
  --testcases ./testcases \
  --names MOBILE-v1-001 WEB-v1-001 \
  --concurrency 64 \
  --retries 2 \
  --timeout-ms 60000
```

| 参数 | 默认行为 | 含义 |
| --- | --- | --- |
| `--output <directory>` | `./output` | 输出根目录，相对于当前工作目录；runner 在其下创建独立的 `<run-id>` 目录 |
| `--testcases <directory>` | 使用包内题库 | 与 viewer 相同的题库目录参数 |
| `--names <name...>` | 全部题目 | 与 viewer 相同的精确名称过滤器 |
| `--concurrency <number>` | `64` | 所有模型与题目共享的尝试并发上限 |
| `--retries <number>` | `2` | 首次尝试之外的最大重试次数 |
| `--timeout-ms <number>` | `60000` | 每次尝试的整体超时，单位毫秒 |
| `--no-report` | 完成测评后自动生成并打开报告 | 指定后仅执行测评并保存运行产物 |
| `--no-open` | 报告生成后自动打开 | 指定后生成报告，但不打开浏览器 |

环境输入仅为 `MIDSCENE_GROUNDING_EVALUATION_CONFIG` 中的 `{ models, meta? }`：

- 只为本命令加载当前工作目录下的 `.env`；已有进程环境变量优先。
- `.env` 可以不存在，只要进程环境变量已提供合法配置。
- 模型数组必须非空，全部配置在调用模型前完成校验。
- 省略 `meta` 时使用 presets；CLI 不自行合并 metadata。
- 不提供承载模型调用配置、密钥或 metadata 的命令行参数和其他配置文件。

执行行为：

1. 读取参数和环境变量，将命令行数字转换后校验；并发、超时为正整数，重试为非负整数。
2. 调用 `loadTestcases({ directory, names })`。
3. 调用 `runBenchmark({ testcases, models, meta, outputDirectory, concurrency, retries, timeoutMs, onProgress })`。
4. runner 完成独立题目和 metadata 快照后，执行模型 × 题目的全部组合。
5. CLI 根据进度回调逐项输出完成数量、模型名称、题目、状态、全部尝试的累计耗时、总／输入／输出 Token、尝试次数及请求次数。部分或缺失用量明确标注 `Usage partial`／`Usage missing`；零值显示 `0`，缺失值显示 `—`。执行错误显示已脱敏的原因，不打印密钥或完整连接配置。交互终端显示实时进度条，结果行输出期间暂停重绘。
6. 等待 runner 将全部结果落盘，输出完成提示、运行目录和测评阶段实际墙钟耗时，不输出跨题或逐模型汇总。单题耗时不包括排队和重试等待，测评墙钟耗时包含快照、排队和结果写入，不包括前置题库加载或后续报告生成。
7. 未指定 `--no-report` 时，使用返回的实际运行目录执行与独立 report 命令相同的报告生成及写盘流程，生成 `<run-directory>/report.html`。
8. 报告写入成功后输出其绝对路径，默认通过浏览器打开；指定 `--no-open` 时只输出路径。指定 `--no-report` 时同时跳过报告生成和打开，在测评完成后直接退出。

文件输出采用第 4 节的目录结构。自动报告读取已落盘的运行目录，经过与独立 report 相同的快照校验、统计、HTML 装配、文件写入和浏览器打开流程，不直接复用 CLI 内存中的题目、模型配置或 metadata。两者默认均在文件写入成功后打开报告，可用 `--no-open` 跳过；静态报告无需启动 HTTP 服务。

对于同一次测评，以下两种调用使用相同的报告生成逻辑、快照数据、默认输出位置和自动打开行为：

```sh
# 测评完成后自动生成并打开报告
midscene-benchmark-grounding run --output ./output

# 将同样的流程拆成两步
midscene-benchmark-grounding run --output ./output --no-report
midscene-benchmark-grounding report ./output/<run-id>
```

模型答错或重试耗尽后的模型 `ERROR` 不阻止自动报告。测评阶段抛错或用户中断时保留已有产物，不进入自动报告阶段；可以稍后独立生成报告，缺失项按 metadata 中的参测模型与题目快照统计。报告生成或写入失败时 CLI 退出 `1`，但快照和结果保持不变，用户可直接重试 report，无需重新调用模型。

### 8.6 `report`：生成单文件报告

```sh
midscene-benchmark-grounding report ./output/<run-id> \
  --output ./report.html
```

| 参数 | 默认行为 | 含义 |
| --- | --- | --- |
| `<run-directory>` | 必填 | 本次运行目录，包含题目快照、metadata 快照及结果 |
| `--output <file>` | `<run-directory>/report.html` | 要写入的 HTML 文件 |
| `--no-open` | 成功写入后自动打开 | 指定后只输出报告路径，不打开浏览器 |

执行行为：

1. 将相对路径按当前工作目录解析。
2. 调用 `createReport({ runDirectory })`，由核心层读取快照、验证一致性并装配 HTML。
3. 创建必要的输出父目录，将返回字符串写入指定文件；目标 HTML 已存在时更新该文件。
4. 输出报告的绝对路径，默认通过浏览器打开；指定 `--no-open` 时只输出路径。

上述报告生成、写文件和浏览器打开逻辑由独立 report 命令及 run 的自动报告阶段共同调用。自动阶段采用默认文件路径，两个命令均默认打开报告；`--no-report` 控制是否进入该阶段，`--no-open` 仅跳过打开。两者都是 CLI 参数，不作为 SDK 方法参数，`createReport` 自身仍只返回 HTML 字符串。

本命令不加载 `.env`，不读取模型配置或当前 presets，不调用模型，不启动 HTTP 服务，不重新执行前端构建。运行未完成时仍可生成明确标注缺失结果的报告；题目或 metadata 快照缺失、格式错误、一致性失配时明确失败。

### 8.7 公共行为和退出状态

- 提供 `--help` 和 `--version`；未传子命令时显示帮助，不隐式启动服务或调用模型。
- `validate`、`viewer` 和 `run` 的 `--names` 复用 `loadTestcases` 的规则：完整名称精确匹配、输出字典序，缺失、重复或空选择报错。
- 所有相对路径均按当前工作目录解析；各子命令负责参数转换，仅 `cli/run.ts` 加载模型环境变量，进程生命周期统一由 `cli/index.ts` 管理。
- 正常进度和产物路径写入 stdout；错误写入 stderr，不输出密钥、认证头或完整配置对象。
- 浏览器打开失败时告警并告知可手动访问的地址或文件路径，已经启动的服务和已经生成的报告保留；打开失败不使已成功生成报告的命令退出失败，也不改变已有测评结果。

| 退出码 | 含义 |
| --- | --- |
| `0` | 命令正常完成，或正常显示帮助、版本 |
| `1` | 参数、配置、题目校验、文件操作、服务启动或报告生成等失败 |
| `130` | 用户通过 Ctrl+C 中断 |

run 的退出码描述命令要求的阶段是否完成，不表示模型成绩是否达到某个门槛。有效答错、错误拒识或重试耗尽后的模型 `ERROR` 都作为最终结果保存，其他任务继续执行。全部测评任务完成，且默认报告成功生成或已指定 `--no-report` 时，退出 `0`。仅报告生成或写入阶段失败时退出 `1`，不将已完成的测评改为中断或失败；仅浏览器打开失败不影响成功退出。

中断时保留已落盘的快照、模型结果目录和结果，不将尚未完成的任务伪造为失败结果。reporter 根据 metadata 中参测模型与题目快照组成的矩阵标注缺失；空或完全缺失的模型结果目录同样计入。

## 9. 源码组织与构建

### 9.1 源码组织

```text
src/
├── index.ts
├── core/
│   ├── testcase.ts
│   ├── runner.ts
│   ├── reporter.ts
│   ├── summary.ts
│   ├── schemas.ts
│   └── metadata.ts
├── presets/
│   ├── index.ts
│   └── metadata.json
└── ui/
    ├── App.tsx
    ├── Performance.tsx
    ├── components/
    ├── index.tsx
    ├── index.html
    ├── types.ts
    ├── brand.ts
    └── styles.css
cli/
├── index.ts
├── validate.ts
├── viewer.ts
├── run.ts
├── report.ts
└── output.ts
tests/
├── core/
│   ├── testcase.test.ts
│   ├── runner.test.ts
│   ├── reporter.test.ts
│   └── summary.test.ts
├── ui/types.test.ts
├── cli/index.test.ts
└── fixture.ts
```

- `src/core` 集中实现可调用的原子能力，由 `src/index.ts` 保持公共导出；单元测试按 `core`、`ui`、`cli` 对齐，共享测试数据放在 `tests/fixture.ts`。
- `core/testcase.ts` 集中处理题目读取、文件字节和一致性。
- `core/runner.ts` 按执行流程组织单题执行、批量调度及落盘，不为每个步骤建立一层封装。
- `core/reporter.ts` 提供 viewer/report HTML 装配，共用 UI 模板。
- `core/summary.ts` 统一实现报告的统计计算。
- 通用排序、求和、计数和深冻结使用 `es-toolkit`；零值、缺失值、用量完整性及快照校验等测评规则由本包处理。文件访问沿用 Node 原生 API，题目 JSON 和图片按原始 Buffer 读写。
- `core/schemas.ts` 维护需要运行时校验的数据契约，类型尽量从 schema 推导；公开模型快照字段通过白名单复用调用配置 schema，继续排除连接凭据。
- `core/metadata.ts` 负责覆盖合并与自定义 Logo 文件读取；`presets` 只保存可信预设数据。
- CLI 按子命令拆分；`run` 和 `report` 共用 `cli/report.ts` 的报告写入和打开流程，终端格式集中在 `cli/output.ts`。
- `ui` 保留能独立理解的页面级组件，不按每个指标或筛选项拆文件。
- 筛选下拉框使用无样式 Radix Select，复用现有 CSS；键盘导航、typeahead、焦点、portal 与弹层碰撞由组件库处理，保留 Tab 关闭并继续焦点导航的适配。
- `ui` 独立保存移植后的样式和资源，与现有 viewer 保持视觉一致，不跨工程导入。`styles.css` 随前端模板内嵌，不依赖额外样式运行时。
- Node SDK 和 CLI 使用 Rslib 构建 ESM 产物与类型声明；浏览器模板使用 Rsbuild、React 和 Recharts。
- 发布时包含构建产物、内置题库和必要资源；导入 runner 不应触发 CLI 执行、浏览器启动或构建。

### 9.2 npm 包选型

核查日期：2026-11-12。当前选型原则是新增依赖采用满足仓库 Node 范围的最新稳定版本；与 apps/packages 共享的基础依赖采用相同声明，保留现有版本一致性检查。依赖已完成安装、lockfile、peer dependencies 和构建检查；运行版本范围由 package.json 的 engines 声明。

本包沿用仓库 Node 范围 `^20.19.0 || ^22.12.0 || >=24.0.0`。源码及 CLI 使用 ESM；原生 ESM 和提供可用 ESM 入口的双格式依赖均可采用，不为格式统一而替换成熟工具。

运行时及 CLI 依赖：

| npm 包 | 当前声明 | 核心功能 | 最新稳定版及兼容决策 |
| --- | --- | --- | --- |
| `@midscene/core` | `workspace:*` | Agent、定位、模型调用与用量统计 | 使用仓库当前版本 |
| `@midscene/shared` | `workspace:*` | 图片信息及现有公共工具 | 使用仓库当前版本，不直接新增 Sharp |
| `es-toolkit` | `^1.53.2` | 多条件排序、求和、计数、深冻结 | 已核对当前稳定版；提供 ESM 和 TypeScript 类型，无额外依赖 |
| `zod` | `^3.25.1` | 配置、题目、结果校验与类型推导 | 最新 `4.6.7`；先与 SDK 和仓库对齐 |
| `p-queue` | `^9.3.5` | 全局尝试并发调度 | 最新 `10.0.0` 要求 Node ≥22 |
| `p-retry` | `^7.1.1` | 可恢复执行错误的重试 | 最新 `9.0.0`；从 8 起要求 Node ≥22 |
| `commander` | `^14.0.3` | 子命令、参数、帮助及异步执行 | 最新 `15.1.0` 要求 Node ≥22.12 |
| `@clack/prompts` | `^1.9.0` | CLI 启动 spinner 与实时测评进度条 | ESM；Node ≥20.12，符合本包运行范围 |
| `tinyrainbow` | `^3.2.0` | 统一 CLI 品牌、状态及信息层级的终端配色 | 当前稳定版；ESM、Node ≥14，无运行时依赖，包体约 8 KB |
| `terminal-link` | `^5.0.0` | 为校验输出的题名生成终端超链接，自动检测支持情况 | 当前稳定版；ESM、Node ≥20，符合本包运行范围 |
| `dotenv` | `^16.4.5` | CLI 加载 `.env` | 最新 `18.0.10`；先对齐仓库 |
| `open` | `10.1.0` | 打开默认浏览器 | 最新 `11.0.4`；先对齐仓库 |
| `hono` | `^4.13.18` | Viewer 的只读 HTTP 服务 | 最新稳定版 |
| `@hono/node-server` | `^2.1.7` | Node HTTP 适配及服务生命周期 | 最新稳定版，与 Hono 4 匹配 |

前端、构建、类型及测试依赖统一为 devDependencies；React 等只用于预构建页面模板，不作为公开 SDK 的运行时依赖或 peerDependencies：

| npm 包 | 当前声明 | 核心功能 | 最新稳定版及兼容决策 |
| --- | --- | --- | --- |
| `react`、`react-dom` | `18.3.1` | Viewer 与 Report 页面 | 最新 `19.3.1`；对齐仓库 |
| `react-is` | `18.3.1` | Recharts 所需的 React 类型判断 | 与 React 版本一致 |
| `@radix-ui/react-select` | `^2.4.1` | 无样式筛选下拉框、键盘、焦点与弹层定位 | 已核对当前稳定版；支持 React 18，样式由本包维护 |
| `react-router` | `^7.18.5` | 静态 HTML 的 HashRouter 路由 | 最新 `8.5.1` 要求 Node ≥22.22、React ≥19.2.7 |
| `recharts` | `^3.10.1` | 散点图、雷达图及交互提示 | 最新稳定版，支持 React 18 |
| `@rsbuild/core` | `^1.7.6` | 构建单文件页面模板 | 最新 `2.3.2`；对齐仓库构建链 |
| `@rsbuild/plugin-react` | `^1.4.6` | React 编译支持 | 最新 `2.1.1` 需匹配 Rsbuild 2 |
| `@rslib/core` | `~0.19.6` | 构建 Node SDK、CLI 及声明 | 最新 `1.0.6`；对齐仓库 |
| `typescript` | `^5.8.3` | 类型检查及声明生成 | 仓库锁定 `5.9.3`；最新 `7.0.2` |
| `@rstest/core` | `0.12.0` | 数据、调度、快照及导出行为测试 | 最新 `0.12.6`；对齐仓库 |
| `@types/react`、`@types/react-dom` | `^18.3.1` | React 与 DOM 类型 | 与 React 18 配套 |
| `@types/node` | `^18.0.0` | Node 类型 | 沿用仓库类型基线，仍需按最低运行版本验证 |

维护、规模和兼容结论：

- 已检查官方 registry 的稳定版本、engines、模块入口、直接依赖、弃用标记，以及官方维护和下载信息，未发现明显弃维护或采用规模过小的候选项目。下载量只作为采用规模证据，不代表质量或安全保证。
- npm 官方下载窗口 2026-11-04 至 2026-11-10：Rslib 约 41.6 万、Rstest 约 29.7 万、Rsbuild core 约 239 万、Recharts 约 6468 万。
- Hono、Zod、dotenv、Commander 没有直接运行时依赖。Recharts 有 11 个直接依赖，属于本方案中相对较重的页面依赖，仅用于报告模板；构建工具不参与用户侧报告生成。
- React Router 7 已包含需要的 DOM 功能，不额外安装 `react-router-dom`；Recharts 配套的 `react-is` 必须与 React 同版本。
- Rsbuild 2、Rslib 1、React 19、Zod 4 可以构成另一套独立技术栈，但本次先与仓库共享依赖对齐。不得只升级其中一项而忽略 peer 约束，例如 Rslib 0.19 要求 TypeScript 5。
- 不增加 glob、fs-extra、额外模板引擎、额外模型 SDK 或直接 Sharp 依赖。目录遍历、SHA、文件读写、Base64、时间戳使用 Node 内置能力；图片 metadata 通过 Shared 的 `getSharp()` 读取原始 Buffer，沿用 Shared 的 Sharp 实现。
- 不以全局 overrides 强行替换 SDK 的依赖版本，不将 Node SDK、Sharp 或 Photon 打入报告前端。浏览器消费报告数据、内嵌脚本与样式，并按图片 URL 加载图标；公开 API 不暴露 React 类型。

参考：[npm registry](https://registry.npmjs.org/)、[npm 官方下载 API](https://api.npmjs.org/downloads/point/last-week/@rslib%2fcore)、[Commander 15 发布说明](https://github.com/tj/commander.js/releases/tag/v15.0.0)、[React Router 7 升级说明](https://reactrouter.com/7.18.5/upgrading/v6)、[Recharts 安装说明](https://github.com/recharts/recharts#installation)。

### 9.3 构建工具和顺序

本包使用以下构建分工，包构建不执行测评或调用模型：

| 工具 | 职责 |
| --- | --- |
| Rslib `~0.19.6` | 构建 Node SDK、CLI、预设 metadata 的 ESM 模块及 TypeScript 声明，通过 `output.copy` 将页面模板纳入最终产物 |
| Rsbuild `^1.7.6`、React plugin `^1.4.6` | 在独立缓存目录预构建 Viewer／Report 共用的单文件 HTML 模板，内嵌前端代码和样式，图标保留 URL |
| Nx | 调度本包及 workspace 依赖的构建，缓存本包的完整最终产物 |
| pnpm | 安装依赖、执行构建及打包；发布沿用仓库统一版本和发布流程 |

通过 `pnpm --filter @midscene/benchmark-grounding build` 执行本包完整构建，或由 `pnpm exec nx build @midscene/benchmark-grounding` 调度相同流程。package.json 的 `build` 命令直接使用标准 CLI：

```sh
rsbuild build && rslib build
```

包级构建顺序固定为：

1. Rsbuild 按默认行为清理自己的输出目录 `node_modules/.cache/benchmark-grounding-ui/`，将页面构建为其中的 `index.html`。该通用模板不包含任何一次运行数据。
2. Rslib 按默认行为清理 `dist`，构建 SDK、CLI 和 presets 的 ESM 产物与声明，并通过 `output.copy` 将缓存目录的 `index.html` 纳入同次构建，输出为 `dist/ui-template.html`。预设 metadata 直接保留公开 Logo URL，不在构建时下载或内嵌图标。

构建配置集中在 `rsbuild.config.ts` 和 `rslib.config.ts`，输出清理和模板复制由构建器完成。两套构建器使用隔离输出，Rslib 清理 `dist` 时保留 Rsbuild 的模板缓存；缓存目录不进入源码输入或发布包。Nx 将这两个命令视为一个构建单元，缓存完整的 `dist`，缓存恢复后可直接使用最终产物。

入口、类型声明、模板资源、CLI shebang 和 `bin` 的有效性通过构建产物检查及 `pnpm pack` 后的独立安装验证。

Node 产物采用 ESM，使用 `.mjs` 扩展名和明确的 `import` 入口，不额外产出 CommonJS 版本。第三方运行时依赖通过 dependencies 安装，保留为外部依赖；UI 的 React、Recharts、路由及样式已编译进模板，不需要用户再安装构建工具。Node SDK、Sharp 和模型调用代码不进入 UI 模板。

模板自身的脚本和样式全部内嵌，字体使用系统字体，动态导入不能留下运行时加载的外部 chunk。品牌 Logo 和 favicon 使用 Midscene 官方图片 URL，家族图标使用 metadata 快照中的 URL 或 data URI。静态报告的截图从运行快照转为 data URI，并与结果一起注入模板；HTTP Viewer 的截图通过本地图片路由按需提供。模板和默认题库按安装后的包位置定位，不依赖使用方的工作目录、仓库源码或旧 benchmark。

### 9.4 公开导出

根入口 `@midscene/benchmark-grounding` 只导出以下原子方法，以及调用这些方法所需的公共类型：

| 导出 | 用途 |
| --- | --- |
| `loadTestcases` | 加载、过滤并校验内置或外部题库 |
| `runTestcase` | 执行单模型、单题的一次尝试 |
| `runBenchmark` | 生成独立快照、调度全部任务并保存结果 |
| `createViewer` | 装配只读题库 HTML |
| `createReport` | 从运行目录装配独立单文件测评报告 |

公共类型包括 `Testcase`、`LoadedTestcase`、`ModelCallConfig`、`ReportMeta`、`AttemptResult`、`ReportSummary`，从对应 schema、SDK 类型和实现返回值推导，不另外维护重复结构；`ReportSummary` 仅用于报告统计。

子入口 `@midscene/benchmark-grounding/presets` 导出 `presetMeta`，结构为 `ReportMeta`，包含已知模型的参考价格、性能和家族样式，预设 Logo 为公开 HTTPS URL，图标集 CDN 使用固定版本。单独导入预设不加载 runner、CLI 或启动模型调用。

CLI 通过 `bin` 提供 `midscene-benchmark-grounding` 命令，指向编译后的 CLI 入口并保留 Node shebang。CLI 不作为 SDK 函数导出。内部 React 组件、样式、校验 schema、统计实现和模板不作为公共子路径；不提供任意内部路径的通配导出。内置题库作为原始文件分发，由 `loadTestcases` 访问。

package.json 的核心入口映射如下：

```json
{
  "type": "module",
  "main": "./dist/index.mjs",
  "types": "./dist/types/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/types/index.d.ts",
      "import": "./dist/index.mjs"
    },
    "./presets": {
      "types": "./dist/types/presets/index.d.ts",
      "import": "./dist/presets/index.mjs"
    },
    "./package.json": "./package.json"
  },
  "bin": {
    "midscene-benchmark-grounding": "./dist/cli/index.mjs"
  },
  "files": ["dist", "testcases"]
}
```

根入口导入不会触发 CLI、浏览器、服务或模型调用。`createViewer` 和 `createReport` 依然只返回 HTML，不因导出方式变化而增加写文件或打开浏览器的副作用。

### 9.5 npm 包内容

最终发布包的主要内容如下；`dist` 内部的其他必要编译模块一并包含：

```text
@midscene/benchmark-grounding/
├── package.json
├── LICENSE
├── dist/
│   ├── index.mjs
│   ├── cli/index.mjs
│   ├── presets/index.mjs
│   ├── types/
│   │   ├── index.d.ts
│   │   └── presets/index.d.ts
│   └── ui-template.html
└── testcases/
    └── <testcase-name>/
        ├── index.json
        ├── index.sha256
        └── image.png 或 image.jpg
```

- 内置题库当前为 200 道、600 个原始文件。构建和打包均保持 JSON、SHA 及图片字节不变，不将数据集改写进 JavaScript。
- `dist` 包含 SDK、CLI、公共类型、预设 metadata 和完整页面模板；预设 Logo URL 随 metadata 保存，不依赖源码资源路径。
- 通过 files 白名单纳入 `dist` 和 `testcases`，核对 pnpm 最终打包结果包含 package.json 和许可证；当前不增加 README 等额外文档。
- 内部设计、评审、历史测评输出、候选题、测试 fixture、TypeScript／前端源码、构建临时文件、`.env` 和密钥配置不进入发布包。node_modules 不打入包，由包管理器按 dependencies 安装运行依赖。
- 发布前检查 `pnpm pack` 的实际 tarball；从 tarball 在仓库外安装，验证根入口和 presets 导入、类型解析、CLI 帮助、内置题库默认加载及报告生成。生成报告时不需要 Rsbuild、Rslib、仓库或临时构建目录，导出的 HTML 可通过 `file:///` 直接打开，Logo 和 favicon 需要网络加载。

## 10. 验证范围

SDK、CLI、Viewer 和 Reporter 均已实现。验证采用单元测试、独立安装及必要的手动浏览器检查；34 个模型各执行 3 道题的真实测评已生成 102 个最终结果，其中 83 个正确、0 个 `ERROR`。

主要验证项：

- 200 道题加载顺序、SHA 与原图校验正确；`names` 只加载并校验精确匹配的题目，返回顺序仍为字典序，缺失、重复或空选择明确报错。
- 错误格式、未知版本或文件篡改时，在调用模型前失败。
- 快照与校验过的文件逐字节一致；源目录改写或删除后，运行和报告仍可使用快照。
- runner 接管时若解析对象、SHA 值与原始文件字节不一致，在任何模型调用前报错；接管后修改调用方对象、Buffer 或源文件，不影响执行、评分和快照。
- 使用模型 mock 捕获实际传给 `aiLocate` 的指令和截图，核对它们与快照及实际语言选择一致；全部模型和重试沿用同一题目，Jev 派生输入可正确还原到原图坐标。
- 结果记录的 testcase SHA 等于快照 SHA，不在结束时重新计算。
- 通过、答错、拒识、解析失败、超时和重试次数均有确定行为。
- runner 调度中的并发不超限；超时任务及时释放名额，不等待后台请求。普通答错不会重试，重试用量不会被最终成功结果覆盖掉。
- `durationMs` 与 `timeoutMs` 同口径，达到或等于阈值即失败；迟到响应与后台清理不阻塞返回、不改写结果。
- 一个模型失败不阻止其他任务；执行进度通过回调通知，落盘结果与 metadata 中参测模型 × 题目矩阵可以交叉核对。
- SDK 参数和环境变量互不串扰，两个并发模型不通过全局状态切换配置。
- runner 产物和报告中不包含 API Key 或完整连接配置。
- metadata 通过 displayName 精确匹配，模型和家族同名条目整体覆盖；缺少参考数据不使模型从报告消失。
- 在首次模型调用前保存完整 metadata 快照；模型条目只包含本次参测模型，实际调用身份优先于参考 metadata，明确记录 `name`、`family`、`displayName` 及可选协议、推理配置。map 键与条目的 `displayName` 相同，不保存 `directory`、API Key 或 Base URL；Runner 和 Reporter 按同一规则推导并校验结果目录。本地 Logo 已转为 data URI，HTTP(S) 地址和已有 data URI 保持原样。之后改写调用方对象、修改 presets 或删除本地 Logo 源文件，仍可仅使用运行目录重新生成报告；远端图片内容不承诺冻结。
- CLI 只从环境变量向 `runBenchmark` 传入模型调用配置和 metadata；`createReport` 只使用运行目录中的快照，不需要模型配置环境变量，快照缺失时明确报错。
- runner 只写 `meta.json`、独立题目快照和逐题 `results`，只返回 `{ directory }`。报告扫描这些数据，以目录名为 `evaluationId`、以 metadata 中的模型条目确定参测模型；结果身份、文件名、题目 SHA、GT、最终输出和每次尝试的判定均相互一致。空或完全缺失的模型结果目录显示无结果，缺失数量由参测模型 × 题目矩阵计算。
- run 默认在全部测评结果落盘后生成 `<run-directory>/report.html`，与独立 report 共用数据读取、校验、统计、装配、写文件及打开逻辑；文件写入成功后默认通过浏览器打开，无需启动 HTTP 服务。
- `run --no-report` 不调用报告生成逻辑、不写 HTML、也不打开报告；随后独立 report 采用同一快照和默认路径生成相同内容的报告，并默认打开。
- run 和 report 的 `--no-open` 只阻止浏览器打开，不改变报告生成及其内容。报告生成或写入失败时不得打开；仅浏览器打开失败时保留文件、输出路径并告警，命令仍按成功退出。
- 模型答错或最终 `ERROR` 不阻止报告；仅报告生成或写入失败时 CLI 退出 `1`，保留已完成测评，可独立重试报告而不再调用模型。测评阶段中断或抛错时不自动生成报告。
- 模型切换、矩阵跳转、原图缩放和 GT／预测叠加正确。
- Viewer 启动后修改、增加或删除源题目，刷新页面即可读取最新数据，不需要重启；页面及图片均不缓存。图片 SHA 与页面引用不一致时返回 `409`；`createViewer` 没有标题参数，默认 SDK 图片内嵌，CLI 使用 `imageBaseUrl`。
- Viewer 与 Reporter 在相同视口、相同内容下与现有 viewer 保持页面风格一致；样式由本包维护，图标使用公开 URL 或 data URI，旧工程移走后构建、页面查看及报告仍可独立工作。
- 移走运行目录并删除包内题库后，导出的 HTML 仍能通过 `file:///` 直接打开，题目截图、数据、图表及交互均来自单文件；Logo 和 favicon 通过网络加载。
- 从 pnpm 实际打包产物安装后，公开 exports、types 和 bin 均指向存在的文件；600 个题库文件逐字节一致，模板和预设完整，命中 Nx 缓存时仍可直接使用完整产物。

测试优先覆盖数据、调度及导出行为，使用离线 fixture 和模型 mock；真实模型测评验证 SDK 调用、用量记录和报告生成链路。不以大量细碎视觉断言固定页面实现。

## 11. 当前约定与默认值

| 事项 | 当前约定 |
| --- | --- |
| 调度默认值 | 全局并发 `64`、单次尝试整体超时 `60000ms`；首次执行之外最多重试 `2` 次 |
| 产物布局 | `meta.json`、独立题目快照和 `results`；CLI run 默认额外生成 `report.html` |
| Viewer 默认服务参数 | 监听 `127.0.0.1:4319` 并自动打开浏览器，可用参数调整；HTTP 原图通过 `/images` 按需读取，SHA 不匹配返回 `409` |
| 耗时估算 | min(参考估算平均耗时, max(实测平均耗时 − 100ms, 0))；零值计入，零分母不显示无穷大 |

## 12. 技术参考

- [Commander.js](https://github.com/tj/commander.js)：子命令、参数和异步处理。
- [p-queue](https://github.com/sindresorhus/p-queue)：并发调度。
- [p-retry](https://github.com/sindresorhus/p-retry)：重试策略。
- [Rsbuild inlineScripts](https://rsbuild.rs/config/output/inline-scripts) 与 [injectStyles](https://rsbuild.rs/config/output/inject-styles)：生成内联页面模板。
- [React Router HashRouter](https://reactrouter.com/api/declarative-routers/HashRouter)：静态文件内导航。
- [Hono Node.js](https://hono.dev/docs/getting-started/nodejs)：Viewer 本地服务。
- [open](https://github.com/sindresorhus/open)：跨平台打开浏览器和文件。
