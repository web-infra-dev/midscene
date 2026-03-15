# 报告生成重构：Per-Execution Append 模型

## 目标

将报告的写入粒度从 **"整个 GroupedActionDump（含全部 execution）"** 改为 **"单个 execution"**，使截图和 dump tag 都以 append-only 方式写入报告文件。

统一单 Agent 运行时、Playwright reporter、磁盘聚合三条代码路径，共用同一套 append 逻辑。

## 现状分析

### 当前报告 HTML 结构

```html
[HTML template]
<script type="midscene-image" data-id="img-1">...base64...</script>   ← 截图 tag（已经是 append-only）
<script type="midscene-image" data-id="img-2">...base64...</script>
<script type="midscene_web_dump">                                      ← 一个大 dump tag
  { "groupName":"...", "executions": [exec1, exec2, exec3, ...] }       ← 包含所有 execution
</script>
```

### 当前写入方式

| 组件 | 做法 | 问题 |
|---|---|---|
| `ReportGenerator.writeInlineReport()` | 截图增量 append，dump JSON 整体 truncate 重写 | 每次都重新序列化所有 execution |
| `ReportGenerator.writeDirectoryReport()` | 截图增量写文件，dump JSON 整体覆盖写 | 同上 |
| Playwright reporter `updateReport()` | 每个 test 一个 dump tag，直接 append | 已经是 per-test append |
| `ReportMergingTool.mergeReports()` | 读源文件 → append dump tag + 流式复制截图 | 独立逻辑，和上面两个不复用 |

### 当前 Viewer 行为

- `document.querySelectorAll('script[type="midscene_web_dump"]')` 获取所有 dump tag
- 每个 dump tag → 一个 `PlaywrightTasks` 对象（含 lazy `get()` 和 `attributes`）
- `dumps.length > 1` → 显示 PlaywrightCaseSelector 下拉选择器
- `dumps.length === 1` → 不显示选择器，直接展示该 dump 的所有 execution
- 选中某个 dump → `setGroupedDump(dump.get())` → Sidebar 显示其 `executions[]` 里的所有 execution

**关键约束：** 如果把单 Agent 的 N 个 execution 拆成 N 个 dump tag，viewer 会显示 N 项下拉选择器，每次只能看一个 execution。这 **不符合** 当前单 Agent 报告的 UX（一次看到所有 execution）。

**因此需要先改 viewer，让它能把同组的 dump tag 合并回一个逻辑 GroupedActionDump。**

---

## 改造计划

### PR 1：Viewer — 支持按 `data-group-id` 合并 dump tag

**目的：** 为后续 ReportGenerator 的 per-execution 写入做好前端准备。此 PR 独立可发布，向后兼容。

**改动文件：**

1. **`apps/report/src/App.tsx`** — `getDumpElements()` 函数（~308-380 行）

   当前逻辑：每个 `<script type="midscene_web_dump">` → 一个 `PlaywrightTasks`。

   新增逻辑：
   - 读取每个 dump tag 的 `data-group-id` attribute
   - 如果多个 dump tag 有相同的 `data-group-id`，将它们合并为一个 `PlaywrightTasks`
   - 合并方式：拼接 `executions[]` 数组（因为每个 dump tag 里的 GroupedActionDump 只含 1 个 execution）
   - 没有 `data-group-id` 的 dump tag（旧格式）保持原行为

   伪代码：
   ```typescript
   function getDumpElements(): PlaywrightTasks[] {
     const dumpElements = document.querySelectorAll('script[type="midscene_web_dump"]');
     const groupMap = new Map<string, Element[]>();  // groupId → elements
     const ungrouped: Element[] = [];

     for (const el of dumpElements) {
       const groupId = el.getAttribute('data-group-id');
       if (groupId) {
         if (!groupMap.has(groupId)) groupMap.set(groupId, []);
         groupMap.get(groupId)!.push(el);
       } else {
         ungrouped.push(el);  // 旧格式，每个独立处理
       }
     }

     const result: PlaywrightTasks[] = [];

     // 处理分组的 dump tag — 合并为一个 PlaywrightTasks
     for (const [groupId, elements] of groupMap) {
       result.push({
         get: () => {
           // 解析所有 element，合并 executions
           const allExecutions = [];
           let baseDump = null;
           for (const el of elements) {
             const parsed = JSON.parse(antiEscapeScriptTag(el.textContent));
             const restored = restoreImageReferences(parsed, resolveImageFromDom);
             const dump = GroupedActionDump.fromJSON(restored);
             if (!baseDump) baseDump = dump;
             allExecutions.push(...dump.executions);
           }
           baseDump.executions = allExecutions;
           return baseDump;
         },
         attributes: parseAttributesFromElement(elements[0]),  // 用第一个 tag 的 attributes
       });
     }

     // 处理未分组的 dump tag — 保持原逻辑（向后兼容）
     for (const el of ungrouped) {
       result.push(buildPlaywrightTaskFromElement(el));  // 现有逻辑提取为函数
     }

     return result;
   }
   ```

2. **`packages/core/src/dump/html-utils.ts`** — `generateDumpScriptTag()` 函数（~346 行）

   已经支持 `attributes` 参数。确认 `data-group-id` 能通过现有接口传入即可，无需改动。

**测试要点：**
- 手动构造包含多个同 `data-group-id` dump tag 的 HTML，验证 viewer 能正确合并并展示
- 无 `data-group-id` 的旧格式报告继续正常工作
- Playwright merged 报告（多个 dump tag，无 `data-group-id`）继续正常工作

**验证命令：**
```bash
pnpm run lint
npx nx build report
npx nx test report  # 如果有 viewer 单元测试
```

---

### PR 2：ReportGenerator + Agent — per-execution 写入模型

**目的：** 把 ReportGenerator 的写入粒度从 "整个 GroupedActionDump" 改为 "单个 execution"。这是核心改动。

**依赖：** PR 1 已合入（viewer 能合并同组 dump tag）。

#### 2.1 改 `IReportGenerator` 接口

**文件：** `packages/core/src/report-generator.ts`（~23-39 行）

```typescript
// 旧接口
interface IReportGenerator {
  onDumpUpdate(dump: GroupedActionDump): void;
  flush(): Promise<void>;
  finalize(dump: GroupedActionDump): Promise<string | undefined>;
  getReportPath(): string | undefined;
}

// 新接口
interface IReportGenerator {
  /**
   * 写入或更新一个 execution。
   * ReportGenerator 内部自动判断"是新 execution 还是更新现有 execution"：
   * 比较 execution.name 是否与上一次相同即可（TaskRunner.name 在其生命周期内不变）。
   *
   * 不需要额外的 executionId 参数。原因：
   * - Agent 已有 executionDumpIndexByRunner (WeakMap<TaskRunner, number>) 做 runner→index 映射
   * - execution.name 来自 TaskRunner.name，在同一个 runner 生命周期内不变
   * - ReportGenerator 只需关心"跟上次是不是同一个"，用 name 比较足够
   *
   * @param execution    当前 execution 的完整数据
   * @param groupMeta    组级元数据（groupName, sdkVersion, ...），不随 execution 变化
   */
  onExecutionUpdate(
    execution: ExecutionDump,
    groupMeta: GroupMeta,
  ): void;
  flush(): Promise<void>;
  finalize(): Promise<string | undefined>;
  getReportPath(): string | undefined;
}

/** 从 GroupedActionDump 中提取的不变元数据 */
interface GroupMeta {
  groupName: string;
  groupDescription?: string;
  sdkVersion: string;
  modelBriefs: string[];
  deviceType?: string;
}
```

#### 2.2 改 `ReportGenerator` 内部写入逻辑

**文件：** `packages/core/src/report-generator.ts`

核心思路：

```
报告文件布局（inline 模式）：

[HTML template]                                     ← 写一次，不再碰
[exec-1 的截图 image tags]                           ← frozen
[exec-1 的 dump tag (GroupedActionDump, 1 exec)]     ← frozen
[exec-2 的截图 image tags]                           ← frozen
[exec-2 的 dump tag]                                 ← frozen
...
[exec-N 的截图 image tags]                           ← active，增量 append 新截图
[exec-N 的 dump tag]                                 ← active，truncate 重写此 tag
```

**状态字段变化：**

```typescript
class ReportGenerator {
  // 删除
  // private imageEndOffset = 0;

  // 新增
  private activeExecName?: string;            // 来自 execution.name (= TaskRunner.name)
  private activeExecStartOffset = 0;          // active exec 的截图区域开始位置

  // 保留
  private writtenScreenshots = new Set<string>();
  private firstWriteDone = false;
  private initialized = false;
  private writeQueue: Promise<void> = Promise.resolve();
  private destroyed = false;
}
```

**`writeInlineReport` 改为 `writeInlineExecution`：**

```typescript
private writeInlineExecution(
  execution: ExecutionDump,
  groupMeta: GroupMeta,
): void {
  // 0. 初始化：写 HTML 模板
  if (!this.initialized) {
    writeFileSync(this.reportPath, getReportTpl());
    this.activeExecStartOffset = statSync(this.reportPath).size;
    this.initialized = true;
  }

  // 1. 判断是新 execution 还是更新现有 execution
  if (this.activeExecName !== execution.name) {
    // 新 execution 开始 → 之前的 active 变 frozen
    // 当前文件末尾（含旧 active 的全部内容）成为新的 frozen 基线
    this.activeExecStartOffset = statSync(this.reportPath).size;
    this.activeExecName = execution.name;
  }

  // 2. truncate：移除 active exec 的截图和 dump tag，保留 frozen 区域
  //    注意：这会移除 active exec 之前写过的截图 tag，
  //    但 writtenScreenshots Set 仍然记着哪些截图已经在 frozen 区域里，不会重复写
  truncateSync(this.reportPath, this.activeExecStartOffset);

  // 3. append active exec 的截图（增量：只写 writtenScreenshots 里没有的）
  const screenshots = execution.collectScreenshots();
  for (const screenshot of screenshots) {
    if (!this.writtenScreenshots.has(screenshot.id)) {
      appendFileSync(
        this.reportPath,
        `\n${generateImageScriptTag(screenshot.id, screenshot.base64)}`,
      );
      // 注意：不能在这里 markPersistedInline，因为 active 区域会被 truncate
      // 只有当 execution 变 frozen 后，截图才真正 "持久化"
    }
  }

  // 4. 记录 dump tag 开始位置
  this.activeExecDumpOffset = statSync(this.reportPath).size;

  // 5. append dump tag（GroupedActionDump 格式，只含 1 个 execution）
  const singleDump = wrapAsGroupedDump(execution, groupMeta);
  const serialized = singleDump.serialize();
  const attributes: Record<string, string> = {
    'data-group-id': groupMeta.groupName,
  };
  appendFileSync(
    this.reportPath,
    `\n${generateDumpScriptTag(serialized, attributes)}`,
  );
}
```

**关于 `markPersistedInline` 的处理：**

当一个 execution 从 active 变为 frozen 时（新 execution 到来），需要把前一个 active execution 的截图标记为已持久化并释放内存。在 `this.activeExecName !== execution.name` 分支中处理：

```typescript
if (this.activeExecName !== execution.name) {
  // 前一个 active execution 的截图现在在 frozen 区域，可以安全释放
  // 把前一个 active 的截图加入 writtenScreenshots
  // （实际上它们已经在 Set 里了，因为 append 时就加了）
  // 关键：标记它们为 persisted，释放内存
  this.markActiveScreenshotsAsPersisted();

  this.activeExecStartOffset = statSync(this.reportPath).size;
  this.activeExecName = execution.name;
}
```

需要额外追踪 "当前 active execution 的截图 ID 列表"，以便在 freeze 时调用 `markPersistedInline`。加一个字段：

```typescript
private activeScreenshotIds: string[] = [];
```

**directory 模式类似处理，更简单**（截图写文件天然是 append-only，dump tag 覆盖写就行）。

#### 2.3 改 `Agent` 调用方

**文件：** `packages/core/src/agent/agent.ts`

改动点：

1. **`writeOutActionDumps()`**（~454 行）— 传递当前 execution 而非整个 dump

   ```typescript
   // 旧
   writeOutActionDumps() {
     this.reportGenerator.onDumpUpdate(this.dump);
     this.reportFile = this.reportGenerator.getReportPath();
   }

   // 新
   writeOutActionDumps(executionDump?: ExecutionDump) {
     if (!executionDump) return;
     this.reportGenerator.onExecutionUpdate(
       executionDump,           // execution.name 来自 TaskRunner.name，足以标识
       this.getGroupMeta(),
     );
     this.reportFile = this.reportGenerator.getReportPath();
   }
   ```

2. **`onTaskUpdate` hook**（~331 行）— 传递当前 execution

   ```typescript
   onTaskUpdate: (runner) => {
     const executionDump = runner.dump();
     this.appendExecutionDump(executionDump, runner);
     // ...listener callbacks...
     this.writeOutActionDumps(executionDump);
   },
   ```

3. **`destroy()`**（~1258 行）— finalize 不再需要 dump 参数

   ```typescript
   async destroy() {
     if (this.destroyed) return;
     await this.reportGenerator.flush();
     await this.reportGenerator.finalize();  // 不再传 dump
     this.reportFile = this.reportGenerator.getReportPath();
     await this.interface.destroy?.();
     this.resetDump();
     this.destroyed = true;
   }
   ```

4. **`getGroupMeta()` 辅助方法** — 从 `this.dump` 提取不变元数据

   ```typescript
   private getGroupMeta(): GroupMeta {
     return {
       groupName: this.dump.groupName,
       groupDescription: this.dump.groupDescription,
       sdkVersion: this.dump.sdkVersion,
       modelBriefs: this.dump.modelBriefs,
       deviceType: this.dump.deviceType,
     };
   }
   ```

5. **`recordToReport()`**（~1310 行）— 同样改为传递单个 execution

   ```typescript
   this.appendExecutionDump(executionDump);
   // ...listeners...
   this.writeOutActionDumps(executionDump);  // 传递当前 execution
   ```

6. **外部调用方兼容** — 以下文件直接调用 `agent.writeOutActionDumps()`：
   - `packages/playground/src/server.ts:493`
   - `packages/playground/src/adapters/local-execution.ts:260`
   - `packages/web-integration/tests/ai/web/static/static-page.test.ts:37`

   这些调用方不传 executionDump 参数。Agent 内部记录 `lastExecutionDump` 属性，
   `writeOutActionDumps()` 无参时使用它即可。

#### 2.4 `nullReportGenerator` 适配

```typescript
export const nullReportGenerator: IReportGenerator = {
  onExecutionUpdate: () => {},
  flush: async () => {},
  finalize: async () => undefined,
  getReportPath: () => undefined,
};
```

**测试要点：**
- 单 Agent 运行多个 execution，报告文件包含多个 dump tag，各自有 `data-group-id`
- Execution 内部的 task 更新不影响 frozen 区域
- 截图在 frozen 后释放内存（用 `markPersistedInline` 机制验证）
- directory 模式同样正确
- Playground 场景正常

**验证命令：**
```bash
pnpm run lint
npx nx test core
npx nx build core
npx nx test web-integration  # 如果不依赖 AI
```

---

### PR 3：Playwright fixture + reporter — 对齐 per-execution 模型

**目的：** 让 Playwright 管线也走统一的 per-execution 路径。

**依赖：** PR 2 已合入。

#### 3.1 Playwright ai-fixture

**文件：** `packages/web-integration/src/playwright/ai-fixture.ts`（~191-252 行）

当前 `updateDumpAnnotation` 做的事：
- 从 `agent.dump`（整个 GroupedActionDump）调用 `serializeToFiles(tempFilePath)`
- 写出一份完整的 dump JSON + 截图文件
- Reporter 在 `onTestEnd` 读取这些文件

**改动：** 这个临时文件序列化方式不影响最终报告格式（Reporter 负责最终格式）。但可以简化：
- 只序列化增量的 execution（如果 Reporter 也改为 per-execution 消费）
- 或者保持不变（临时文件是进程间传输通道，不是最终报告）

**建议：暂时不改。** Playwright 的 fixture → 临时文件 → reporter 是跨进程通信通道，和最终报告格式无关。reporter 读到数据后再按 per-execution 写入。

#### 3.2 Playwright reporter

**文件：** `packages/web-integration/src/playwright/reporter/index.ts`

当前 `updateReport` 的做法：
- 已经是 per-test 一个 dump tag（每个 test 的全部 execution 在一个 tag 里）
- merged 模式：多个 test 的 dump tag append 到同一个文件
- separate 模式：每个 test 一个独立文件

**改动：**

1. 给 dump tag 加上 `data-group-id` attribute（值 = test title），使 viewer 的合并逻辑生效

   ```typescript
   // 在构造 dumpScript 时加 data-group-id
   if (this.mode === 'merged' && testData.attributes) {
     const attributesArr = [
       `data-group-id="${encodeURIComponent(testData.attributes.playwright_test_title)}"`,
       ...Object.keys(testData.attributes).map((key) =>
         `${key}="${encodeURIComponent(testData.attributes![key])}"`
       ),
     ];
     // ...
   }
   ```

   注意：当前 Playwright 每个 test 已经是一个独立的 dump tag，所以 `data-group-id` 加不加都不影响现有行为。但加上后，能和单 Agent 报告保持格式一致。

2. 如果未来 Playwright fixture 改为 per-execution 序列化（一个 test 多个 page/agent 多个临时文件），reporter 可以在 `onTestEnd` 中逐 execution append。**但这不在此 PR 范围内。**

**测试要点：**
- Playwright merged 报告格式正确，dump tag 含 `data-group-id`
- Playwright separate 报告不受影响
- 多浏览器（多 project）报告正确

**验证命令：**
```bash
pnpm run lint
npx nx build web-integration
```

---

### PR 4：ReportMergingTool — 对齐 per-execution 模型

**目的：** 让报告合并也走统一的 append 逻辑。

**依赖：** PR 1 已合入。

**文件：** `packages/core/src/report.ts`（22-175 行）

当前 `mergeReports` 的做法：
- 遍历源报告 → 提取最后一个 dump tag（`extractLastDumpScriptSync`）
- 流式复制截图（`streamImageScriptsToFile`）
- 生成新 dump tag 并 append

**改动：**

改为提取 **所有** dump tag 而非 "最后一个"：

```typescript
// 旧
const dumpString = extractLastDumpScriptSync(reportInfo.reportFilePath);

// 新 — 提取所有 dump tag
const dumpStrings = extractAllDumpScriptsSync(reportInfo.reportFilePath);
for (const { content, attributes } of dumpStrings) {
  // 每个 dump tag 独立 append 到输出文件
  appendFileSync(outputFilePath, generateDumpScriptTag(content, attributes));
}
```

需要在 `html-utils.ts` 中新增 `extractAllDumpScriptsSync()` 函数（或改名现有函数）：
- 类似 `extractLastDumpScriptSync`，但收集所有匹配的 tag 而非只保留最后一个
- 同时提取每个 tag 的 attributes（`data-group-id` 等）

**测试要点：**
- 合并多个 per-execution 格式的报告，输出正确
- 合并旧格式（单 dump tag）报告仍然正确
- 截图去重正确

**验证命令：**
```bash
pnpm run lint
npx nx test core
npx nx build core
```

---

### PR 5：清理和对齐

**目的：** 清理不再需要的旧代码路径。

**依赖：** PR 2-4 已合入。

**改动：**

1. **删除 `GroupedActionDump.serializeWithInlineScreenshots()`**（types.ts ~747 行）
   - 检查是否还有调用方（`dumpDataString` 中可能用到）
   - 如果 Agent 不再需要把整个 dump 序列化为带内联截图的 JSON，可以移除

2. **简化 `Agent.appendExecutionDump()`**
   - 当前用 `executionDumpIndexByRunner` WeakMap 做原地替换
   - 如果 ReportGenerator 已经按 executionId 追踪，Agent 这边可以简化
   - 但 `this.dump`（内存中的 GroupedActionDump）仍然被 `dumpDataString()` 和 Playground 读取，所以 `appendExecutionDump` 的数组更新逻辑要保留
   - 主要清理的是 `writeOutActionDumps` 中的冗余逻辑

3. **统一 `reportHTMLContent()` 函数**（utils.ts ~126 行）
   - 这个函数目前被 `ReportMergingTool` 和 `writeDumpReport` 使用
   - 如果 PR 4 改为直接用 `generateDumpScriptTag + appendFileSync`，这个函数可以简化
   - 评估是否还需要 `insertScriptBeforeClosingHtml` 逻辑

4. **清理 Playwright fixture 的临时文件序列化**
   - 评估是否可以从 "序列化整个 GroupedActionDump" 改为 "只序列化当前 execution"
   - 减少临时文件大小和 I/O

**验证命令：**
```bash
pnpm run lint
npx nx test core
npx nx build core
npx nx build web-integration
```

---

## 改造后的报告 HTML 结构

```html
[HTML template]

<!-- execution 1（frozen） -->
<script type="midscene-image" data-id="img-1">...base64...</script>
<script type="midscene-image" data-id="img-2">...base64...</script>
<script type="midscene_web_dump" data-group-id="my-agent">
  { "groupName":"my-agent", "sdkVersion":"...", "executions": [{...exec1...}] }
</script>

<!-- execution 2（frozen） -->
<script type="midscene-image" data-id="img-3">...base64...</script>
<script type="midscene_web_dump" data-group-id="my-agent">
  { "groupName":"my-agent", "sdkVersion":"...", "executions": [{...exec2...}] }
</script>

<!-- execution 3（active — 会被 truncate 重写） -->
<script type="midscene-image" data-id="img-4">...base64...</script>
<script type="midscene_web_dump" data-group-id="my-agent">
  { "groupName":"my-agent", "sdkVersion":"...", "executions": [{...exec3 进行中...}] }
</script>
```

Viewer 加载时：
1. 找到 3 个 dump tag，都有 `data-group-id="my-agent"`
2. 合并为一个逻辑 GroupedActionDump，`executions = [exec1, exec2, exec3]`
3. 在 Sidebar 中显示 3 个 execution 的所有 task

---

## 风险和注意事项

1. **active execution 的截图不能 `markPersistedInline`**
   因为 active 区域会被 truncate，截图 tag 会被删除重写。只有当 execution 从 active 变为 frozen 后，才能安全释放截图内存。需要仔细处理这个时序。

2. **`data-group-id` 的值选择**
   用 `groupName` 作为 `data-group-id`。需要确保同一个 Agent 的所有 execution 用相同的 `groupName`，不同 Agent（或不同 test）用不同的 `groupName`。当前 Agent 的 `groupName` 在构造时确定，整个生命周期不变，满足要求。

3. **向后兼容**
   旧格式的报告（无 `data-group-id`）必须继续能被新 viewer 读取。PR 1 的合并逻辑只对有 `data-group-id` 的 tag 生效。

4. **GroupedActionDump 元数据冗余**
   每个 dump tag 都包含 `groupName`、`sdkVersion` 等元数据，有冗余。但这些字段很小（几十字节），不值得为此引入新的 tag type。选项 A 的取舍。

5. **Playground 场景**
   Playground（`packages/playground/src/server.ts`）调用 `agent.writeOutActionDumps()` 后会 `agent.resetDump()`。需要确保新接口下 Playground 的行为正确。可能需要在 Playground 侧也传递 executionDump 参数。

6. **`dumpDataString()` 方法**
   Agent 上的 `dumpDataString()` 返回整个 GroupedActionDump 的 JSON string，被 `onDumpUpdate` listener（如 Playwright fixture 的 `updateDumpAnnotation`）使用。这个方法继续从内存中的 `this.dump` 读取，不受 ReportGenerator 改动影响。

---

## PR 依赖关系

```
PR 1 (Viewer)
    │
    ├─── PR 2 (ReportGenerator + Agent)  ← 核心改动
    │         │
    │         └─── PR 3 (Playwright)
    │
    └─── PR 4 (ReportMergingTool)

              PR 5 (清理) ← 依赖 PR 2-4 全部完成
```

PR 1 和 PR 4 可以并行开发（PR 4 的合并逻辑和 viewer 的合并逻辑相互独立）。
PR 3 依赖 PR 2（接口变化）。
PR 5 在所有功能 PR 完成后执行。
