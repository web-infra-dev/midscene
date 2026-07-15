# RFC 0008 · Midscene Test TypeScript 配置与 CLI 命名

状态：**已实现**

范围：把 `midscene-test` 和 `midscene.config.ts` 作为 `@midscene/test` 的新入口，
并让 TypeScript 配置获得字段、Document Context 和 Node Context 的类型提示。现有
`midscene-workflow`、`midscene.workflow.config.*` 和旧项目层 API 直接移除，不提供
兼容入口。

本 RFC 建立在 RFC 0003、RFC 0005、RFC 0006 和 RFC 0007 之上：

- RFC 0003 引入 Project Config、`defineWorkflowProject()` 和 Context 泛型；
- RFC 0005 把配置加载移回 CLI 主进程，并明确首期只加载 CommonJS；
- RFC 0006 统一 Case、Workflow Document 和 Workflow Project 术语，但不修改 CLI 和配置名；
- RFC 0007 增加 `root` 和 `files`，让 Project Config 成为用户需要长期维护的入口。

本 RFC 取代 RFC 0005 中不支持 TypeScript Project Config 的限制，也取代 RFC 0006
中“不修改配置文件名和 CLI 名称”的边界。它同时用 Test Project 取代 Workflow Project。
Workflow Document 继续表示单个 YAML 文档及其生命周期。

---

## 1. 建议结论

推荐把以下名称作为新的公开入口：

```text
package: @midscene/test
command: midscene-test
config:  midscene.config.ts
```

TypeScript 配置使用 ESM 风格的默认导出：

```ts
import { defineNode } from '@midscene/test';
import { defineTestProject } from '@midscene/test/config';

interface ProjectContext {
  baseURL: string;
}

const requestNode = defineNode<
  { path: string },
  { status: number },
  ProjectContext
>({
  name: 'http.get',
  async execute({ input, context }) {
    const response = await fetch(new URL(input.path, context.baseURL));
    return {
      summary: `GET ${input.path}: ${response.status}`,
      data: { status: response.status },
    };
  },
});

export default defineTestProject<ProjectContext>({
  root: './e2e',
  files: {
    include: ['workflows/**/*.{yaml,yml}'],
  },
  nodes: [requestNode],

  setupDocument({ env }) {
    const baseURL = env.TEST_BASE_URL;
    if (!baseURL) {
      throw new Error('TEST_BASE_URL is required.');
    }
    return { baseURL };
  },
});
```

CLI 在当前进程中转译并执行配置。首期建议使用 `tsx` 提供的局部 `tsImport()` API。
这个 API 只增强配置文件的加载链路，不为整个 CLI 进程注册全局 loader。

TypeScript 配置提供编辑器类型提示和编译期检查能力。CLI 只负责转译和执行，不在每次
运行 Workflow 前调用 `tsc`。

新的运行方式如下：

```bash
pnpm exec midscene-test
pnpm exec midscene-test ./e2e
pnpm exec midscene-test --config ./config/midscene.config.ts
```

`midscene-test` 和 `@midscene/test` 使用 Test 产品名称。`midscene.config.ts` 使用
Midscene 项目级名称，不绑定某个运行命令。Test Project 表示整个测试项目。Workflow
只保留在 Workflow Document 层，用于表达单个 YAML 文档内的生命周期和 Case 编排。

项目层公开 API 同步改为 `TestProjectDefinition`、`defineTestProject()`、
`loadTestProject()` 和 `runTestProject()`。旧的 Workflow Project API 不再导出。

### 1.1 已确认的决策

本文采用以下决策：

1. `midscene.config.ts` 直接默认导出 `TestProjectDefinition`，不增加 `test: { ... }` 包装层；
2. 删除 `midscene-workflow` 和 `midscene.workflow.config.*`，不设置兼容期；
3. 配置文件只支持 `.ts`，不支持 `.js`、`.cjs`、`.mts`、`.cts` 和 `.tsx`；
4. 同一目录出现多份 `midscene.config.*` 时直接报错；
5. 首期不支持 `tsconfig.json` 中的 `paths`；
6. 新 API 随 `@midscene/test` 首次正式发布，旧 programmatic API 不导出。

---

## 2. 问题

当前公开入口使用了两套名称：

```text
package: @midscene/test
command: midscene-workflow
config:  midscene.workflow.config.cjs
```

RFC 0006 已经把单个可执行任务从 Workflow 改称 Case，但仍把整个项目称为 Workflow
Project。这个名称会继续渗透到配置函数、runner 和结果类型。用户安装的是测试工具，
整个项目也包含文件发现、断言、报告和结果汇总，不只是 Workflow 编排。

当前配置只能可靠地使用 CommonJS：

```js
const { defineWorkflowProject } = require('@midscene/test/config');

module.exports = defineWorkflowProject({
  files: {
    include: ['workflows/**/*.yaml'],
  },
  nodes: [],
});
```

这套写法可以执行，但编辑体验较弱。

- 用户难以直接看到 `root`、`files`、`nodes` 和 `setupDocument` 的字段说明；
- `files.include`、`files.exclude` 等嵌套字段缺少补全；
- `setupDocument()` 的参数和返回值缺少上下文类型；
- 自定义 Node 与 Document Context 之间的类型关系需要手工维护；
- 字段拼写错误通常只能在 CLI 加载时发现；
- 示例需要继续使用 `require()` 和 `module.exports`，与项目中的 TypeScript 代码风格不一致。

RFC 0003 已经设计了 Project Definition 和 Context 泛型。当前实现通过
`WorkflowProjectDefinition<TContext>` 和 `defineWorkflowProject<TContext>()` 暴露。
本 RFC 在增加 TypeScript loader 时同步将其改为 Test Project 命名。

### 2.1 当前实现边界

配置链路目前分成两部分。

```text
discoverWorkflowConfig()
  -> 只查找 midscene.workflow.config.cjs 和 .js

loadWorkflowProjectSync()
  -> createRequire(configPath)(configPath)
  -> unwrap default
  -> 校验 WorkflowProjectDefinition
  -> 创建 NodeRegistry
```

现有 `runWorkflowProject()` 本身已经是异步函数。配置加载虽然是同步实现，但后续调用方没有
必须保持同步的执行约束。因此，runner 可以改为等待新的异步加载 API。

`packages/test/package.json` 目前只发布 `midscene-workflow`。另一个 package
`@midscene/cli` 已经发布 `midscene` 命令。因此，`midscene test` 需要跨 package 集成，
而 `midscene-test` 可以继续由 `@midscene/test` 独立发布。

### 2.2 与特性演进的关系

Project Config 的职责在过去几份 RFC 中持续增加。

| RFC | Project Config 的新增职责 |
|---|---|
| RFC 0003 | 注册 Node，定义 setup 和 Context |
| RFC 0004 | setup 作用域调整为 Workflow Document |
| RFC 0005 | 在 CLI 主进程单次加载，与执行共享对象引用 |
| RFC 0007 | 定义项目根目录和 Workflow 文件范围 |

配置已经从内部接线文件变成项目的公开入口。继续只提供 CJS，会让新增字段的类型设计无法
直接转化为用户体验。

命令也已经成为公开入口。只把配置改为 `midscene.config.ts`，但继续要求用户运行
`midscene-workflow`，会产生新的命名分裂。因此，本 RFC 同时处理命令和配置名。

同理，只修改命令和配置名，却继续暴露 `WorkflowProjectDefinition` 和
`runWorkflowProject()`，仍会让 TypeScript 用户看到两套项目术语。本 RFC 将项目层统一
改为 Test Project，不保留旧 API 别名。

---

## 3. 设计目标

1. **入口统一**：package、命令和项目 API 使用 Test，配置使用 Midscene 项目级名称。
2. **默认类型友好**：新项目可以使用 `.ts` 配置，并得到完整字段补全。
3. **Context 类型贯通**：`setupDocument()`、自定义 Node 和 Midscene Node 共享同一类型。
4. **保持单进程**：配置、Registry、Context 和 Node Handler 仍在 CLI 主进程运行。
5. **首次发布简洁**：只发布新命令、新配置名和新项目 API，不引入兼容分支。
6. **单次求值**：每次 Test Project Run 只加载一份配置一次。
7. **错误明确**：发现、转译、导入和配置校验错误具有不同的错误信息。
8. **局部增强**：TS loader 只作用于配置及其本地依赖，不修改整个进程的模块行为。
9. **术语收敛**：项目层只保留 Test Project，不增加同义 API alias。
10. **便于扩展**：后续可以增加 watch 和配置重载，而无需更换公开配置 API。

---

## 4. 非目标

本 RFC 不包含以下能力：

- 不把 Workflow YAML 改为 TypeScript；
- 不在 CLI 启动时执行完整 `tsc --noEmit`；
- 不为配置生成独立构建产物；
- 不启动 `tsx`、`ts-node` 或其他子进程；
- 不增加多份配置合并或 `extends`；
- 不增加异步配置工厂，例如 `export default async () => definition`；
- 不允许配置改变 Test Project Runner 的模块 loader；
- 不保证加载任意 TypeScript 编译器插件或自定义 transformer；
- 不改变 `setupDocument()` 的资源创建和清理边界；
- 不把 `midscene-test` 合并为 `@midscene/cli` 的 `midscene test` 子命令；
- 不把 Workflow Document 改为 Test Document；
- 不修改 Case、Step 和 Node 的术语。

配置模块顶层仍应保持声明式。数据库连接、Browser、Device Session 和 UI Agent 应在
`setupDocument()` 中创建，并通过 `onTeardown()` 释放。

---

## 5. 配置文件契约

### 5.1 文件名

新的配置文件名固定为：

```text
midscene.config.ts
```

`.ts` 不是推荐格式，而是唯一受支持的格式。`.js`、`.cjs`、`.mts`、`.cts` 和 `.tsx`
都不属于配置契约。实现不包含 CommonJS loader，也不根据项目的 `package.json` 推断模块
格式。

`midscene.config.ts` 是 Midscene 项目级文件名，但首期 schema 仍是
`TestProjectDefinition`，并通过 `defineTestProject()` 提供类型。当前 `@midscene/cli`
只读取显式传给 `--config` 的 YAML，不会自动发现这个文件，因此两条 CLI 链路不会冲突。

其他 Midscene package 未来如果需要共享该文件，必须扩展同一份 schema，不能再定义一套
独立的 `midscene.config.ts` 解释规则。统一配置结构需要后续 RFC，本 RFC 不提前增加
`test: { ... }` 包装层。

自动发现不再识别 `midscene.workflow.config.*`。

### 5.2 导出形式

TypeScript 配置必须默认导出 `TestProjectDefinition`：

```ts
export default defineTestProject({
  nodes: [],
});
```

以下形式不属于公开契约：

```ts
export const config = defineTestProject({
  nodes: [],
});
```

默认导出让 loader 可以复用当前的 `unwrapProjectDefinition()`。它也与主流 TypeScript
工具配置的写法一致。

### 5.3 配置对象

TypeScript 的类型检查不能代替运行时校验。CLI 转译并执行配置后，仍然校验配置的字段、
默认值和错误语义。

```ts
export interface TestFileSelection {
  include: readonly string[];
  exclude?: readonly string[];
}

export interface TestProjectDefinition<TContext = undefined> {
  root?: string;
  files?: TestFileSelection;
  nodes: readonly NodeDefinition<any, any, TContext>[];
  setupDocument?: WorkflowDocumentSetup<TContext>;
}
```

`defineTestProject()` 是返回输入值的类型辅助函数。它不缓存配置、不执行 setup，
也不把类型信息带入运行时。

### 5.4 本地 TypeScript 依赖

配置应能拆分到本地 TypeScript 模块：

```ts
import { projectNodes } from './nodes.ts';
import { defineTestProject } from '@midscene/test/config';

export default defineTestProject({
  nodes: projectNodes,
});
```

相对导入应写出 `.ts` 扩展名，避免 Node.js ESM 解析规则产生歧义。只转译入口文件而不
处理依赖图，无法满足真实项目的组织方式。因此，验收标准必须覆盖
`config.ts -> nodes.ts` 的加载链路。

### 5.5 统一命名

本文统一用户入口和项目层 API。Workflow 只保留在文档层。

| 层级 | 本 RFC 推荐名称 | 是否修改 |
|---|---|---|
| npm package | `@midscene/test` | 不修改 |
| CLI | `midscene-test` | 修改 |
| 默认配置 | `midscene.config.ts` | 修改 |
| 项目模型 | Test Project | 修改 |
| 配置类型 | `TestProjectDefinition` | 修改 |
| 配置辅助函数 | `defineTestProject()` | 修改 |
| Programmatic runner | `runTestProject()` | 修改 |
| YAML 文档模型 | Workflow Document | 不修改 |

项目层 API 按下表重命名。

| 旧名称 | 新名称 |
|---|---|
| `WorkflowProjectDefinition` | `TestProjectDefinition` |
| `WorkflowFileSelection` | `TestFileSelection` |
| `LoadedWorkflowProject` | `LoadedTestProject` |
| `ProjectCaseRunResult` | `TestProjectCaseRunResult` |
| `WorkflowCollectionError` | `TestProjectCollectionError` |
| `WorkflowProjectRunOptions` | `TestProjectRunOptions` |
| `WorkflowProjectRunSummary` | `TestProjectRunSummary` |
| `WorkflowProjectRunResult` | `TestProjectRunResult` |
| `defineWorkflowProject()` | `defineTestProject()` |
| `loadWorkflowProject()` | `loadTestProject()` |
| `loadWorkflowProjectSync()` | 删除；调用方改用 `await loadTestProject()` |
| `runWorkflowProject()` | `runTestProject()` |
| `discoverWorkflowConfig()` | `discoverTestConfig()` |
| `discoverWorkflowFiles()` | `discoverTestFiles()` |
| `DEFAULT_WORKFLOW_FILE_SELECTION` | `DEFAULT_TEST_FILE_SELECTION` |

保留别名会让编辑器补全长期出现两套同义 API，也会让新文档不断解释二者差异。首次发布
应一次完成项目层术语收敛。

Workflow Document 仍然准确表示带有 `beforeAll`、`beforeEach`、Case、`afterEach` 和
`afterAll` 的 YAML 文档。本文不重命名 `WorkflowDocumentSetup`、
`runWorkflowDocument()` 和相关结果类型。

---

## 6. 配置发现

### 6.1 自动发现

自动发现只加载精确文件名 `midscene.config.ts`。发现阶段同时检查同目录下的
`midscene.config.*`：只要存在 `.ts` 以外的同基础名文件，就直接报错，不忽略，也不设置
扩展名优先级。

本文建议修改发现语义：

1. 没有任何 `midscene.config.*` 文件时，继续使用 `{ nodes: [] }`；
2. 只存在 `midscene.config.ts` 时，加载该文件；
3. 存在任何其他 `midscene.config.*` 文件时，直接报错并列出全部相对路径；
4. 显式 `--config` 跳过自动发现，但仍校验扩展名必须为 `.ts`。

示例错误：

```text
Unsupported or conflicting Midscene configs found in /workspace/shop:
- midscene.config.ts
- midscene.config.cjs
Only midscene.config.ts is supported.
```

这个规则既能防止 CLI 执行过期配置，也不会让遗留的 `.js` 或 `.cjs` 文件被静默忽略。

### 6.2 显式配置

`--config` 继续相对于配置搜索根目录解析。显式路径不存在时，CLI 在加载前报错。

首期只接受 `.ts`。其他扩展名应产生明确错误，不交给 Node.js 猜测：

```text
Unsupported Midscene config extension: .json.
Supported extension: .ts.
```

`.js`、`.cjs`、`.mts`、`.cts` 和 `.tsx` 始终产生 unsupported extension 错误。

---

## 7. CLI 命名

### 7.1 命令入口

`@midscene/test` 增加新的 bin：

```json
{
  "bin": {
    "midscene-test": "./bin/midscene-test"
  }
}
```

新文档、示例和错误提示统一使用：

```text
midscene-test [project-directory]
```

参数保持不变：

```bash
midscene-test
midscene-test ./e2e
midscene-test --config ./config/midscene.config.ts
midscene-test --result-dir ./artifacts/midscene
```

`package.json` 不再发布 `midscene-workflow` bin，也不增加兼容 wrapper。

### 7.2 控制台与结果目录

面向用户的输出前缀改为 `midscene-test`：

```text
midscene-test: collected 2 documents, 3 cases, 0 collection errors
midscene-test: 3/3 cases passed, 0 failed, 0 not run
```

默认结果目录为：

```text
.midscene/test-results/<run-id>
```

`.midscene/workflow-results` 不属于首次正式发布的契约，也不提供目录迁移。显式
`--result-dir` 不受影响。

### 7.3 为什么不使用 `midscene test`

`midscene` bin 属于 `@midscene/cli`，`midscene-test` bin 属于 `@midscene/test`。改成
`midscene test` 需要让 `@midscene/cli` 集成或依赖新的 runner，也会改变两个 package 的
安装预期。

本 RFC 保持 `@midscene/test` 可独立安装和运行。如果未来需要统一顶层 CLI，可以让
`midscene test` 委托同一 programmatic API，但不应阻塞本次命名调整。

---

## 8. Loader 设计

### 8.1 异步入口

增加异步加载 API：

```ts
export async function loadTestProject<TContext = undefined>(
  configPath?: string,
): Promise<LoadedTestProject<TContext>>;
```

`runTestProject()` 等待该函数：

```ts
const project = await loadTestProject(configPath);
```

后续初始化顺序保持不变：

```text
resolve cwd and CLI arguments
discover or resolve configPath
await load and validate project config once
create NodeRegistry once
resolve project root and file selection
discover and collect Workflow Documents
run collected Documents
```

配置加载仍发生在 YAML 发现和 `setupDocument()` 之前。配置错误不会创建外部资源，也不会
产生部分 Test Project Result。

### 8.2 TypeScript 加载

本文建议把 `tsx` 加入 `@midscene/test` 的运行时依赖，并使用
`tsx/esm/api` 的 `tsImport()`。

选择该 API 的原因如下：

- 它用于第三方工具局部加载 TypeScript 配置；
- 它支持 ESM 风格的 `import` 和 `export default` 源码；
- 它不会要求用户安装或注册额外 loader；
- 它可以处理配置继续导入的本地 TypeScript 文件；
- 它支持 Node.js 20，与 `@midscene/test` 当前 engine 范围一致；
- 仓库已有多个 package 使用 `tsx`，依赖版本可以保持一致。

Loader 只调用一次 `tsImport()`。它随后执行现有的 default export 解包和
`TestProjectDefinition` 校验。

### 8.3 不支持 CommonJS 加载

Loader 不保留 `createRequire()` 分支，也不接受 `.js` 或 `.cjs`。唯一加载路径是异步调用
`tsImport()` 读取 `.ts` 配置，再执行 default export 解包和运行时校验。

### 8.4 `tsconfig.json`

编辑器仍可使用项目自己的 `tsconfig.json` 完成类型检查，但 CLI 不解析其中的 `paths`。
配置必须使用相对路径、Node.js package import 或 npm package name。

实现调用 `tsImport()` 时设置 `tsconfig: false`。这样可以避免 CLI 的启动目录、配置目录和
`root` 字段共同影响模块解析。支持 `paths` 需要后续 RFC。

### 8.5 TypeScript 转译不等于类型检查

CLI 的成功条件是配置可以转译、导入并通过运行时校验。以下代码可能通过转译，但应该由
编辑器或 `tsc` 报告类型错误：

```ts
export default defineTestProject({
  nodes: [],
  files: {
    include: 'workflows/*.yaml',
  },
});
```

运行时校验仍会拒绝这个值，为跳过类型检查的 TypeScript 配置保留安全边界。

项目如果需要 CI 类型检查，可以自行把配置纳入 `tsc --noEmit`。Midscene 文档应说明
编辑器检查和 CLI 运行时校验的区别。

---

## 9. 只提供异步 API

`loadWorkflowProjectSync()` 随旧项目 API 一起删除，不新增 `loadTestProjectSync()`。
CLI 和 programmatic 调用方统一使用 `await loadTestProject()`。

TypeScript 配置可能使用 ESM 风格源码和本地 TypeScript 依赖。提供同步入口会迫使
实现注册另一套 loader 或限制配置语法，不值得为首次发布增加第二条加载路径。

---

## 10. 错误语义

Loader 应区分以下错误阶段。

| 阶段 | 示例 | 行为 |
|---|---|---|
| 发现 | 存在 `.ts` 以外的 `midscene.config.*` | 列出相关配置并终止 |
| 路径 | `--config` 指向不存在文件 | 报绝对路径并终止 |
| 扩展名 | 配置为 `.json` | 列出支持的扩展名 |
| 转译 | TypeScript 语法错误 | 保留原始位置和 cause |
| 导入 | 本地依赖不存在或 package 无法解析 | 保留模块解析错误和 cause |
| 导出 | 缺少 default export | 说明 TypeScript 配置必须默认导出 |
| 校验 | `nodes` 缺失或字段类型错误 | 复用现有配置校验错误 |

当前错误统一追加 `Use a CommonJS config (.cjs)`。切换为 TypeScript 后必须删除这个提示。
新的外层错误可以使用以下格式：

```text
Failed to load Midscene config "/workspace/shop/midscene.config.ts":
Cannot find module './nodes'.
```

错误对象应保留原始 `cause`。如果 source map 可以提供原始 `.ts` 行号，测试应验证错误栈
指向配置源码，而不是 loader 的临时产物。

Loader 不应在 `.ts` 加载失败后尝试其他扩展名。回退会隐藏损坏或过期的配置。

---

## 11. 缓存和生命周期

RFC 0005 规定每次 Test Project Run 只加载配置一次。本 RFC 保持该约束。

```text
load config module once
  -> create Node definitions
  -> create NodeRegistry
  -> collect every Workflow Document
  -> run every Document with the same definitions
```

首期没有 watch mode，因此不需要清除 TS loader cache。一次 Node.js 进程内多次调用
`runTestProject()` 时，每次调用仍代表一次独立 Test Project Run。是否跨调用复用模块实例，
沿用具体 loader 的模块语义，不作为资源生命周期机制。

配置顶层资源不能依赖 module cache 获得清理。需要清理的资源仍必须在
`setupDocument()` 中创建。

---

## 12. 测试要求

### 12.1 配置发现

- 只存在 `.ts` 时可以自动发现；
- 没有配置时继续使用空 Node 列表；
- 存在 `.ts` 以外的 `midscene.config.*` 时报告不支持或冲突；
- 显式 `--config` 只接受 `.ts`；
- `midscene.workflow.config.*` 不会被自动发现；
- `.js`、`.cjs`、`.mts`、`.cts`、`.tsx` 和未知扩展名产生稳定错误。

### 12.2 Loader 单元测试

- `.ts` 配置可以使用 `import`、类型声明和 `export default`；
- `.ts` 配置可以导入相邻的 `nodes.ts`；
- `setupDocument()` 在加载时不会执行；
- Test Project Definition 只校验一次，NodeRegistry 只创建一次；
- 缺少默认导出时给出 TypeScript 专属提示；
- TypeScript 语法错误保留配置路径和 cause；
- 本地依赖解析失败保留原始错误；
- `.js` 和 `.cjs` 配置不会进入 CommonJS loader，而是产生稳定错误；
- `loadTestProjectSync()` 不从 `@midscene/test/config` 导出；
- `tsconfig.json` 的 `paths` 不参与运行时解析；
- 旧的 Workflow Project API 名称不再从 `@midscene/test/config` 导出。

### 12.3 类型测试

运行时测试无法证明编辑器类型提示正确。实现需要增加一个 `tsc --noEmit` fixture，至少
覆盖以下契约：

- `root` 和 `files` 获得 contextual type；
- 无效的 `files.include` 类型会产生编译错误；
- `setupDocument()` 返回值满足 `TContext`；
- `defineNode<..., ..., TContext>()` 可以读取 Context 字段；
- Node 读取不存在的 Context 字段会产生编译错误；
- `@midscene/test/config` 的 export map 可以解析类型声明；
- `WorkflowProjectDefinition` 和 `defineWorkflowProject()` 不再可导入。

### 12.4 CLI E2E

增加一个不依赖模型的 TypeScript fixture。测试应验证：

- `midscene-test` 可以自动发现 `midscene.config.ts`；
- 配置导入本地 `nodes.ts`；
- setup、Node 和 teardown 在当前进程执行；
- 配置顶层只求值一次；
- Test Project Result 符合现有 runner 的结果契约；
- package 只发布 `midscene-test`，不发布 `midscene-workflow`；
- 旧配置名不会被自动发现；
- 默认结果写入 `.midscene/test-results`。

---

## 13. 首次发布范围

`@midscene/test` 尚未正式对外发布，因此本 RFC 不设计迁移期。首次发布只包含以下公开
入口：

```text
package: @midscene/test
command: midscene-test
config:  midscene.config.ts
API:     TestProject*
```

仓库当前实现和 fixture 需要一次性替换：

1. 把默认配置文件改为 `midscene.config.ts`；
2. 把 `require()` 改为 `import`；
3. 把 `module.exports =` 改为 `export default`；
4. 把 `defineWorkflowProject()` 改为 `defineTestProject()`；
5. 把项目类型和函数按 5.5 节的映射表重命名；
6. 把内部调用命令改为 `midscene-test`；
7. 删除旧 bin、旧配置发现规则和旧 API export。

最终配置如下：

```ts
import { defineTestProject } from '@midscene/test/config';

export default defineTestProject({
  nodes: [],
});
```

功能实现后，应同步更新以下内容：

- `packages/test/example/web-midscene`；
- `packages/test/example/README.md`；
- CLI 和 Test Project 的中英文用户文档；
- 新项目脚手架或复制示例；
- `packages/test/package.json` 的 bin；
- 配置加载错误中的 CommonJS 专属提示；
- 控制台中的 `midscene-workflow:` 前缀；
- 默认结果目录名称。

旧 RFC 中的名称和 `.cjs` 示例保留为设计历史，不批量改写。正式用户文档和示例只能使用
本 RFC 定义的新入口。

---

## 14. 备选方案

### 14.1 使用 Node.js 原生 TypeScript

Node.js 新版本可以直接执行部分 TypeScript，但不适合作为当前首期实现。

- `@midscene/test` 仍支持 Node.js 20，而原生 type stripping 从 Node.js 22 开始提供；
- 原生模式不读取 `tsconfig.json`；
- `enum`、带运行时代码的 `namespace`、parameter property 等语法需要额外转换；
- 不同 Node.js 小版本的默认开关和稳定性不同。

未来最低 Node.js 版本提升后，可以重新评估原生加载。公开配置文件和默认导出契约不需要
因此改变。

### 14.2 启动 `tsx` 子进程

CLI 可以用 `tsx` 启动另一个进程，再把配置序列化回主进程。这个方案与 RFC 0005 的架构
冲突。Node Handler、setup 函数和 Context 都不可序列化，最终仍需要把整个 runner 移入
子进程。

局部 `tsImport()` 可以直接在当前进程返回函数和对象，因此不需要跨进程协议。

### 14.3 使用 `typescript.transpileModule()`

直接转译入口文件看似简单，但还需要自行处理 ESM、CommonJS、本地 TS 依赖、source map、
module cache 和 tsconfig。最终会形成一个不完整的 TypeScript loader。

专用 loader 已经覆盖这些边界。`@midscene/test` 不应维护自己的模块系统实现。

### 14.4 要求用户自行安装 loader

可以要求用户通过 `node --import tsx` 启动 CLI。这个方案会把工具内部实现暴露给用户，
也会让 npm bin、IDE task 和 CI 命令具有不同启动方式。

配置支持应该由 `@midscene/test` 自带。用户只需要创建 `.ts` 文件。

### 14.5 只支持 CJS，并增加 JSDoc

用户可以在 `.cjs` 中编写 `@type` 注释，但仍需维护 `require()`、`module.exports` 和显式
类型 import。Context 泛型的表达也更繁琐。

JSDoc 不能提供本文要求的默认 TypeScript 体验，因此本文不支持 CommonJS 配置。

### 14.6 保留 Workflow Project 和 `midscene-workflow`

package 已经命名为 `@midscene/test`，YAML 中的可执行任务也已经称为 Case。继续保留旧
项目类型、runner 和命令，会让首次发布就包含两套术语和兼容代码。

Test Project 更准确地包含配置、文件发现、Workflow Document、Case、断言、报告和结果
汇总。本文拒绝只改一部分名称的方案。

### 14.7 使用 `midscene test`

子命令形式最适合统一的顶层 CLI，但当前 `midscene` 由 `@midscene/cli` 发布。用户只安装
`@midscene/test` 时不会得到这个命令。

本文不让一个 package 的基础入口依赖另一个 package。未来可以额外提供 `midscene test`
作为委托入口，而不删除 `midscene-test`。

### 14.8 增加 `test` 包装层

`midscene.config.ts` 可以导出 `{ test: TestProjectDefinition }`，为未来其他 Midscene 配置
预留顶层字段。但当前只有 Test Project 消费该文件，包装层不会带来实际能力，只会增加
缩进和类型层级。

本文直接导出 Test Project。未来确实出现第二类配置时，再通过独立 RFC 设计统一 schema。

### 14.9 支持更多 TypeScript 扩展名

`.mts` 和 `.cts` 可以显式控制模块类型，`.js` 和 `.cjs` 可以继续使用 CommonJS，但都会
扩大自动发现、冲突处理、loader 分支和测试矩阵。首期统一使用 `.ts` 和 ESM 风格源码，
不支持 `.js`、`.cjs`、`.mts`、`.cts` 和 `.tsx`。

### 14.10 支持 `tsconfig paths`

读取 `paths` 会让运行时解析依赖 tsconfig 查找位置，并可能与编辑器使用的配置不一致。
首期关闭 tsconfig 解析，只支持相对路径和 package specifier。

---

## 15. 实现顺序

1. 把 Test Project 类型、辅助函数、loader、runner 和文件发现 API 改为 Test 命名；
2. 删除旧 Workflow Project API 名称，不增加 deprecated alias；
3. 把内部文件改为 `test-project.ts`、`test-project-runner.ts`、`test-command.ts` 和
   `test-cli.ts`；
4. 提取 Test Project Definition 的 unwrap、validate 和 Registry 创建逻辑；
5. 增加异步 `loadTestProject()`，并接入局部 TS loader；
6. 增加 `midscene-test` bin，并删除 `midscene-workflow` bin；
7. 让 `runTestProject()` 等待异步 loader；
8. 把配置发现改为精确匹配 `midscene.config.ts`，同基础名的其他扩展名直接报错；
9. 删除同步配置 loader 和 CommonJS 加载分支；
10. 把默认结果目录和控制台前缀改为 Test 命名；
11. 增加 loader、类型和 CLI E2E 测试；
12. 把示例迁移为新命令、新 API 和 `.ts` 配置；
13. 更新中英文用户文档和错误信息。

实现涉及 `@midscene/test` 的运行时依赖和公开导出。完成时应运行：

```bash
pnpm run lint
npx nx test @midscene/test
npx nx build @midscene/test
```

---

## 16. 验收标准

- `@midscene/test` 发布 `midscene-test`；
- package 不发布 `midscene-workflow`；
- 新项目可以只创建 `midscene.config.ts`；
- `midscene.config.ts` 直接默认导出 Test Project，不增加 `test` 包装层；
- 配置可以使用 `import`、类型声明和 `export default`；
- `defineTestProject()` 为所有公开字段提供类型提示；
- Document Context 类型可以传递给自定义 Node；
- 配置可以导入本地 TypeScript Node 模块；
- CLI 不要求用户安装 loader 或修改启动命令；
- 配置、setup 和 Node Handler 继续在同一进程运行；
- 每次 Test Project Run 只加载配置一次；
- 配置文件只支持 `.ts`；
- `.js`、`.cjs`、`.mts`、`.cts` 和 `.tsx` 不受支持；
- `midscene.workflow.config.*` 不会被自动发现；
- 运行时不解析 `tsconfig.json` 的 `paths`；
- 默认结果目录使用 `.midscene/test-results`；
- 项目层公开类型和函数全部使用 Test Project 命名；
- `WorkflowProject*`、`defineWorkflowProject()`、`loadWorkflowProject*()` 和
  `runWorkflowProject()` 不再导出；
- 不导出 `loadTestProjectSync()`，programmatic API 只提供异步配置加载；
- Workflow Document、Case、Step 和 Node 的术语保持不变；
- 多配置、转译、导入、导出和校验错误可以明确区分；
- CLI 不把 TypeScript 转译描述为完整类型检查；
- model-free 单元测试、类型测试和 CLI E2E 覆盖主要边界。

---

## 17. 参考资料

- [Node.js：Modules: TypeScript](https://nodejs.org/api/typescript.html)
- [tsx：Developer API](https://tsx.is/dev-api/)
- [tsx：`tsImport()`](https://tsx.is/dev-api/ts-import)
