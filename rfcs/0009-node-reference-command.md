# RFC 0009 · Node Reference Markdown 命令

状态：**已实现**

范围：允许 Node Definition 使用 Zod 声明和校验输入，并增加一个 CLI 命令。该命令读取
Test Project 中注册的 Node，把 Zod Schema 转换成稳定的 Markdown 参考文档。AI Agent
可以把这份文档作为上下文，自主编写当前项目支持的 YAML Test Case。

不覆盖：根据 TypeScript 类型反向生成 Schema、自动生成 Test Case、描述 Node 输出，
以及发布远程 Node Registry。

本 RFC 建立在 RFC 0001 和 RFC 0008 之上：

- RFC 0001 定义 `defineNode()`、Node Input、`prompt` 和 `$`；
- RFC 0008 定义 `midscene-test`、`midscene.config.ts` 和 Test Project。

本 RFC 取代 RFC 0001 中“`defineNode` 没有 `input` 配置项”的限制，也取代“Node 自行
校验专属业务字段”的默认规则。声明 `inputSchema` 后，Engine 在调用 Handler 前使用 Zod
校验输入，并把解析后的类型传给 `ctx.input`。

---

## 1. 建议结论

推荐增加以下命令：

```bash
midscene-test describe-nodes [project-directory]
```

命令加载 `midscene.config.ts`，读取本次 Test Project 注册的全部 Node，并把 Markdown
写入 stdout。开发者可以直接保存结果：

```bash
pnpm exec midscene-test describe-nodes > midscene-nodes.md
```

Node 作者使用 Zod 声明 `inputSchema`。`ctx.input` 的类型直接由 Schema 推导：

```ts
import { defineNode, z } from '@midscene/test';

const createOrderInput = z.strictObject({
  customerId: z
    .string()
    .min(1)
    .describe('The stable customer ID in the test environment.'),
  amount: z
    .number()
    .positive()
    .describe('The order amount in the project default currency.'),
});

export const createOrderNode = defineNode({
  name: 'order.create',
  description: 'Create a test order for an existing customer.',
  inputSchema: createOrderInput,
  async execute(ctx) {
    // ctx.input 自动推导为：
    // { customerId: string; amount: number }
    await createOrder(ctx.input);
  },
});
```

生成的文档包含以下信息：

1. Workflow Step 的通用结构；
2. Node 的准确名称；
3. Node 的标题和描述；
4. 从 Zod 转换得到的完整 JSON Schema；
5. 未声明的文档字段及相应警告。

命令不执行 `setupDocument()`，不发现 YAML 文件，也不调用任何 Node Handler。

### 1.1 已确认的决策

本文采用以下决策：

1. 命令名使用 `midscene-test describe-nodes`；
2. 首期只输出 Markdown，不增加 JSON 或其他格式；
3. `inputSchema` 是可选字段；声明时使用 Zod 4；
4. Schema 描述完整的 Node Input，包括 `prompt`，但不包括 `$`；
5. Node 声明 Schema 时，Engine 在执行前调用 `inputSchema.safeParseAsync()`；
6. Node 声明 Schema 时，`ctx.input` 使用 `z.output<TSchema>`；
7. Markdown 使用 `z.toJSONSchema(..., { io: 'input' })` 生成 Draft 2020-12 Schema；
8. 命令列出 Test Project 中注册的全部 Node，不区分 Node 的来源；
9. Node 缺少描述或 Schema 时仍然出现在文档中；
10. stdout 只包含 Markdown，错误和警告写入 stderr；
11. 输出不包含时间戳和绝对路径，相同配置应产生相同内容。

---

## 2. 问题

Test Project 已经允许开发者注册业务 Node：

```ts
export default defineTestProject({
  nodes: [createOrderNode, queryDatabaseNode, ...midsceneNodes],
});
```

这些 Node 形成了项目专属的测试能力。但是，当前 Node Definition 主要服务于执行：

```ts
export interface DefineNodeOptions<TInput, TData, TContext> {
  name: string;
  title?: string;
  description?: string;
  execute(ctx: NodeExecutionContext<TInput, TContext>): NodeExecutionReturn<TData>;
}
```

TypeScript 泛型会在编译后消失。CLI 可以读取 `name` 和 `description`，却无法知道
`TInput` 包含哪些字段，也无法判断字段是否必填。开发者还要分别维护 Interface、运行时
校验代码和文档，三份定义很容易失去同步。

这会产生两个问题：

- 开发者需要重复维护类型、校验逻辑和 Node 使用文档；
- AI Agent 只能猜测 YAML 字段，无法可靠地生成业务 Test Case。

Zod Schema 可以同时提供运行时校验和 TypeScript 类型。CLI 再把它转换成 JSON Schema，
并汇总为一个自包含文件，供人类和 AI Agent 使用。

### 2.1 为什么不能读取 TypeScript 泛型

`defineNode<CreateOrderInput>()` 只提供编译期类型。运行 CLI 时，`CreateOrderInput` 已经被
擦除。通过 TypeScript Compiler API 反向分析源码也不能可靠解决问题：

- Node 可能来自 npm package；
- 类型可能包含条件类型、泛型和外部声明；
- 配置通过普通 JavaScript 控制流组装 Node；
- 源码类型不一定能转换为 JSON Schema；
- Compiler API 会显著增加启动成本和实现复杂度。

因此，Node 作者必须显式提供运行时可读取的 Schema。本文选择 Zod 作为作者入口，不要求
开发者手写 JSON Schema。

### 2.2 文档的目标读者

生成文档同时面向两类读者：

- 开发者查看当前项目实际注册的 Node；
- AI Agent 获取可以用于生成 YAML 的准确上下文。

文档必须优先保留精确信息。生成器不能根据字段名猜测类型，也不能为缺失的 Schema
自动补全参数。

---

## 3. 设计目标

1. **覆盖实际能力**：输出当前 Test Project 注册的全部 Node。
2. **单一事实来源**：Zod Schema 同时负责类型推导、运行时校验和文档生成。
3. **适合 Agent 消费**：Markdown 同时解释 Step 结构、Node 名称和输入边界。
4. **结果可以复现**：相同配置产生逐字节一致的 stdout。
5. **适合命令组合**：stdout 只有文档内容，可以安全重定向到文件。
6. **不触发测试副作用**：命令只加载配置，不启动 Document 生命周期。
7. **渐进采用**：现有 Node 没有 Schema 时仍可执行，也仍会出现在文档中。
8. **错误明确**：输入错误转换为稳定的 `NodeInputValidationError`。
9. **转换可靠**：无法转换成 JSON Schema 的 Zod 类型在生成文档前报错。

---

## 4. 非目标

本 RFC 不提供以下能力：

- 不从 TypeScript 泛型、Interface 或函数参数反向生成 Zod Schema；
- 不同时接受 Zod 和手写 JSON Schema 两种作者入口；
- 不描述 `NodeResult` 或输出数据；
- 不自动生成 YAML 示例；
- 不调用模型生成描述、示例或 Test Case；
- 不扫描 package 中未注册的 Node；
- 不把 Node 文档上传到远程服务；
- 不在命令中运行 `setupDocument()` 或 Node Handler；
- 不承诺生成文档可以替代面向用户的完整教程。

没有 `inputSchema` 的遗留 Node 继续按照 RFC 0001 的规则自行校验。声明 Schema 的 Node
由 Engine 统一校验，Handler 不再重复调用 `parse()`。

---

## 5. Node 元数据契约

### 5.1 Zod 版本与导出

`@midscene/test` 增加 Zod 4 运行时依赖，并从 package 根入口重新导出 `z`：

```ts
import { defineNode, z } from '@midscene/test';
```

开发者不需要单独安装 Zod，也不会意外使用与 Midscene 不兼容的主版本。仓库中的其他
package 可以继续使用自己的 Zod 版本；本 RFC 不要求全仓升级。

Zod 4 提供官方 `z.toJSONSchema()`。生成器不引入 `zod-to-json-schema` 等第三方转换器。

### 5.2 API 变更

`inputSchema` 在基础 Node Definition 中保持可选。`defineNode()` 增加一个 Schema 感知的
重载，以便在字段存在时推导更准确的类型：

```ts
export interface DefineNodeOptions<
  TInput = unknown,
  TData = unknown,
  TContext = unknown,
> {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: z.ZodObject;
  execute(
    ctx: NodeExecutionContext<TInput, TContext>,
  ): NodeExecutionReturn<TData>;
}

export interface DefineNodeWithSchemaOptions<
  TSchema extends z.ZodObject,
  TData = unknown,
  TContext = unknown,
> {
  name: string;
  title?: string;
  description?: string;
  inputSchema: TSchema;
  execute(
    ctx: NodeExecutionContext<z.output<TSchema>, TContext>,
  ): NodeExecutionReturn<TData>;
}

export function defineNode<
  TSchema extends z.ZodObject,
  TData = unknown,
  TContext = unknown,
>(
  options: DefineNodeWithSchemaOptions<TSchema, TData, TContext>,
): NodeDefinition<z.output<TSchema>, TData, TContext>;

export function defineNode<
  TInput = unknown,
  TData = unknown,
  TContext = unknown,
>(
  options: DefineNodeOptions<TInput, TData, TContext>,
): NodeDefinition<TInput, TData, TContext>;
```

调用方不传泛型时，TypeScript 从 `inputSchema` 推导 `ctx.input`：

```ts
const inputSchema = z.strictObject({
  sql: z.string().min(1),
  parameters: z.array(z.unknown()).optional(),
});

defineNode({
  name: 'database.query',
  inputSchema,
  execute(ctx) {
    ctx.input.sql; // string
    ctx.input.parameters; // unknown[] | undefined
  },
});
```

需要显式指定 Document Context 时，可以传入 Schema 类型、输出类型和 Context：

```ts
defineNode<typeof inputSchema, QueryResult, ProjectContext>({
  name: 'database.query',
  inputSchema,
  execute(ctx) {
    ctx.context.database;
  },
});
```

不声明 `inputSchema` 是长期支持的公开用法，不是过渡兼容入口。此时调用方继续使用原来的
`<TInput, TData, TContext>` 泛型，Handler 也继续自行校验输入：

```ts
defineNode<{ message: string }>({
  name: 'legacy.notify',
  execute(ctx) {
    // 由 Handler 校验 ctx.input.message。
  },
});
```

### 5.3 `name`、`title` 和 `description`

`name` 继续作为 YAML Step 的准确键名。生成器不能把 `title` 转换为 Node 名称，也不能
修改名称的大小写。

`title` 是可选的短标题。`description` 是可选的 Markdown 文本，应说明 Node 的业务效果、
适用条件和重要副作用。字段说明直接写在 Zod Schema 中：

```ts
const inputSchema = z.strictObject({
  customerId: z.string().describe('The existing customer ID.'),
});
```

`defineNode()` 对已提供的标题和描述执行非空字符串校验。生成器保留描述中的 Markdown，
不执行 HTML 清理。

### 5.4 `inputSchema`

`inputSchema` 是可选字段。Node 声明该字段时，它必须是一个 Zod Object Schema，并描述
`$` 之外的完整 Node Input，包括 Node 使用的 `prompt`。需要 `prompt` 的 Node 必须在自己的
Schema 中声明它：

```ts
const inputSchema = z.strictObject({
  prompt: z.string().min(1).describe('The UI task to perform.'),
  startUrl: z.url().optional().describe('The page to open first.'),
});
```

根对象推荐使用 `z.strictObject()`。这样未知字段会产生输入错误，生成的 JSON Schema 也会
包含 `additionalProperties: false`。

Schema 不能声明名为 `$` 的顶层属性。`$` 继续由 Engine 解析，不会传入 Zod。

### 5.5 类型推导与解析

Node 存在 `inputSchema` 时，Engine 在调用 Handler 前统一解析输入：

```ts
const parsed = await node.inputSchema.safeParseAsync(step.input);

if (!parsed.success) {
  throw NodeInputValidationError.fromZod(node.name, parsed.error);
}

await node.execute({
  ...context,
  input: parsed.data,
});
```

YAML 作者提供的数据类型是 `z.input<TSchema>`。Handler 收到的是经过默认值、coerce 和其他
Zod 处理后的 `z.output<TSchema>`。因此 `ctx.input` 使用输出类型。

Handler 不应再次调用 `parse()`。所有声明 Schema 的 Node 都使用异步解析入口，以支持异步
refinement，也避免同步与异步 Schema 形成两条执行路径。没有 Schema 的 Node 跳过此步骤。

### 5.6 JSON Schema 转换

Markdown 生成器使用以下固定参数：

```ts
z.toJSONSchema(node.inputSchema, {
  target: 'draft-2020-12',
  io: 'input',
  unrepresentable: 'throw',
  cycles: 'ref',
  reused: 'ref',
});
```

`io: 'input'` 很重要。生成文档描述的是 YAML 作者需要提供的值，而不是 Zod 解析后的输出。

Zod 无法可靠转换的类型会让文档命令失败。例如 `z.bigint()`、`z.date()`、`z.map()`、
`z.set()` 和 `z.custom()` 没有等价的 JSON Schema。生成器不能把这些类型静默转换成 `{}`，
否则 AI Agent 会失去输入约束。使用 `io: 'input'` 时，`z.transform()` 可以描述转换前的
输入，因此允许用于 Node Schema。

循环和复用 Schema 只能产生文档内的 `$ref`。生成结果必须自包含，不能引用文件或网络。

### 5.7 Schema 与复杂业务约束

Zod refinement 可以执行跨字段校验，但并非所有 refinement 都能转换成 JSON Schema。
Node 作者需要把无法结构化表达的规则同时写入 Schema 描述：

```ts
const reportInputSchema = z
  .strictObject({
    title: z.string().optional(),
    prompt: z.string().optional(),
  })
  .describe('Provide either title or prompt, but not both.')
  .superRefine((input, ctx) => {
    if (input.title && input.prompt) {
      ctx.addIssue({
        code: 'custom',
        message: 'title and prompt are mutually exclusive',
      });
    }
  });
```

运行时以 refinement 为准。生成文档中的根 `description` 负责把同一规则告诉 AI Agent。

### 5.8 改造后的 Midscene Nodes 示例

下面示例展示 `createMidsceneNodes()` 的目标形态。三个 Node 的 Input Interface 都由 Zod
推导，不再手写。

```ts
import { defineNode, z } from '@midscene/test';

export const aiActInputSchema = z.strictObject({
  prompt: z
    .string()
    .regex(/\S/, 'prompt must contain a non-whitespace character')
    .describe('The natural-language UI task to perform.'),
  options: z
    .strictObject({
      cacheable: z
        .boolean()
        .optional()
        .describe('Whether this action may use the Midscene cache.'),
      fileChooserAccept: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe('Accepted file types for a file chooser.'),
      deepThink: z
        .union([z.literal('unset'), z.boolean()])
        .optional()
        .describe('Whether to enable deep thinking for this action.'),
      deepLocate: z
        .boolean()
        .optional()
        .describe('Whether to use deep element location.'),
      context: z
        .string()
        .optional()
        .describe('Additional context supplied to the UI Agent.'),
    })
    .optional(),
});

export const aiAssertInputSchema = z.strictObject({
  prompt: z
    .string()
    .regex(/\S/, 'prompt must contain a non-whitespace character')
    .describe('The natural-language condition that must be true.'),
  message: z
    .string()
    .optional()
    .describe('The assertion failure message.'),
  options: z
    .strictObject({
      domIncluded: z
        .union([z.boolean(), z.literal('visible-only')])
        .optional()
        .describe('How DOM information is included in the assertion.'),
      screenshotIncluded: z
        .boolean()
        .optional()
        .describe('Whether the assertion includes a screenshot.'),
      context: z
        .string()
        .optional()
        .describe('Additional context supplied to the UI Agent.'),
    })
    .optional(),
});

const reportScreenshotSchema = z.strictObject({
  base64: z.string().min(1).describe('A base64-encoded screenshot.'),
  description: z.string().optional().describe('What the screenshot shows.'),
});

export const recordToReportInputSchema = z
  .strictObject({
    prompt: z
      .string()
      .optional()
      .describe('String shorthand for the report title.'),
    title: z.string().optional().describe('The report section title.'),
    content: z.string().optional().describe('The report text content.'),
    screenshotBase64: z
      .string()
      .optional()
      .describe('One legacy base64-encoded screenshot.'),
    screenshots: z
      .array(reportScreenshotSchema)
      .min(1)
      .optional()
      .describe('Screenshots attached to the report section.'),
  })
  .describe(
    'prompt and title are mutually exclusive; screenshotBase64 and screenshots are mutually exclusive.',
  )
  .superRefine((input, ctx) => {
    if (input.prompt !== undefined && input.title !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'prompt and title are mutually exclusive',
      });
    }
    if (
      input.screenshotBase64 !== undefined &&
      input.screenshots !== undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'screenshotBase64 and screenshots are mutually exclusive',
      });
    }
  });

export type AiActNodeInput = z.infer<typeof aiActInputSchema>;
export type AiAssertNodeInput = z.infer<typeof aiAssertInputSchema>;
export type RecordToReportNodeInput = z.infer<
  typeof recordToReportInputSchema
>;

export function createMidsceneNodes<TContext>(
  options: CreateMidsceneNodesOptions<TContext>,
): readonly NodeDefinition<any, any, TContext>[] {
  return [
    defineNode<typeof aiActInputSchema, unknown, TContext>({
      name: 'aiAct',
      description: 'Perform a natural-language task with a Midscene UI Agent.',
      inputSchema: aiActInputSchema,
      async execute(ctx) {
        const agent = await options.getAgent(ctx);
        const aiAct = requireAgentMethod(agent, 'aiAct', 'aiAct');
        const output = await aiAct.call(agent, ctx.input.prompt, {
          ...ctx.input.options,
          abortSignal: ctx.signal,
        });
        return output === undefined ? undefined : { summary: output };
      },
    }),

    defineNode<typeof aiAssertInputSchema, unknown, TContext>({
      name: 'aiAssert',
      description: 'Assert a natural-language condition with a Midscene UI Agent.',
      inputSchema: aiAssertInputSchema,
      async execute(ctx) {
        const agent = await options.getAgent(ctx);
        const aiAssert = requireAgentMethod(agent, 'aiAssert', 'aiAssert');
        await aiAssert.call(
          agent,
          ctx.input.prompt,
          ctx.input.message,
          { ...ctx.input.options, abortSignal: ctx.signal },
        );
        return { summary: `Assertion passed: ${ctx.input.prompt}` };
      },
    }),

    defineNode<typeof recordToReportInputSchema, unknown, TContext>({
      name: 'recordToReport',
      description: 'Add text or screenshots to the current Midscene report.',
      inputSchema: recordToReportInputSchema,
      async execute(ctx) {
        const agent = await options.getAgent(ctx);
        const recordToReport = requireAgentMethod(
          agent,
          'recordToReport',
          'recordToReport',
        );
        const title = ctx.input.title ?? ctx.input.prompt;
        await recordToReport.call(agent, title, {
          content: ctx.input.content,
          screenshotBase64: ctx.input.screenshotBase64,
          screenshots: ctx.input.screenshots,
        });
        return { summary: `Recorded to report: ${title ?? 'untitled'}` };
      },
    }),
  ];
}
```

改造后，`requirePrompt()`、`validateAiActOptions()`、`validateAiAssertOptions()` 和
`validateReportInput()` 可以删除。Zod Schema 负责相同的输入校验，Handler 只保留业务调用。

对应的 `aiAct` 文档片段如下。实际生成器会递归排序 JSON 对象的键：

````markdown
## `aiAct`

Perform a natural-language task with a Midscene UI Agent.

### Input Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false,
  "properties": {
    "options": {
      "additionalProperties": false,
      "properties": {
        "cacheable": {
          "description": "Whether this action may use the Midscene cache.",
          "type": "boolean"
        },
        "context": {
          "description": "Additional context supplied to the UI Agent.",
          "type": "string"
        },
        "deepLocate": {
          "description": "Whether to use deep element location.",
          "type": "boolean"
        },
        "deepThink": {
          "anyOf": [
            {
              "const": "unset",
              "type": "string"
            },
            {
              "type": "boolean"
            }
          ],
          "description": "Whether to enable deep thinking for this action."
        },
        "fileChooserAccept": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "description": "Accepted file types for a file chooser."
        }
      },
      "type": "object"
    },
    "prompt": {
      "description": "The natural-language UI task to perform.",
      "pattern": "\\S",
      "type": "string"
    }
  },
  "required": [
    "prompt"
  ],
  "type": "object"
}
```
````

---

## 6. CLI 契约

### 6.1 命令形式

命令支持以下调用：

```bash
midscene-test describe-nodes
midscene-test describe-nodes ./e2e
midscene-test describe-nodes --config ./config/midscene.config.ts
midscene-test describe-nodes ./e2e --config ./config/midscene.config.ts
```

`project-directory`、配置发现和 `--config` 的解析规则沿用 RFC 0008。命令不接受
`--result-dir`，因为它不会创建 Test Result。

现有运行命令保持不变：

```bash
midscene-test [project-directory]
```

`describe-nodes` 成为保留的首个位置参数。需要把同名目录作为 Test Project 运行时，调用方
使用显式相对路径：

```bash
midscene-test ./describe-nodes
```

### 6.2 加载边界

命令复用 `loadTestProject()`，执行顺序如下：

```text
parse CLI arguments
resolve and load midscene.config.ts once
validate Test Project and build NodeRegistry
read Node definitions from the Registry
validate documentation metadata
render Markdown in memory
write Markdown to stdout once
```

命令不会执行以下操作：

- 发现或读取 Workflow YAML；
- 创建结果目录；
- 调用 `setupDocument()`；
- 调用 YAML 生命周期 Node；
- 调用普通 Node Handler；
- 初始化 Midscene Agent。

加载 TypeScript 配置仍会执行配置文件顶层代码。这是 `midscene.config.ts` 的现有语义，
不是文档命令新增的执行能力。项目应继续避免在配置顶层创建需要清理的资源。

### 6.3 Node 收集范围

输出以 NodeRegistry 为唯一事实来源。只要 Node 出现在 Test Project 的 `nodes` 数组中，
它就会出现在生成文档中。

命令不区分以下来源：

- 项目源码定义的业务 Node；
- `createMidsceneNodes()` 返回的 Node；
- npm package 导出的 Node；
- 多个 Node 数组组合后注册的 Node。

未注册的导出不会出现。重复名称继续由 NodeRegistry 按现有规则拒绝。

NodeRegistry 需要增加一个只读枚举方法：

```ts
export class NodeRegistry {
  definitions(): readonly NodeDefinition<any, any>[];
}
```

该方法返回新的数组，调用方不能修改 Registry 内部状态。返回顺序可以保持注册顺序，
Markdown 生成器仍必须按 `name` 排序。

### 6.4 stdout、stderr 和退出码

成功时，stdout 只包含 Markdown，进程退出码为 `0`。命令不得把以下内容混入 stdout：

- 配置加载进度；
- Node 数量统计；
- 警告；
- 结果目录；
- 调试日志。

警告和错误写入 stderr。配置无法加载、Node 重名、Zod Schema 无效或 JSON Schema 转换
失败时，进程退出码为 `1`，stdout 为空。

Node 缺少 `description` 或 `inputSchema` 不属于配置错误。命令仍然生成文档并退出 `0`，
同时在 stderr 中列出缺少的字段。

### 6.5 为什么不直接写文件

首期不增加 `--output`。stdout 可以与 Shell、CI 和 Agent 工具自由组合：

```bash
midscene-test describe-nodes > docs/midscene-nodes.md
midscene-test describe-nodes | agent-context add --stdin
```

直接写文件需要额外定义覆盖、目录创建和原子写入语义。它不应阻塞核心文档生成能力。

---

## 7. Markdown 输出格式

### 7.1 文档结构

输出使用固定结构：

````markdown
<!-- Generated by `midscene-test describe-nodes`. Do not edit directly. -->

# Midscene Test Node Reference

This document describes the nodes registered by the current Test Project.

## Workflow Step Contract

Each step uses a node name as its key. The `$` object contains engine metadata
and is not part of the node input.

```yaml
workflow:
  - node.name:
      prompt: Describe the task.
      $:
        timeout: 30000
        continue-on-error: false
```

## `order.create`

**Title:** Create Order

Create a test order for an existing customer.

### Input Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false,
  "properties": {
    "amount": {
      "description": "The order amount in the project default currency.",
      "exclusiveMinimum": 0,
      "type": "number"
    },
    "customerId": {
      "description": "The stable customer ID in the test environment.",
      "type": "string"
    }
  },
  "required": [
    "customerId",
    "amount"
  ],
  "type": "object"
}
```
````

文档主体首期使用英文。Node 的 `title`、`description` 和 Schema 描述保持作者提供的语言。
英文固定文案便于不同项目生成一致的 Agent 上下文，也与 YAML 示例保持一致。

### 7.2 缺失元数据

每个已注册 Node 都必须出现在输出中。缺少字段时，生成器使用明确的占位说明：

```markdown
## `legacy.node`

> Description not declared. Do not infer this node's behavior.

### Input Schema

> Input schema not declared. Do not invent input fields for this node.
```

生成器不能跳过缺少元数据的 Node。跳过会让 AI Agent 错误地认为当前项目不支持该 Node。
生成器也不能根据 Handler 源码或 TypeScript 函数文本补全内容。

### 7.3 确定性

生成器遵循以下规则：

- Node 按 `name` 的 Unicode code point 升序排列；
- JSON 对象的键递归排序；
- JSON 数组保持作者声明顺序；
- 使用 2 个空格缩进 JSON；
- 文档以一个换行符结束；
- 不输出生成时间、run ID、绝对路径或环境信息；
- 不读取终端宽度，也不根据 TTY 改变格式；
- stdout 不使用 ANSI 颜色。

`required` 是数组，因此保持作者声明顺序。该顺序不改变 JSON Schema 语义，但保留源码意图。

### 7.4 为什么保留原始 JSON Schema

首期不把 Schema 转换成字段表格。表格难以准确表达以下结构：

- 嵌套对象和数组；
- `oneOf`、`anyOf` 和 `allOf`；
- `$defs` 和本地 `$ref`；
- 数值、字符串和数组约束；
- 条件 Schema。

格式化后的原始 JSON Schema 不丢失信息。Markdown 仍然可以被人类阅读，AI Agent 也可以
直接解释标准 Schema。未来可以额外生成摘要表格，但 JSON Schema 应继续作为事实来源。

---

## 8. Workflow Step 通用说明

Node 的 `inputSchema` 只描述 `$` 之外的输入。生成文档需要统一说明 Engine Meta：

```yaml
- node.name:
    # Node Input，由 inputSchema 描述。
    prompt: Do something.

    # Engine Meta，不属于 Node Input。
    $:
      timeout: 30000
      continue-on-error: false
```

固定说明至少包含以下规则：

- Step mapping 只能包含一个 Node 名称；
- `$` 是 Engine Meta；
- `$` 支持 `timeout` 和 `continue-on-error`；
- `timeout` 的单位是毫秒；
- 字符串简写会被规范化为 `{ prompt: value }`；
- Node Schema 决定 `prompt` 和其他输入字段是否满足该 Node 的要求。

生成器不能把所有 Node 都描述为支持只有 `prompt` 的字符串简写。某个 Node 如果还要求
其他字段，字符串简写在执行时仍会失败。

---

## 9. 错误语义

### 9.1 Schema 定义与转换错误

`defineNode()` 应在注册前确认 `inputSchema` 是 Zod Object Schema。示例：

```text
Node "order.create" inputSchema must be a Zod object schema.
```

```text
Node "order.create" inputSchema must not declare "$" as an input property.
```

`describe-nodes` 转换失败时应保留 Node 名称，并隐藏 Zod 内部对象：

```text
Cannot describe node "order.create": inputSchema contains a Zod type that cannot be represented as JSON Schema.
```

定义错误使用 `NodeDefinitionError`。转换错误由 CLI 包装，并保留原始 cause。两类错误都
应记录 Node 名称和失败字段，但不能包含整个 Schema，避免把较大的文档或示例值写入日志。

### 9.2 输入校验错误

Zod Issue 转换为 `NodeInputValidationError`。错误至少包含 Node 名称、字段路径和可读消息：

```text
Node "aiAct" input validation failed at "options.deepThink": expected boolean or "unset".
```

错误 details 可以保存结构化 issue 列表，但不能保存完整输入值。这样既方便报告定位，也能
避免把 prompt、Token 或业务数据复制到日志。

### 9.3 文档完整性警告

缺少元数据时，stderr 使用稳定格式：

```text
midscene-test describe-nodes: node "legacy.node" has no description
midscene-test describe-nodes: node "legacy.node" has no inputSchema
```

警告通过项目统一的调试日志能力输出，并确保 CLI 用户可以在 stderr 看到。package 代码
不直接调用 `console.warn()`。

### 9.4 空项目

Test Project 没有注册任何 Node 时，命令仍然输出有效 Markdown：

```markdown
# Midscene Test Node Reference

No nodes are registered by the current Test Project.
```

进程退出码为 `0`。空 Node 列表是 RFC 0008 允许的有效配置，不应被文档命令改为错误。

---

## 10. 安全与副作用

生成文档可能被提交到仓库，也可能直接交给 AI Agent。Node 作者不能在元数据中放入 API
Key、Cookie、数据库密码或真实用户数据。

生成器只读取 Node Definition 的以下字段：

- `name`；
- `title`；
- `description`；
- `inputSchema`。

生成器不能序列化 `execute`、`setupDocument()`、Document Context 或闭包变量。Zod 的
`default` 和 `.meta()` 中的 `examples` 等信息会进入输出，因此 Node 作者需要确认这些值
可以公开。

命令在完整渲染成功前不写 stdout。这样可以避免 Schema 排序或序列化在中途失败时留下
看似完整的半份文档。

---

## 11. 测试要求

### 11.1 Node Definition

- 没有 `inputSchema` 的现有 Node 仍可定义和执行；
- `z.strictObject()` 可以注册并推导 `ctx.input`；
- 根 Schema 不是 Zod Object 时抛出 `NodeDefinitionError`；
- 顶层 Schema 声明 `$` 时抛出错误；
- `z.toJSONSchema()` 无法表达的类型产生稳定错误；
- 循环和复用 Schema 生成文档内 `$ref`；
- 无效的 `title` 和 `description` 产生稳定错误。

### 11.2 输入解析

- Schema 使用 `safeParseAsync()`，异步 refinement 可以工作；
- Zod 默认值和 coerce 的结果进入 `ctx.input`；
- Handler 收到 `z.output<TSchema>` 类型；
- Zod Issue 转换为 `NodeInputValidationError`；
- 输入错误不调用 Handler；
- 错误信息不包含完整输入值；
- 没有 Schema 的遗留 Node 保持原有执行行为。

### 11.3 Registry 枚举

- `definitions()` 返回全部已注册 Node；
- 返回数组不能修改 Registry；
- 重复 Node 仍然在生成文档前失败；
- 文档生成器不依赖 Registry 的注册顺序。

### 11.4 Markdown 生成

- 输出包含 Workflow Step 通用说明；
- 输出包含 Node 名称、标题、描述和 Schema；
- JSON Schema 使用 Draft 2020-12 和 `io: 'input'`；
- Node 名称按确定顺序排列；
- JSON 对象键递归排序，数组顺序不变；
- 缺少元数据时输出占位说明；
- 空项目输出有效文档；
- 输出不包含时间戳、绝对路径和 ANSI 字符；
- 两次生成的内容逐字节相同；
- Markdown 始终以一个换行符结束。

### 11.5 CLI E2E

增加一个不依赖模型的 TypeScript fixture。测试至少覆盖：

- `midscene-test describe-nodes` 自动发现 `midscene.config.ts`；
- 显式项目目录和 `--config` 可以工作；
- stdout 只有 Markdown；
- 警告写入 stderr；
- 配置错误时 stdout 为空，退出码为 `1`；
- 命令不发现 Workflow 文件，也不创建结果目录；
- `setupDocument()` 和 Node Handler 没有执行；
- 名为 `describe-nodes` 的项目目录可以通过 `./describe-nodes` 运行；
- 生成文件可以作为普通 UTF-8 Markdown 读取。

### 11.6 内置 Midscene Node

`createMidsceneNodes()` 返回的 `aiAct`、`aiAssert` 和 `recordToReport` 也应声明描述和
`inputSchema`。测试应验证这些 Node 出现在命令输出中，并准确描述现有输入字段。

---

## 12. 实现顺序

建议按以下顺序实现：

1. 为 `@midscene/test` 增加 Zod 4 依赖并重新导出 `z`；
2. 增加 Schema 感知的 `defineNode()` 重载；
3. 在 `defineNode()` 中校验 Zod Object 和保留文档元数据；
4. 在 `executeStep()` 中增加 `safeParseAsync()`；
5. 把 Zod Issue 转换为 `NodeInputValidationError`；
6. 为 NodeRegistry 增加 `definitions()`；
7. 使用 `z.toJSONSchema()` 实现 Markdown 生成器；
8. 增加 `describe-nodes` CLI 参数解析和命令分派；
9. 确保 stdout 与 stderr 分离；
10. 用 Zod 重写 Midscene 内置 Node 的输入校验；
11. 增加单元测试、类型测试和 CLI E2E；
12. 在中英文用户文档中说明如何生成 Agent 上下文文件。

Workflow Collector 和 Document Runtime 不读取 `inputSchema`。只有 `executeStep()` 在
Handler 调用前解析输入，文档生成器负责把同一 Schema 转换成 JSON Schema。

---

## 13. 备选方案

### 13.1 使用 `--list-nodes`

可以增加 `midscene-test --list-nodes`。Flag 不会占用位置参数，但它把一个独立操作混入
Test Run 的选项空间，也不利于后续增加 Node 相关能力。

`midscene-test describe-nodes` 同时表达“读取 Node”和“生成描述”，也明确表示该调用不会
运行测试。本文选择这个子命令。

### 13.2 只输出 Node 名称

名称列表可以帮助开发者检查注册结果，却不能告诉 AI Agent 如何填写输入。它不能满足
自动编写业务 Test Case 的目标。

### 13.3 输出 JSON

JSON 更适合程序读取，但缺少 Workflow Step 的通用说明，也不适合作为人类文档直接提交。
Markdown 可以同时包含说明和标准 JSON Schema。

首期只输出 Markdown。未来增加 `--format json` 时，必须单独定义稳定的数据 Schema。

### 13.4 把 Schema 转换为 Markdown 表格

字段表格适合简单对象，却会丢失组合 Schema 和嵌套约束。本文保留格式化后的完整 JSON
Schema，避免生成器自行解释标准。

### 13.5 要求所有 Node 必须声明元数据

把 `description` 和 `inputSchema` 设为必填可以保证文档完整，但会一次性阻断现有 Node。
执行 Node 与生成文档是两项不同能力。本文允许渐进补充元数据，并对缺失内容给出明确警告。

未来可以增加 CI 专用的严格模式，但不在首期命令中增加该选项。

### 13.6 直接接受手写 JSON Schema

手写 JSON Schema 不需要绑定特定 Schema 库，但开发者仍要额外声明 TypeScript 类型和运行时
校验器。三份定义容易失去同步，也没有解决本 RFC 最核心的开发体验问题。

本文选择 Zod 作为作者入口，JSON Schema 只作为文档生成阶段的交换格式。

### 13.7 使用 Standard Schema

Standard Schema 可以让不同校验库接入同一个接口，但它不保证每个实现都能导出完整且稳定的
JSON Schema。首期只支持 Zod，避免同时设计校验适配层和文档转换适配层。

### 13.8 在 Test Run 时自动写文档

自动写文件会让普通测试命令修改工作区，也需要处理覆盖和脏文件。Node 文档的更新频率与
Test Run 不同，应由显式命令触发。

---

## 14. 验收标准

实现满足以下条件时，可以认为本 RFC 完成：

- Node Definition 的 `inputSchema` 保持可选；
- 声明 `inputSchema` 时使用 Zod Object Schema，并自动推导 `ctx.input`；
- 只有声明 Schema 的 Node 才由 Engine 在 Handler 之前统一校验输入；
- 没有 Schema 的 Node 保持现有执行和自行校验行为；
- 输入错误转换为 `NodeInputValidationError`；
- Markdown 中的 Schema 由 `z.toJSONSchema()` 生成；
- 生成结果是自包含的 Draft 2020-12 JSON Schema；
- `midscene-test describe-nodes` 可以读取项目实际注册的全部 Node；
- stdout 是一份完整、稳定且可重定向的 Markdown；
- 每个 Node 都有独立章节，并显示准确名称；
- 已声明的描述和 Schema 完整进入文档；
- 缺少元数据的 Node 不会被跳过，也不会被自动推断；
- 命令不执行 Workflow、Document 生命周期或 Node Handler；
- 配置或 Schema 错误时不输出半份文档；
- 内置 Midscene Node 也提供文档元数据；
- model-free 单元测试、类型测试和 CLI E2E 覆盖主要边界；
- 中英文用户文档说明如何把输出提供给 AI Agent。

---

## 15. 参考资料

- [Zod 4](https://zod.dev/v4)
- [Zod JSON Schema](https://zod.dev/json-schema)
