# RFC 0007 · Workflow Project 文件选择

状态：**已实现**

范围：允许项目配置声明 Workflow Project 的根目录，并通过 glob 选择需要运行的
Workflow YAML 文件。

本 RFC 建立在 RFC 0005 和 RFC 0006 之上。RFC 0005 定义 Workflow Project runner，
RFC 0006 定义 Workflow Document 和 Case 术语。

---

## 1. 结论

`WorkflowProjectDefinition` 增加 `root` 和 `files` 字段。`root` 声明项目根目录，
`files.include` 声明需要收集的 YAML，`files.exclude` 声明需要排除的 YAML。

```js
// midscene.workflow.config.cjs
const { defineWorkflowProject } = require('@midscene/test/config');
const { nodes } = require('./nodes');

module.exports = defineWorkflowProject({
  root: './e2e',
  files: {
    include: ['workflows/**/*.{yaml,yml}'],
    exclude: ['workflows/**/*.draft.yaml'],
  },
  nodes,
});
```

完整类型如下。

```ts
export interface WorkflowFileSelection {
  include: readonly string[];
  exclude?: readonly string[];
}

export interface WorkflowProjectDefinition<TContext = undefined> {
  root?: string;
  files?: WorkflowFileSelection;
  nodes: readonly NodeDefinition<any, any, TContext>[];
  documentNodes?: readonly DocumentNodeDefinition<any, any, TContext>[];
  setupDocument?: WorkflowDocumentSetup<TContext>;
}
```

所有 pattern 都以最终解析得到的项目根目录为基准。配置没有 `root`，CLI 也没有接收目录
参数时，项目根目录就是当前 `pwd`。匹配结果只保留 `.yaml` 和 `.yml` 文件，去重后按
相对路径排序。`exclude` 的优先级高于 `include`。

没有配置 `files` 时，runner 保持当前行为，递归发现项目根目录内的全部 `.yaml` 和
`.yml` 文件。配置了 `files` 时，`include` 必须是非空数组。

---

## 2. 问题

当前 runner 从 `projectRoot` 开始递归遍历，并执行找到的全部 `.yaml` 和 `.yml` 文件。
它只固定跳过 `.git`、`.midscene` 和 `node_modules`。

这个规则适合最小示例，但不适合包含多种 YAML 的真实项目。项目中可能同时存在以下
文件：

- Workflow Document；
- CI 配置；
- OpenAPI 描述；
- Kubernetes 配置；
- 测试数据和临时草稿。

runner 无法在解析前判断一个 YAML 是否为 Workflow Document。因此，无关 YAML 会产生
collection error。开发者也无法只运行约定目录中的文件。

文件范围属于 Workflow Project，而不是单个 Workflow Document。它应该放在项目配置中，
并在 collection 之前生效。

---

## 3. 设计目标

1. **显式范围**：项目可以准确声明 Workflow YAML 的位置。
2. **稳定结果**：相同配置在不同平台产生相同的 source 顺序。
3. **项目边界**：pattern 不能读取项目根目录之外的文件。
4. **错误明确**：无效配置和零匹配都直接报错。
5. **默认简单**：未配置文件规则的最小项目仍可直接运行。
6. **便于扩展**：后续 watch、shard 和编辑器集成复用同一套文件集合。

---

## 4. 配置字段

### 4.1 `root`

`root` 声明 Workflow Project 的根目录。相对路径以配置文件所在目录为基准。

```js
module.exports = defineWorkflowProject({
  root: './e2e',
  nodes,
});
```

假设配置文件位于 `/workspace/shop/midscene.workflow.config.cjs`，上述配置会把
`/workspace/shop/e2e` 设为项目根目录。

`root` 可以是绝对路径，但推荐使用相对路径，让配置可以随项目移动。`root` 必须指向一个
已经存在的目录。

### 4.2 使用 `files`，不使用 `file`

字段使用复数 `files`，因为它描述一组文件。

本 RFC 不使用 `documents`。Workflow Document 是 YAML 经过解析、校验和 Node resolution
之后的领域对象。`files` 只负责解析前的路径选择，名称应体现它的职责。

本 RFC 也不把 `include` 和 `exclude` 放在配置顶层。嵌套字段可以明确两者都属于文件发现，
并为后续的文件级配置保留命名空间。

### 4.3 `include`

`files.include` 是必填的非空字符串数组。每一项可以是具体文件，也可以是 glob。

```ts
files: {
  include: [
    'workflows/smoke.yaml',
    'workflows/regression/**/*.yml',
  ],
}
```

多个 pattern 取并集。一个文件被多个 pattern 匹配时只执行一次。

单个 pattern 可以匹配零个文件。这样可以让同一份配置覆盖可选目录。全部 pattern 的最终
结果为空时，runner 报错。

### 4.4 `exclude`

`files.exclude` 是可选的字符串数组。它从 `include` 的结果中删除匹配项。

```ts
files: {
  include: ['workflows/**/*.{yaml,yml}'],
  exclude: [
    'workflows/fixtures/**',
    'workflows/**/*.draft.yaml',
  ],
}
```

`exclude` 始终优先。`include` 的顺序不能重新加入已经排除的文件。

首期不支持在 `include` 中使用 `!pattern`。排除规则统一写入 `exclude`，避免两种等价语法
产生顺序差异。

---

## 5. 根目录与 Pattern 语义

### 5.1 两种目录

runner 需要区分启动目录和项目根目录。

- 启动目录用于发现默认配置文件；
- 项目根目录用于发现 YAML、计算 `sourcePath` 和存放默认结果。

CLI 的位置参数可以显式指定项目根目录：

```text
midscene-workflow [project-directory]
```

没有位置参数时，启动目录是 `process.cwd()`，也就是当前 `pwd`。runner 先从启动目录发现并
加载配置，再读取配置中的 `root`。

传入位置参数时，runner 从该目录发现默认配置。没有位置参数时，runner 从当前 `pwd`
发现默认配置。显式 `--config` 不使用这套发现规则。

### 5.2 优先级

项目根目录按以下优先级确定：

1. CLI 显式传入的 `project-directory`；
2. 项目配置中的 `root`；
3. 当前 `pwd`。

CLI 参数的优先级最高，因为它表达本次运行的显式覆盖。配置中的相对 `root` 始终相对于
配置文件所在目录，不相对于调用命令时的 `pwd`。

例如：

```text
pwd
# /workspace/shop

midscene-workflow
# 未配置 root 时，项目根目录为 /workspace/shop

midscene-workflow ./e2e
# 项目根目录为 /workspace/shop/e2e，并覆盖配置中的 root
```

显式 `--config` 只改变配置文件的位置，不直接改变项目根目录。runner 加载指定配置后，
仍按以上优先级解析 `root`。

### 5.3 Pattern 基准

所有 pattern 都相对于最终的项目根目录，不相对于配置文件所在目录。

项目根目录承担以下职责：

- CLI 的项目范围；
- `sourcePath` 的相对路径基准；
- Case ID 的输入；
- 默认结果目录的基准。

文件选择继续使用同一个基准，可以保证配置文件通过 `--config` 放到其他目录时，不改变
Workflow Document 的身份。

### 5.4 路径格式

pattern 使用 POSIX 分隔符 `/`，并且使用不区分大小写的匹配。runner 在 Windows、macOS
和 Linux 上都按同一规则解释配置。

首期支持以下常用语法：

```text
*                 匹配一层路径中的任意字符
**                跨目录匹配
?                 匹配一个字符
*.{yaml,yml}      匹配多个扩展名
```

绝对路径、包含 `..` 路径段、使用反斜杠、以 `!` 开头的 pattern 和空字符串都属于无效
配置。runner 应在开始文件发现前报告错误。

### 5.5 文件限制

文件选择只返回普通的 `.yaml` 和 `.yml` 文件。扩展名比较不区分大小写。匹配到的目录和
其他扩展名文件不会进入 collection。

runner 不跟随符号链接。这个限制可以防止 glob 通过链接离开项目根目录，也可以避免
目录循环。

以下目录始终排除：

```text
.git
.midscene
node_modules
```

这些目录是 runner 的安全和性能边界。用户配置不能重新包含它们。

### 5.6 顺序

runner 把匹配结果转换为相对于项目根目录的 POSIX 路径，然后按路径进行升序排序。
pattern 的声明顺序不影响执行顺序。

因此，以下两种配置产生相同的执行顺序。

```ts
include: ['b/**/*.yaml', 'a/**/*.yaml']
```

```ts
include: ['a/**/*.yaml', 'b/**/*.yaml']
```

如果将来需要显式控制 Document 顺序，应设计独立的调度能力，不应依赖 glob 顺序。

---

## 6. 默认行为

没有 `files` 字段时，runner 从项目根目录递归扫描 YAML，使用以下等价规则：

```ts
files: {
  include: ['**/*.{yaml,yml}'],
}
```

没有配置 `root`，CLI 也没有接收目录参数时，项目根目录就是当前 `pwd`。这个默认值保留
最小项目的零配置体验。项目一旦声明 `files`，就必须提供非空的 `files.include`。

本 RFC 不提供只写 `files.exclude` 的形式。开发者要使用排除规则时，也需要明确写出
include 范围。

```ts
files: {
  include: ['**/*.{yaml,yml}'],
  exclude: ['fixtures/**'],
}
```

这种约束可以让配置片段保持自包含。读者不需要先查阅隐式 include，才能理解 exclude
影响的集合。

---

## 7. Runner 初始化顺序

当前实现先发现 YAML，再加载项目配置。文件范围进入配置后，顺序改为：

```text
resolve cwd and CLI arguments
discover or resolve configPath
load and validate project config
create Node registries
resolve project root
resolve file selection
discover and sort Workflow YAML files
collect all Workflow Documents
run collected Documents
write project result
```

文件发现必须在任何 `setupDocument()` 调用之前完成。配置模块可以声明 Node 和 setup
函数，但不应在模块顶层创建外部资源。

文件发现函数使用以下接口：

```ts
export function discoverWorkflowFiles(
  projectRoot: string,
  selection?: WorkflowFileSelection,
): string[];
```

`runWorkflowProject()` 从已经加载的 project definition 取得 `files`，再调用
`discoverWorkflowFiles()`。

---

## 8. 校验与错误

以下情况在 collection 前直接报错，并终止本次 Project run：

- `files` 不是对象；
- `root` 不是字符串或是空字符串；
- 最终选定的项目根目录不存在或不是目录；
- `files.include` 缺失或为空数组；
- `include` 或 `exclude` 包含非字符串、空字符串或无效 pattern；
- pattern 是绝对路径；
- pattern 包含 `..` 路径段；
- 最终没有匹配到 Workflow YAML。

文件选择错误属于 Project 配置错误，不属于 collection error。runner 不为它生成伪造的
`sourcePath`，也不继续执行部分文件。

单个 include pattern 匹配为空不报错。例如，以下配置可以在 `mobile` 目录尚未创建时
继续运行 `web` 目录。

```ts
files: {
  include: ['web/**/*.yaml', 'mobile/**/*.yaml'],
}
```

---

## 9. Result 可观测性

`project.json` 继续把最终文件写入 `sources`。此外，它增加规范化后的文件选择规则：

```json
{
  "fileSelection": {
    "include": ["workflows/**/*.{yaml,yml}"],
    "exclude": ["workflows/**/*.draft.yaml"]
  },
  "sources": [
    {
      "sourcePath": "workflows/order/create.yaml"
    }
  ]
}
```

`fileSelection` 保存本次运行实际使用的规则。没有显式配置 `files` 时，也写入默认 include。
这样可以解释为什么某个 YAML 被运行或被排除。

结果格式不需要兼容旧版本。实现把 `project.json` 的版本号递增为 3。

---

## 10. 不包含的能力

本 RFC 不包含以下能力：

- 不支持从远程 URL、npm package 或 Git 仓库加载 YAML；
- 不支持 `extends` 或多份项目配置合并；
- 不读取 `.gitignore`；
- 不增加 CLI 的 `--include`、`--exclude` 或单文件参数；
- 不按 pattern 分组或改变 Document 调度顺序；
- 不增加 watch mode；
- 不允许选择项目根目录之外的文件；
- 不让 YAML Document 引用其他 YAML Document。

这些能力都可以建立在最终的文件集合之上，但需要分别定义覆盖规则、身份和错误语义。

---

## 11. 实现结论

1. 配置通过 `root` 声明项目根目录。
2. CLI 显式传入的目录覆盖配置中的 `root`。
3. 没有 `files` 时递归扫描项目根目录。
4. 没有 `root` 和 CLI 目录时，项目根目录就是当前 `pwd`。
5. 字段使用 `files.include`，不使用 `documents.include`。
6. 相对 `root` 以配置文件所在目录为基准。
7. 配置了 `files` 时，`include` 必填，`exclude` 可选。
8. pattern 始终以项目根目录为基准。
9. `project.json` 记录规范化后的 file selection，并使用版本 3。
