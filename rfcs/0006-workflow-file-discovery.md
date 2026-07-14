# RFC 0006 · Workflow File Discovery

状态：**草稿 / 待评审**

范围：定义 workflow 文件发现配置。项目可以声明搜索根目录、包含规则和排除规则。

本 RFC 同时解释 TypeScript/ESM config 的含义。这项能力不在本次实现范围内。

本 RFC 建立在 RFC 0001～0005 之上：

- RFC 0001 定义 node input、output、timeout 和错误处理；
- RFC 0002 定义多 workflow 文件和 collection；
- RFC 0003 定义 setup context 和 teardown；
- RFC 0004 定义 document lifecycle 和 YAML lifecycle hooks；
- RFC 0005 定义主进程 workflow runner、调度和 project result。

本 RFC 不修改 RFC 0004 的 lifecycle、context 和 teardown 语义。

---

## 1. 结论

`WorkflowProjectDefinition` 增加 `files`：

```js
module.exports = defineWorkflowProject({
  files: {
    root: './e2e',
    include: ['**/*.workflow.yaml', '**/*.workflow.yml'],
    exclude: ['fixtures/**', '**/*.draft.workflow.yaml'],
  },

  nodes: [],
});
```

路径解析与 Node.js 的 `path.resolve()` 一致：

- 相对的 `files.root` 以启动 CLI 时的 `cwd` 为基准；
- 绝对的 `files.root` 直接使用；
- 未配置 `files.root` 时，继续使用 CLI 的 `projectRoot`；
- `include` 和 `exclude` 相对于 `files.root`；
- `files.root` 可以位于 `projectRoot` 外；
- `sourcePath` 相对于规范化后的 `files.root`。

规范化过程等价于：

```ts
const projectRoot = path.resolve(cwd, cliProjectPath ?? '.');
const filesRoot = path.resolve(
  cwd,
  project.files?.root ?? projectRoot,
);
```

runner 必须先加载 project config，再发现 workflow 文件。project config、node registry、
collection 和执行都位于 RFC 0005 定义的 CLI 主进程中。

---

## 2. 设计目标

1. **范围明确**：项目可以声明 workflow 根目录和 glob pattern。
2. **保持兼容**：未配置 `files` 时，继续发现项目目录中的 YAML 文件。
3. **结果稳定**：同一组文件始终按规范化路径排序。
4. **身份稳定**：`sourcePath` 相对于发现根目录，不受 config 文件位置影响。
5. **路径通用**：发现根目录可以是相对路径、绝对路径或 project root 外的目录。
6. **便于排查**：project result 保存规范化后的发现配置和最终文件列表。
7. **职责单一**：文件发现只确定输入文件，不负责 workflow 筛选和执行策略。

---

## 3. 首期不做的能力

本 RFC 不包含以下能力：

- 不支持按 workflow name 或 tag 筛选；
- 不支持 CLI 临时追加 include/exclude pattern；
- 不支持 watch mode；
- 不提供 `follow: true` 的 symlink 遍历选项；
- 不支持 TypeScript 或 ESM config loader；
- 不增加 `runner` 或 `testRunner` 配置对象；
- 不增加 workflow 级 timeout；
- 不修改 `setupDocument()`；
- 不增加代码型 lifecycle hook；
- 不增加 attempt 私有 context 或 teardown。

这些能力可以由后续 RFC 分别讨论。

---

## 4. Project Config API

### 4.1 类型

`WorkflowProjectDefinition` 增加可选的 `files` 字段：

```ts
export interface WorkflowFileDiscovery {
  /** 相对于 CLI 启动时的 cwd。也可以是绝对路径。 */
  root?: string;

  /** 相对于 root 的 glob。 */
  include?: readonly string[];

  /** 相对于 root 的 glob。 */
  exclude?: readonly string[];
}

export interface WorkflowProjectDefinition<TContext = undefined> {
  files?: WorkflowFileDiscovery;

  // RFC 0004 已定义的字段保持不变。
  nodes: readonly NodeDefinition<any, any, TContext>[];
  documentNodes?: readonly DocumentNodeDefinition<
    any,
    any,
    TContext
  >[];
  setupDocument?: WorkflowDocumentSetup<TContext>;
}
```

本 RFC 不增加新的 context 泛型，也不改变 node registry。

### 4.2 为什么使用 `files`

旧方案使用 `testDir`、`include` 和 `exclude` 三个顶层字段。本 RFC 把三个字段放进
`files`，原因如下：

1. 三个字段使用同一个路径解析作用域；
2. project config 顶层不会继续增加零散的文件选项；
3. 后续可以在同一个对象中增加文件系统选项；
4. `files` 表达输入文件集合，不绑定通用 test runner 的 test file 概念。

本 RFC 不使用 `discovery`。这个名称描述内部阶段，但没有直接说明用户配置的是文件。

### 4.3 默认值

未提供 `files` 或 `files.root` 时，发现根目录沿用 CLI 的 `projectRoot`。规范化结果如下：

```ts
{
  root: projectRoot,
  include: ['**/*.yaml', '**/*.yml'],
  exclude: [],
}
```

engine 始终追加以下内置排除规则：

```text
**/.git/**
**/.midscene/**
**/node_modules/**
```

默认 include 沿用当前递归发现行为。本 RFC 不把默认值改成
`**/*.workflow.yaml`。这个修改会导致现有项目找不到文件。

显式空数组遵循普通集合语义：

- `include: []` 匹配零个文件；
- `exclude: []` 不增加用户排除规则；
- 内置排除规则始终生效。

匹配结果为空时，runner 沿用现有错误：

```text
No workflow YAML files found in <root>.
```

`include: []` 本身不是 schema error。

---

## 5. 路径与 Glob 语义

### 5.1 路径基准

路径解析遵循以下规则：

1. CLI 启动时保存 `cwd`；
2. CLI 位置参数通过 `path.resolve(cwd, cliProjectPath)` 得到 `projectRoot`；
3. `files.root` 通过 `path.resolve(cwd, files.root)` 得到 `filesRoot`；
4. 未配置 `files.root` 时，`filesRoot` 等于 `projectRoot`；
5. `include` 和 `exclude` 相对于 `filesRoot`；
6. pattern 和 `sourcePath` 使用 `/`；
7. `sourcePath` 相对于 `filesRoot`。

`filesRoot` 与 `projectRoot` 不要求存在包含关系。以下两种配置都有效：

```js
files: {
  root: '../another-project',
}

files: {
  root: '/opt/workflow-cases',
}
```

相对路径始终以启动 CLI 时的 `cwd` 为基准，而不是 config 所在目录。绝对路径经过
`path.resolve()` 后保持不变。

`projectRoot` 继续负责查找默认 config、确定默认结果目录和生成项目身份。`filesRoot` 只
负责文件发现和 `sourcePath` 计算。

### 5.2 Glob 语法

首期使用 [`glob@11`](https://isaacs.github.io/node-glob/) 解析 pattern 和遍历目录。
`@midscene/workflow` 必须把 `glob` 声明为直接依赖，不能依赖其他 workspace package 间接
提供它。

使用库而不是自行实现，原因如下：

1. globstar、brace、extglob 和字符转义存在大量边界情况；
2. Windows drive、UNC path 和大小写规则需要统一处理；
3. `ignore` 可以在遍历阶段跳过目录，避免先扫描整个 `node_modules`；
4. `glob@11` 支持当前 package 的 Node.js 版本范围；
5. 仓库已经锁定 `glob@11.0.0`，不需要引入另一套 pattern 语义。

支持的语法以 `glob@11` 使用的 minimatch 语义为准，包括：

```text
*  **  ?  [...]  {...}  +(pattern)  @(pattern)
```

pattern 必须使用 `/` 作为路径分隔符。Windows 下的 `\` 仍表示转义字符。本 RFC 不启用
`windowsPathsNoEscape`。

include 和 exclude pattern 必须是相对 pattern，不能包含 `..` 路径段，也不能以 `!`
开头。排除规则统一写入 `exclude`。这样可以避免 pattern 绕过 `filesRoot`，也可以避免
同一份配置使用两种排除方式。

runner 使用异步 `glob()`，不使用 `globSync()`：

```ts
import { glob } from 'glob';

const matches = include.length === 0
  ? []
  : await glob(include, {
      cwd: filesRoot,
      ignore: [...BUILT_IN_EXCLUDES, ...exclude],
      absolute: true,
      nodir: true,
      dot: true,
      follow: false,
      windowsPathsNoEscape: false,
    });
```

选项语义如下：

- `cwd: filesRoot`：所有相对 pattern 从发现根目录开始；
- `ignore`：在遍历阶段应用内置和用户排除规则；
- `absolute: true`：统一返回绝对路径；
- `nodir: true`：只返回文件；
- `dot: true`：允许 include 匹配普通隐藏目录；
- `follow: false`：不启用完整的目录 symlink 递归；
- `windowsPathsNoEscape: false`：所有平台统一使用 POSIX pattern。

不启用 `matchBase`。因此，`*.yaml` 只匹配 `filesRoot` 直接包含的文件。递归匹配必须显式
写成 `**/*.yaml`。

`glob()` 的返回顺序不属于 API 契约。engine 必须在库外执行以下操作：

1. 规范化绝对路径；
2. 通过词法路径和 realpath 检查匹配结果没有离开 `filesRoot`；
3. 对绝对路径去重；
4. 生成相对于 `filesRoot` 的 POSIX `sourcePath`；
5. 按 `sourcePath` 排序。

`include: []` 不调用 `glob()`，直接得到空结果。

文件发现流程如下：

```text
resolve project root
load project config
normalize files config
expand include patterns under files.root
remove built-in and user excludes
deduplicate absolute paths
reject matches outside files.root
sort by normalized sourcePath
create project sources
```

engine 不能依赖 `glob()` 或文件系统的返回顺序。

### 5.3 Symlink 和隐藏目录

首期不提供开启 `follow` 的配置。`glob@11` 的 `follow: false` 遵循 Bash 语义：当 `**`
不是 pattern 的第一段时，仍可能经过一层 symlink。因此，engine 不能只依赖 `follow`
选项实现路径边界。

engine 必须分别计算 `filesRoot` 和匹配文件的 realpath。匹配文件的 realpath 位于真实
`filesRoot` 外部时，runner 直接失败。这个检查可以阻止 symlink 绕过发现根目录。

普通隐藏目录不会自动排除。例如，`.cases/example.yaml` 仍然可以匹配。用户可以通过
`exclude` 排除这些目录。只有第 4.3 节列出的目录始终排除。

---

## 6. 加载时序

### 6.1 Config 加载时机

当前 runner 先发现文件，再加载 project config。增加 `files` 后，顺序改为：

```text
resolve project root and config path
load and validate project config
create node registries
discover workflow files
collect workflow documents
run workflows in the main process
write project result
```

project config 每次 CLI run 只求值一次。文件发现完成后，runner 直接复用这次加载得到的
project definition 和 registries，不重新加载 config，也不向子进程传递 handler：

```text
CLI main process:
  load config once
  read and normalize files
  create node registries once
  discover and collect sources
  setupDocument -> lifecycle and workflow nodes -> teardown
```

### 6.2 资源边界

config 顶层只负责声明 files、nodes 和 lifecycle callbacks。外部资源仍然在
`setupDocument()` 中创建、使用和销毁：

```js
module.exports = defineWorkflowProject({
  nodes,

  async setupDocument({ env, onTeardown }) {
    const database = await connectDatabase(env.DATABASE_URL);
    onTeardown(() => database.close());

    return { database };
  },
});
```

node 通过 `ctx.context` 访问这些资源。`setupDocument()` 和 node handler 都运行在 CLI
主进程中，因此数据库 client、UI Agent 或页面对象可以直接作为普通 JavaScript 引用共享，
不需要序列化或 RPC。

config 顶层仍然不适合创建资源。例如，以下写法无效：

```js
const database = connectDatabase(process.env.DATABASE_URL);
const server = startServer();

module.exports = defineWorkflowProject({
  nodes,
});
```

这些资源在 document lifecycle 之外创建，无法通过 document teardown 可靠释放，也会让
模块加载产生端口占用、写文件或外部注册等副作用。

config 顶层必须满足以下约束：

- 只声明 `files`、nodes、document nodes 和 lifecycle callbacks；
- 可以创建普通 object、schema 和纯函数；
- 不能连接外部服务、启动 server、创建设备会话或写文件；
- 外部资源统一在 `setupDocument()` 中创建，并通过 `onTeardown()` 释放。

框架无法可靠地静态检测所有顶层副作用。这些要求属于 project config 的公开契约。

### 6.3 Node 定义、注册和执行

node lifecycle 需要区分三个动作：

| 动作 | CLI 主进程中的次数 |
|---|---:|
| 求值 config 和被 import 的 node 模块 | 1 |
| 调用 `defineNode()` 创建 definition | 1 |
| 构建用于执行的 `NodeRegistry` | 1 |
| 调用 node `execute()` | 每个实际执行的 step 一次 |

当前 `defineNode()` 只校验 `name` 和 `execute`，然后返回原 definition object。这个操作
必须保持轻量和无外部副作用。runner 使用同一次 config 加载得到的 definitions 构建
registry，供 collection 和执行共同使用：

```js
const node = defineNode({
  name: 'database.query',
  execute({ context }) {
    return context.database.query();
  },
});
```

node module 顶层不能连接数据库或创建 UI Agent。runtime resource 仍然由
`setupDocument()` 创建。

### 6.4 Project Result

RFC 0005 定义的 `project.json` 保存最终 `sources`。本 RFC 同时保存规范化后的发现配置：

```ts
export interface WorkflowProjectRunRecord {
  // 现有字段保持不变。
  files: {
    root: string;
    include: readonly string[];
    exclude: readonly string[];
  };
  sources: readonly WorkflowDocumentSource[];
}
```

`root` 保存规范化后的绝对路径。`exclude` 保存用户规则和内置规则的最终结果。

---

## 7. Collection 与错误边界

文件发现只判断路径是否匹配，不预读 YAML 内容。

每个匹配文件仍由 `collectWorkflowDocument()` 独立处理：

- YAML 语法错误进入 collection error；
- 顶层 schema 错误进入 collection error；
- 未注册 node 进入 collection error；
- 一个文件失败不改变其他文件的 `sourcePath`；
- 多个 pattern 匹配同一个文件时，只 collection 一次。

以下情况由 runner 在 collection 和 document lifecycle 启动前直接失败：

- `files` 不是 object；
- `root` 不是非空字符串；
- `include` 或 `exclude` 不是字符串数组；
- pattern 是空字符串；
- include 或 exclude pattern 是绝对路径；
- include 或 exclude pattern 包含 `..` 路径段；
- include 或 exclude pattern 使用 `!` negation；
- root 不存在或不是目录；
- include pattern 通过词法路径或 symlink 匹配到 `filesRoot` 外部；
- 最终没有匹配文件。

`include: []` 会自然得到零个匹配文件，并触发“没有 workflow 文件”的运行错误。

---

## 8. TypeScript/ESM Config

“TypeScript/ESM config”指支持以下写法：

```ts
import { defineWorkflowProject } from '@midscene/workflow/config';

export default defineWorkflowProject({
  nodes: [],
});
```

它至少包括以下文件：

- `midscene.workflow.config.ts`；
- `midscene.workflow.config.mts`；
- `midscene.workflow.config.mjs`；
- ESM package 中使用 `export default` 的 `.js` config。

当前 config loader 使用同步 `require()`。因此，当前可靠支持的是 CommonJS：

```js
const {
  defineWorkflowProject,
} = require('@midscene/workflow/config');

module.exports = defineWorkflowProject({
  nodes: [],
});
```

支持 TypeScript/ESM config 需要改造 loader。实现至少需要异步 dynamic import，并对
TypeScript 进行 runtime transpilation 或预打包。由于 RFC 0005 已经把 config 加载和执行
统一在主进程中，这项改造不需要再维护第二套 loader；runner 只需要在文件发现前等待
config 加载完成。

这项工作属于 config loader 能力。本 RFC 继续使用现有 CommonJS loader。

---

## 9. Runner 配置

RFC 0005 的 runner 只支持串行执行。CLI 和 programmatic API 都不提供 parallel、
`maxConcurrency`、retry 或 bail。因此，project config 不增加 `runner` 或 `testRunner`
字段。

workflow timeout 也不属于文件发现能力。它涉及 `AbortSignal`、`afterEach`、node 取消和
结果写入，需要通过独立 RFC 定义。

本 RFC 只配置输入文件集合，不预留 runner policy 字段。

---

## 10. 备选方案

### 10.1 使用顶层 testDir/include/exclude

不采用。三个字段共享路径基准。放入 `files` 更容易理解，也为后续文件选项保留扩展
空间。

### 10.2 只支持 CLI Glob

不采用。文件集合属于项目的稳定定义，应该进入版本控制。CLI 更适合提供临时筛选和
覆盖。

### 10.3 默认只匹配 workflow.yaml

不采用。当前 runner 会递归发现 `.yaml` 和 `.yml`。收紧默认值会破坏现有项目。

项目可以显式配置以下规则：

```js
files: {
  include: ['**/*.workflow.yaml'],
}
```

### 10.4 相对于 Config 目录解析 root

不采用。CLI 中的其他用户输入路径以启动目录为基准。`files.root` 应遵循相同规则。
config 位置只决定加载哪个配置文件，不应改变配置值的路径基准。

### 10.5 把 Project Root 作为文件边界

不采用。`projectRoot` 负责 project config、默认结果目录和项目身份。它不代表 workflow
文件必须存放在该目录中。用户可以复用 project root 外的用例目录，也可以直接配置绝对
路径。

`filesRoot` 仍然是 include 和 exclude 的匹配边界。用户需要发现另一个目录时，应直接
修改 `files.root`。

### 10.6 文件发现时解析 YAML

不采用。文件匹配和 collection 是两个错误边界。发现阶段只负责构造稳定的输入文件
列表。

---

## 11. 实现顺序

1. 给 `@midscene/workflow` 增加直接依赖 `glob@11.0.0`。
2. 增加 `WorkflowFileDiscovery` 和规范化类型。
3. 让 CLI 把启动时的 `cwd` 传给 runner。
4. 让 runner 在发现文件前加载并校验 project definition。
5. 通过 `path.resolve(cwd, files.root)` 规范化显式 root。
6. 使用异步 `glob()` 替换手写递归遍历。
7. 实现 `filesRoot` 边界、内置 exclude、去重和稳定排序。
8. 把绝对 `filesRoot`、规范化配置和 sources 写入 `project.json`。
9. 更新 config loader、runner 和 CLI e2e tests。

---

## 12. 测试要求

### 12.1 Unit Tests

- 未配置 `files` 时保持当前发现结果；
- `root`、include 和 exclude 使用正确的路径基准；
- `*`、`**`、character class、brace 和 extglob 使用 `glob@11` 语义；
- `*.yaml` 不会隐式变成 `**/*.yaml`；
- pattern 在 Windows 下仍使用 `/`；
- include 和 exclude 的绝对 pattern 都会被拒绝；
- include 和 exclude 中包含 `..` 路径段的 pattern 会被拒绝；
- include 和 exclude 的 `!` negation 都会被拒绝；
- `dot: true` 允许匹配普通隐藏目录；
- 多个 include pattern 的重复结果只保留一次；
- 内置 exclude 始终生效；
- `include: []` 得到零个文件；
- 相对 root 以 CLI 启动时的 `cwd` 为基准；
- 绝对 root 保持不变；
- project root 外部的 root 可以正常发现文件；
- 未配置 root 时继续使用 project root；
- include pattern 不能匹配 `filesRoot` 外部的文件；
- symlink 不能绕过真实 `filesRoot`；
- Windows separator 规范化为 `/`；
- sources 按规范化后的 `sourcePath` 稳定排序；
- project config 顶层在一次 run 中只求值一次；
- config 顶层不会执行 `setupDocument()`；
- `NodeRegistry` 和 `DocumentNodeRegistry` 在主进程中各创建一次；
- 文件发现阶段不执行任何 node handler；
- `project.json` 保存规范化后的发现配置和 sources；
- 无效 root 和 pattern 在 collection 与 document lifecycle 前报错。

### 12.2 E2E Tests

增加 model-free CLI fixture，覆盖以下开发者配置：

```js
module.exports = defineWorkflowProject({
  files: {
    root: './e2e',
    include: ['**/*.workflow.yaml'],
    exclude: ['**/*.draft.workflow.yaml'],
  },
  nodes,
});
```

e2e tests 验证：

- include 只选择匹配文件；
- exclude 排除 draft 文件；
- 相对 root 按 CLI 启动目录解析；
- project root 外部的 root 可以执行；
- 绝对 root 可以执行；
- 非 workflow YAML 不进入 collection；
- 重复 pattern 不产生重复 test；
- sources 和最终 test 数量一致；
- 无匹配文件时 CLI 返回明确错误。

---

## 13. 验收标准

- 项目可以在 config 中定义 workflow root、include 和 exclude；
- 未配置 `files` 的项目保持现有发现行为；
- 文件发现结果会去重并稳定排序；
- glob pattern 由 `glob@11` 解析，engine 不自行实现 matcher；
- 相对 `files.root` 通过 `path.resolve(cwd, files.root)` 解析；
- 绝对 `files.root` 和 project root 外部目录均可使用；
- `sourcePath` 相对于规范化后的 `filesRoot`；
- config 在文件发现前加载一次，但文件发现阶段不执行 `setupDocument()`；
- runtime resource 在主进程的 `setupDocument()` 中创建；
- 用于 collection 和执行的 node registries 在主进程中各创建一次；
- project result 不序列化 node handler、closure 或 resource object；
- `project.json` 保存规范化后的发现配置和最终 sources；
- 匹配为空时，runner 在 collection 和 document lifecycle 前失败；
- workflow lifecycle、context 和 teardown 保持 RFC 0004 的现有行为；
- TypeScript/ESM config 和 workflow timeout 保持在本 RFC 范围外；runner 只支持串行执行。

核心边界是：`files` 只定义哪些 YAML 文件属于当前 workflow 项目。它不改变 YAML 内容、
workflow lifecycle 或执行策略。
