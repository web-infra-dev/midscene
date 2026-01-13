# RFC: ScreenshotItem 和 Dump 重构方案

> **状态**: 已采纳
> **方案**: 完全类化 - 领域驱动设计

## 背景与问题

### 核心痛点

1. **"黑魔法"泛滥**
   - `ScreenshotItem.toJSON()` 隐式序列化，难以追踪数据流
   - `escapeScriptTag/antiEscapeScriptTag` 分散在 3 处
   - 同一个 Map 存储两种类型值（base64 vs 文件路径）
   - `replacerForPageObject` 重复定义

2. **内存效率问题**
   - 大型报告（100+ 截图）生成时内存溢出风险
   - `generateScriptTags()` 一次性读取所有临时文件
   - 前端 `restoreImageReferences()` 需要遍历整个 dump

3. **序列化逻辑分散**
   - `stringifyDumpData()` 在 utils.ts
   - `restoreImageReferences()` 在 screenshot-registry.ts 和 image-restoration.ts（两份！）
   - 目录报告处理在 `extractAndSaveScreenshots()`

4. **多场景支持复杂**
   - HTML 报告：script 标签嵌入
   - 目录报告：相对路径引用
   - Playground/Extension：动态 imageMap

### 数据流现状

```
执行阶段:
  screenshotBase64 → ScreenshotItem.fromBase64(registry) → { $screenshot: "id" }
                                                              ↓
报告生成:                                               JSON.stringify(dump)
  registry.generateScriptTags() ←──────────────────────────────┘
       ↓
  <script type="midscene-image">escaped_base64</script>

前端恢复:
  loadImageMap() → imageMap: { id → base64 }
       ↓
  restoreImageReferences(dump, imageMap) → 替换 { $screenshot: "id" } 为 base64
```

---

## 设计方案：完全类化

### 设计理念

将核心 Dump 结构重构为类，引入 **StorageProvider** 抽象支持多种存储后端，实现完全的封装和类型安全。

> **注意**: `ServiceDump` 和 `ExecutionTask` 保持为接口，不需要类化。它们只是简单的数据记录，没有复杂的序列化需求。

### 核心架构

```
┌─────────────────────────┐
│   GroupedActionDump     │  (类)
│  ├─ executions[]        │
│  ├─ storageProvider     │
│  ├─ serialize()         │
│  ├─ toHTML()            │
│  └─ static fromHTML()   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│     ExecutionDump       │  (类)
│  ├─ tasks[]             │──────▶ ExecutionTask (接口，保持不变)
│  ├─ collectScreenshots()│           └─ log: ServiceDump (接口，保持不变)
│  └─ toSerializable()    │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│     ScreenshotItem      │  (类)
│  ├─ _provider           │──────▶ StorageProvider (接口)
│  ├─ getData()           │           ├─ MemoryStorage (类)
│  └─ toSerializable()    │           └─ FileStorage (类)
└─────────────────────────┘
```

### 类化范围

| 结构 | 类型 | 说明 |
|------|------|------|
| `GroupedActionDump` | 类 | 顶层容器，管理序列化/反序列化 |
| `ExecutionDump` | 类 | 执行记录，收集截图 |
| `ScreenshotItem` | 类 | 截图数据，异步获取 |
| `StorageProvider` | 接口 | 存储抽象 |
| `MemoryStorage` | 类 | 内存存储实现 |
| `FileStorage` | 类 | 文件存储实现 |
| `ExecutionTask` | 接口 | 保持不变，简单数据结构 |
| `ServiceDump` | 接口 | 保持不变，AI 调用日志 |

---

## 核心类设计

### 1. StorageProvider - 存储抽象

```typescript
// packages/core/src/storage/provider.ts

export interface StorageProvider {
  readonly type: 'memory' | 'file' | 'remote';

  /** 存储数据，返回引用 ID */
  store(data: string): Promise<string>;

  /** 根据 ID 获取数据 */
  retrieve(id: string): Promise<string>;

  /** 删除数据 */
  delete(id: string): Promise<void>;

  /** 清理所有数据 */
  cleanup(): Promise<void>;
}

// 内存存储（默认）
export class MemoryStorage implements StorageProvider {
  readonly type = 'memory';
  private store = new Map<string, string>();

  async store(data: string): Promise<string> {
    const id = uuid();
    this.store.set(id, data);
    return id;
  }

  async retrieve(id: string): Promise<string> {
    const data = this.store.get(id);
    if (!data) throw new Error(`Data not found: ${id}`);
    return data;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async cleanup(): Promise<void> {
    this.store.clear();
  }
}

// 文件存储
export class FileStorage implements StorageProvider {
  readonly type = 'file';
  private directory: string;
  private registry = new Map<string, string>(); // id -> filePath

  constructor(baseDir?: string) {
    this.directory = baseDir || path.join(os.tmpdir(), 'midscene', uuid());
    mkdirSync(this.directory, { recursive: true });
  }

  async store(data: string): Promise<string> {
    const id = uuid();
    const filePath = path.join(this.directory, `${id}.b64`);
    await writeFile(filePath, data);
    this.registry.set(id, filePath);
    return id;
  }

  async retrieve(id: string): Promise<string> {
    const filePath = this.registry.get(id);
    if (!filePath) throw new Error(`File not found: ${id}`);
    return await readFile(filePath, 'utf-8');
  }

  async delete(id: string): Promise<void> {
    const filePath = this.registry.get(id);
    if (filePath) {
      await unlink(filePath).catch(() => {});
      this.registry.delete(id);
    }
  }

  async cleanup(): Promise<void> {
    await rm(this.directory, { recursive: true, force: true });
    this.registry.clear();
  }
}
```

### 2. ScreenshotItem - 存储无关

```typescript
// packages/core/src/screenshot-item.ts

export class ScreenshotItem {
  private _id: string;
  private _provider: StorageProvider;

  private constructor(id: string, provider: StorageProvider) {
    this._id = id;
    this._provider = provider;
  }

  /** 从 base64 创建 */
  static async create(
    base64: string,
    provider: StorageProvider = new MemoryStorage()
  ): Promise<ScreenshotItem> {
    const id = await provider.store(base64);
    return new ScreenshotItem(id, provider);
  }

  /** 从已存储的 ID 恢复 */
  static restore(id: string, provider: StorageProvider): ScreenshotItem {
    return new ScreenshotItem(id, provider);
  }

  /** 获取唯一标识符 */
  get id(): string {
    return this._id;
  }

  /** 异步获取 base64 数据 */
  async getData(): Promise<string> {
    return this._provider.retrieve(this._id);
  }

  /** 迁移到另一个存储提供者 */
  async migrateTo(newProvider: StorageProvider): Promise<ScreenshotItem> {
    const data = await this.getData();
    const newId = await newProvider.store(data);
    await this._provider.delete(this._id);
    return new ScreenshotItem(newId, newProvider);
  }

  /** 序列化为 JSON 对象（不是字符串） */
  toSerializable(): { $screenshot: string } {
    return { $screenshot: this._id };
  }
}
```

### 3. ExecutionDump - 类化

```typescript
// packages/core/src/dump/execution-dump.ts

export interface ExecutionDumpInit {
  name: string;
  description?: string;
  tasks?: ExecutionTask[];
}

export class ExecutionDump {
  readonly logTime: number;
  readonly name: string;
  readonly description?: string;
  private _tasks: ExecutionTask[];

  constructor(init: ExecutionDumpInit) {
    this.logTime = Date.now();
    this.name = init.name;
    this.description = init.description;
    this._tasks = init.tasks || [];
  }

  get tasks(): ReadonlyArray<ExecutionTask> {
    return this._tasks;
  }

  appendTask(task: ExecutionTask): void {
    this._tasks.push(task);
  }

  /** 收集所有截图 */
  collectScreenshots(): ScreenshotItem[] {
    const screenshots: ScreenshotItem[] = [];
    for (const task of this._tasks) {
      if (task.recorder) {
        for (const record of task.recorder) {
          if (record.screenshot instanceof ScreenshotItem) {
            screenshots.push(record.screenshot);
          }
        }
      }
    }
    return screenshots;
  }

  /** 序列化（截图用 ID 替代） */
  toSerializable(): SerializableExecutionDump {
    return {
      logTime: this.logTime,
      name: this.name,
      description: this.description,
      tasks: this._tasks.map(task => this.serializeTask(task)),
    };
  }

  private serializeTask(task: ExecutionTask): SerializableExecutionTask {
    return {
      ...task,
      recorder: task.recorder?.map(record => ({
        ...record,
        screenshot: record.screenshot instanceof ScreenshotItem
          ? record.screenshot.toSerializable()
          : record.screenshot,
      })),
    };
  }
}
```

### 4. GroupedActionDump - 顶层类

```typescript
// packages/core/src/dump/grouped-action-dump.ts

export class GroupedActionDump {
  readonly sdkVersion: string;
  readonly groupName: string;
  readonly groupDescription?: string;
  private _modelBriefs: Set<string>;
  private _executions: ExecutionDump[];
  private _storageProvider: StorageProvider;

  constructor(
    groupName: string,
    options?: {
      groupDescription?: string;
      storageProvider?: StorageProvider;
    }
  ) {
    this.sdkVersion = getVersion();
    this.groupName = groupName;
    this.groupDescription = options?.groupDescription;
    this._modelBriefs = new Set();
    this._executions = [];
    this._storageProvider = options?.storageProvider || new MemoryStorage();
  }

  /** 获取存储提供者（用于创建 ScreenshotItem） */
  get storageProvider(): StorageProvider {
    return this._storageProvider;
  }

  get executions(): ReadonlyArray<ExecutionDump> {
    return this._executions;
  }

  get modelBriefs(): ReadonlyArray<string> {
    return Array.from(this._modelBriefs);
  }

  addModelBrief(brief: string): void {
    this._modelBriefs.add(brief);
  }

  appendExecution(execution: ExecutionDump): void {
    this._executions.push(execution);
  }

  /** 收集所有截图 */
  collectAllScreenshots(): ScreenshotItem[] {
    return this._executions.flatMap(exec => exec.collectScreenshots());
  }

  // ========== 序列化方法 ==========

  /**
   * 序列化为 JSON 字符串
   * 截图以 { $screenshot: "id" } 形式存在
   */
  serialize(): string {
    const data: SerializableGroupedActionDump = {
      sdkVersion: this.sdkVersion,
      groupName: this.groupName,
      groupDescription: this.groupDescription,
      modelBriefs: this.modelBriefs,
      executions: this._executions.map(e => e.toSerializable()),
    };
    return JSON.stringify(data);
  }

  /**
   * 序列化并提取图片
   */
  async serializeWithImages(): Promise<{
    json: string;
    images: Map<string, string>;
  }> {
    const screenshots = this.collectAllScreenshots();
    const images = new Map<string, string>();

    for (const screenshot of screenshots) {
      const data = await screenshot.getData();
      images.set(screenshot.id, data);
    }

    return {
      json: this.serialize(),
      images,
    };
  }

  /**
   * 生成完整的 HTML 报告内容
   */
  async toHTML(): Promise<string> {
    const { json, images } = await this.serializeWithImages();

    // 生成图片 script 标签
    const imageTags = Array.from(images.entries())
      .map(([id, data]) =>
        `<script type="midscene-image" data-id="${id}">${escapeContent(data)}</script>`
      )
      .join('\n');

    // 生成 dump script 标签
    const dumpTag = `<script type="midscene_web_dump">${escapeContent(json)}</script>`;

    return imageTags + '\n' + dumpTag;
  }

  /**
   * 写入目录格式报告
   */
  async writeToDirectory(outputDir: string): Promise<string> {
    const screenshotsDir = path.join(outputDir, 'screenshots');
    await mkdir(screenshotsDir, { recursive: true });

    const screenshots = this.collectAllScreenshots();
    const pathMap = new Map<string, string>();

    // 保存图片
    let counter = 0;
    for (const screenshot of screenshots) {
      const data = await screenshot.getData();
      const fileName = `screenshot_${counter++}.png`;
      const filePath = path.join(screenshotsDir, fileName);

      const base64Data = data.includes(',') ? data.split(',')[1] : data;
      await writeFile(filePath, Buffer.from(base64Data, 'base64'));

      pathMap.set(screenshot.id, `./screenshots/${fileName}`);
    }

    // 生成带路径引用的 JSON
    const serializable = JSON.parse(this.serialize());
    this.replaceIdsWithPaths(serializable, pathMap);

    // 写入 HTML
    const indexPath = path.join(outputDir, 'index.html');
    const html = generateReportTemplate(JSON.stringify(serializable));
    await writeFile(indexPath, html);

    return indexPath;
  }

  // ========== 反序列化方法 ==========

  /**
   * 从 JSON 字符串创建（不恢复图片）
   */
  static fromJSON(json: string): GroupedActionDump {
    const data = JSON.parse(json) as SerializableGroupedActionDump;
    const dump = new GroupedActionDump(data.groupName, {
      groupDescription: data.groupDescription,
    });
    // ... 恢复其他字段
    return dump;
  }

  /**
   * 从 JSON + imageMap 创建（恢复图片）
   */
  static async fromJSONWithImages(
    json: string,
    imageMap: Record<string, string>
  ): Promise<GroupedActionDump> {
    const dump = this.fromJSON(json);

    // 恢复截图数据到存储
    for (const [id, base64] of Object.entries(imageMap)) {
      await dump.storageProvider.store(base64);
    }

    return dump;
  }

  /**
   * 从 HTML 报告创建
   */
  static async fromHTML(html: string): Promise<GroupedActionDump> {
    const imageMap = parseImageScripts(html);
    const dumpJson = parseDumpScript(html);
    return this.fromJSONWithImages(dumpJson, imageMap);
  }

  // ========== 生命周期 ==========

  /**
   * 清理所有存储的截图数据
   */
  async cleanup(): Promise<void> {
    await this._storageProvider.cleanup();
  }

  /**
   * 迁移到另一个存储提供者
   */
  async migrateTo(newProvider: StorageProvider): Promise<void> {
    const screenshots = this.collectAllScreenshots();
    for (const screenshot of screenshots) {
      await screenshot.migrateTo(newProvider);
    }
    this._storageProvider = newProvider;
  }
}
```

---

## utils.ts 函数处理

### 迁移到类方法

| 原函数 | 新位置 | 说明 |
|--------|--------|------|
| `reportHTMLContent` | `GroupedActionDump.toHTML()` | 生成 script 标签 |
| `writeDirectoryReport` | `GroupedActionDump.writeToDirectory()` | 目录格式报告 |
| `extractAndSaveScreenshots` | `GroupedActionDump.writeToDirectory()` 内部 | 提取截图 |
| `parseDumpData` | `GroupedActionDump.fromJSON()` | 解析 JSON |

### 删除（不再需要）

| 函数 | 原因 |
|------|------|
| `stringifyDumpData` | 被 `GroupedActionDump.serialize()` 替代 |
| `replacerForPageObject` | 不再有 Page 对象序列化问题 |
| `traverseImageFields` | 被 `collectAllScreenshots()` 替代 |
| `isImageField` 等辅助函数 | 不再需要遍历查找截图 |

### 保留

| 函数 | 说明 |
|------|------|
| `getReportTpl` | 获取报告 HTML 模板 |
| `insertScriptBeforeClosingHtml` | append 模式需要 |
| `processCacheConfig` | 缓存配置处理 |
| `getTmpDir` / `getTmpFile` | 临时文件工具 |
| `overlapped` / `sleep` | 通用工具函数 |
| `getVersion` | 版本获取 |

---

## report.ts 处理

### ReportMergingTool 兼容性

`ReportMergingTool` 用于合并多个报告文件，需要更新以支持新的图片 script 标签格式。

**当前问题**：
- `extractScriptContent` 只提取 `midscene_web_dump` script
- 未处理 `<script type="midscene-image">` 图片标签

**修改方案**：

```typescript
export class ReportMergingTool {
  /**
   * 提取所有 script 内容（图片 + dump）
   */
  private extractAllScripts(filePath: string): string {
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    // 提取图片 script 标签
    const imageScripts: string[] = [];
    const imageRegex = /<script type="midscene-image"[^>]*>[\s\S]*?<\/script>/g;
    let match;
    while ((match = imageRegex.exec(fileContent)) !== null) {
      imageScripts.push(match[0]);
    }

    // 提取 dump script 标签（带 attributes）
    const dumpRegex = /<script type="midscene_web_dump"[^>]*>[\s\S]*?<\/script>/;
    const dumpMatch = dumpRegex.exec(fileContent);
    const dumpScript = dumpMatch ? dumpMatch[0] : '';

    return imageScripts.join('\n') + '\n' + dumpScript;
  }

  public mergeReports(
    reportFileName: 'AUTO' | string = 'AUTO',
    opts?: { rmOriginalReports?: boolean; overwrite?: boolean }
  ): string | null {
    // ... 前置检查 ...

    // 写入模板
    fs.writeFileSync(outputFilePath, getReportTpl());

    // 合并所有报告
    for (const reportInfo of this.reportInfos) {
      const allScripts = this.extractAllScripts(reportInfo.reportFilePath);
      insertScriptBeforeClosingHtml(outputFilePath, allScripts);
    }

    // ... 清理原文件 ...
    return outputFilePath;
  }
}
```

**注意事项**：
- 合并后的报告会包含所有原报告的图片（可能导致文件较大）
- 图片 ID 需要确保唯一性（当前使用 `groupId-img-N` 格式已保证）

---

## Playground 兼容性

### 当前逻辑

Playground（本地执行和服务端）需要将 dump 中的图片 ID 恢复为 base64：

```typescript
// packages/playground/src/common.ts
export function extractDumpWithImages(agent): ExecutionDump | null {
  const dumpString = agent.dumpDataString();
  const groupedDump = JSON.parse(dumpString);
  const dump = groupedDump.executions?.[0];

  // 获取 imageMap 并恢复引用
  const imageMap = agent.getImageMap?.() ?? {};
  return restoreImageReferences(dump, imageMap);
}
```

### 问题

新方案中 `ScreenshotItem.getData()` 是**异步**的，但 `agent.getImageMap()` 是**同步**的。

### 解决方案：改为异步 API

由于图片已经存入文件，不需要在内存中缓存。直接将 API 改为异步：

```typescript
// packages/core/src/dump/grouped-action-dump.ts

export class GroupedActionDump {
  /**
   * 异步获取 imageMap（按需从文件读取，不缓存）
   */
  async getImageMap(): Promise<Record<string, string>> {
    const screenshots = this.collectAllScreenshots();
    const map: Record<string, string> = {};

    for (const screenshot of screenshots) {
      map[screenshot.id] = await screenshot.getData();
    }

    return map;
  }
}
```

### Agent 适配

```typescript
// packages/core/src/agent/agent.ts

class Agent {
  private dump: GroupedActionDump;

  /**
   * 异步获取 imageMap
   */
  async getImageMap(): Promise<Record<string, string>> {
    return this.dump.getImageMap();
  }
}
```

### Playground 适配

```typescript
// packages/playground/src/common.ts

export async function extractDumpWithImages(
  agent: PlaygroundAgent
): Promise<ExecutionDump | null> {
  const dumpString = agent.dumpDataString();
  if (!dumpString) return null;

  const groupedDump = JSON.parse(dumpString);
  const dump = groupedDump.executions?.[0];
  if (!dump) return null;

  // 改为 await 异步调用
  const imageMap = await agent.getImageMap?.() ?? {};
  return restoreImageReferences(dump, imageMap);
}
```

### 修改文件

| 文件 | 修改 |
|------|------|
| `dump/grouped-action-dump.ts` | 添加异步 `getImageMap()` |
| `agent/agent.ts` | 暴露异步 `getImageMap()` |
| `playground/src/common.ts` | `extractDumpWithImages` 改为 async |
| `playground/src/server.ts` | 调用处加 await |
| `playground/src/adapters/local-execution.ts` | 调用处加 await |
| `screenshot-registry.ts` | `restoreImageReferences` 迁移到 `dump/` 目录 |

### restoreImageReferences 保留

`restoreImageReferences` 函数需要保留，用于：
1. Playground 本地执行
2. Playground Server
3. Chrome Extension
4. 前端报告加载

```typescript
// 迁移到 packages/core/src/dump/image-restoration.ts
export function restoreImageReferences<T>(
  data: T,
  imageMap: Record<string, string>,
): T {
  // 现有逻辑保持不变
  // 遍历对象，将 { $screenshot: "id" } 替换为 base64
}
```

### 重构：ReportWriter 类

新增 `ReportWriter` 类处理文件写入，支持 **append 模式**（多个报告写入同一 HTML）：

```typescript
// packages/core/src/report-writer.ts

export class ReportWriter {
  private initialized = new Map<string, boolean>();

  /**
   * 写入报告到文件
   * @param dump - GroupedActionDump 实例
   * @param reportPath - 报告文件路径
   * @param append - 是否追加到现有报告
   */
  async write(
    dump: GroupedActionDump,
    reportPath: string,
    append = false
  ): Promise<string> {
    const scriptContent = await dump.toHTML();

    if (!append) {
      // 覆盖模式：写入完整报告
      writeFileSync(reportPath, getReportTpl() + '\n' + scriptContent);
    } else {
      // 追加模式：在 </html> 前插入新内容
      if (!this.initialized.get(reportPath)) {
        writeFileSync(reportPath, getReportTpl());
        this.initialized.set(reportPath, true);
      }
      insertScriptBeforeClosingHtml(reportPath, scriptContent);
    }

    return reportPath;
  }

  /**
   * 写入目录格式报告
   */
  async writeDirectory(
    dump: GroupedActionDump,
    outputDir: string
  ): Promise<string> {
    return dump.writeToDirectory(outputDir);
  }
}
```

### 重构后的 writeLogFile

```typescript
export async function writeLogFile(opts: {
  fileName: string;
  dump: GroupedActionDump;
  generateReport?: boolean;
  appendReport?: boolean;
  useDirectoryReport?: boolean;
}): Promise<string | null> {
  if (ifInBrowser || ifInWorker) {
    return '/mock/report.html';
  }

  if (!opts.generateReport) {
    return null;
  }

  const writer = new ReportWriter();

  if (opts.useDirectoryReport) {
    const reportDir = path.join(getMidsceneRunSubDir('report'), opts.fileName);
    return writer.writeDirectory(opts.dump, reportDir);
  }

  const reportPath = path.join(
    getMidsceneRunSubDir('report'),
    `${opts.fileName}.html`
  );
  return writer.write(opts.dump, reportPath, opts.appendReport);
}
```

---

## 辅助函数和类型定义

### 类型定义

```typescript
// packages/core/src/dump/types.ts

/** 可序列化的 ExecutionDump */
export interface SerializableExecutionDump {
  logTime: number;
  name: string;
  description?: string;
  tasks: SerializableExecutionTask[];
  aiActContext?: string;
}

/** 可序列化的 ExecutionTask */
export interface SerializableExecutionTask extends Omit<ExecutionTask, 'recorder'> {
  recorder?: SerializableRecorderItem[];
}

/** 可序列化的 RecorderItem */
export interface SerializableRecorderItem extends Omit<ExecutionRecorderItem, 'screenshot'> {
  screenshot?: { $screenshot: string } | null;
}

/** 可序列化的 GroupedActionDump */
export interface SerializableGroupedActionDump {
  sdkVersion: string;
  groupName: string;
  groupDescription?: string;
  modelBriefs: string[];
  executions: SerializableExecutionDump[];
}
```

### 辅助函数

```typescript
// packages/core/src/dump/html-utils.ts

import { escapeScriptTag, antiEscapeScriptTag } from '@midscene/shared/utils';

/** 转义 HTML script 内容 */
export const escapeContent = escapeScriptTag;

/** 反转义 HTML script 内容 */
export const unescapeContent = antiEscapeScriptTag;

/** 从 HTML 解析图片 script 标签 */
export function parseImageScripts(html: string): Record<string, string> {
  const imageMap: Record<string, string> = {};
  const regex = /<script type="midscene-image" data-id="([^"]+)">([\s\S]*?)<\/script>/g;

  let match;
  while ((match = regex.exec(html)) !== null) {
    const [, id, content] = match;
    imageMap[id] = unescapeContent(content);
  }

  return imageMap;
}

/** 从 HTML 解析 dump script 标签 */
export function parseDumpScript(html: string): string {
  const regex = /<script type="midscene_web_dump"[^>]*>([\s\S]*?)<\/script>/;
  const match = regex.exec(html);

  if (!match) {
    throw new Error('No dump script found in HTML');
  }

  return unescapeContent(match[1]);
}

/** 生成报告 HTML 模板 */
export function generateReportTemplate(dumpJson: string): string {
  const tpl = getReportTpl();
  const dumpTag = `<script type="midscene_web_dump">${escapeContent(dumpJson)}</script>`;
  return tpl.replace('</html>', `${dumpTag}\n</html>`);
}
```

### GroupedActionDump 补充方法

```typescript
// 补充 replaceIdsWithPaths 方法
private replaceIdsWithPaths(
  obj: unknown,
  pathMap: Map<string, string>
): void {
  if (typeof obj !== 'object' || obj === null) return;

  if (Array.isArray(obj)) {
    obj.forEach(item => this.replaceIdsWithPaths(item, pathMap));
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (
      value &&
      typeof value === 'object' &&
      '$screenshot' in value &&
      typeof (value as any).$screenshot === 'string'
    ) {
      const id = (value as any).$screenshot;
      const path = pathMap.get(id);
      if (path) {
        (obj as Record<string, unknown>)[key] = { $screenshot: path };
      }
    } else {
      this.replaceIdsWithPaths(value, pathMap);
    }
  }
}
```

---

## attributes 支持

当前 `toHTML()` 需要支持 dump script 的 attributes（用于 Playwright 报告合并时的元数据）：

```typescript
// GroupedActionDump 扩展

interface ToHTMLOptions {
  attributes?: Record<string, string>;
}

async toHTML(options?: ToHTMLOptions): Promise<string> {
  const { json, images } = await this.serializeWithImages();

  // 生成图片 script 标签
  const imageTags = Array.from(images.entries())
    .map(([id, data]) =>
      `<script type="midscene-image" data-id="${id}">${escapeContent(data)}</script>`
    )
    .join('\n');

  // 生成 dump script 标签（带 attributes）
  let attrString = '';
  if (options?.attributes) {
    attrString = Object.entries(options.attributes)
      .map(([k, v]) => `${k}="${encodeURIComponent(v)}"`)
      .join(' ');
  }

  const dumpTag = attrString
    ? `<script type="midscene_web_dump" ${attrString}>${escapeContent(json)}</script>`
    : `<script type="midscene_web_dump">${escapeContent(json)}</script>`;

  return imageTags + '\n' + dumpTag;
}
```

---

## 向后兼容性

### 旧版本报告处理

旧版本的报告（图片直接嵌入 dump JSON）仍需支持：

```typescript
// GroupedActionDump.fromHTML 需要处理两种格式

static async fromHTML(html: string): Promise<GroupedActionDump> {
  // 1. 尝试新格式：图片在单独的 script 标签
  const imageMap = parseImageScripts(html);

  // 2. 解析 dump
  const dumpJson = parseDumpScript(html);
  const data = JSON.parse(dumpJson);

  // 3. 如果没有单独的图片标签，检查 dump 中是否有内联 base64
  //    （旧格式兼容）
  if (Object.keys(imageMap).length === 0) {
    // 旧格式：图片直接在 dump 中
    return this.fromJSONLegacy(data);
  }

  return this.fromJSONWithImages(dumpJson, imageMap);
}

/** 处理旧格式（图片内联在 dump 中） */
private static fromJSONLegacy(data: any): GroupedActionDump {
  // 旧格式中 screenshot 字段直接是 base64 字符串
  // 需要提取并转换为新格式
  // ...
}
```

### API 兼容性

| 旧 API | 新 API | 迁移方式 |
|--------|--------|----------|
| `ScreenshotItem.fromBase64(base64, registry)` | `ScreenshotItem.create(base64, provider)` | 异步，需要 await |
| `registry.get(id)` | `screenshot.getData()` | 异步，需要 await |
| `agent.getImageMap()` (同步) | `agent.getImageMap()` (异步) | 需要 await |
| `stringifyDumpData(dump)` | `groupedDump.serialize()` | 方法调用 |

---

## 导出说明

### @midscene/core 导出

```typescript
// packages/core/src/index.ts

// Storage
export { StorageProvider, MemoryStorage, FileStorage } from './storage';

// Screenshot
export { ScreenshotItem } from './screenshot-item';

// Dump
export {
  ExecutionDump,
  GroupedActionDump,
  restoreImageReferences,
} from './dump';

// Types
export type {
  SerializableExecutionDump,
  SerializableGroupedActionDump,
} from './dump/types';

// Report
export { ReportWriter } from './report-writer';
```

---

## Chrome Extension 和 Visualizer 处理

### Chrome Extension

Chrome Extension 运行在浏览器环境，使用 `MemoryStorage`：

```typescript
// Chrome Extension 中
const dump = new GroupedActionDump(groupName, {
  storageProvider: new MemoryStorage(), // 浏览器环境只能用内存
});
```

### Visualizer (报告查看器)

Visualizer 需要从 HTML 加载报告：

```typescript
// packages/visualizer/src/utils/load-report.ts

export async function loadReportFromHTML(html: string): Promise<GroupedActionDump> {
  return GroupedActionDump.fromHTML(html);
}

// 或从 script 标签加载（页面内嵌）
export async function loadReportFromPage(): Promise<GroupedActionDump[]> {
  const dumpScripts = document.querySelectorAll('script[type="midscene_web_dump"]');
  const imageScripts = document.querySelectorAll('script[type="midscene-image"]');

  // 构建 imageMap
  const imageMap: Record<string, string> = {};
  imageScripts.forEach(script => {
    const id = script.getAttribute('data-id');
    if (id) {
      imageMap[id] = unescapeContent(script.textContent || '');
    }
  });

  // 加载所有 dump
  const dumps: GroupedActionDump[] = [];
  for (const script of dumpScripts) {
    const json = unescapeContent(script.textContent || '');
    const dump = await GroupedActionDump.fromJSONWithImages(json, imageMap);
    dumps.push(dump);
  }

  return dumps;
}
```

---

## 使用示例

### Agent 中使用

```typescript
class Agent {
  private dump: GroupedActionDump;

  constructor(options: AgentOptions) {
    // 根据配置选择存储提供者
    const storageProvider = options.generateReport
      ? new FileStorage()  // 报告模式用文件存储
      : new MemoryStorage(); // 普通模式用内存

    this.dump = new GroupedActionDump(options.groupName, {
      storageProvider,
    });
  }

  async captureScreenshot(): Promise<ScreenshotItem> {
    const base64 = await this.interface.screenshotBase64();
    return await ScreenshotItem.create(base64, this.dump.storageProvider);
  }

  async writeReport(): Promise<string> {
    if (this.opts.useDirectoryReport) {
      return await this.dump.writeToDirectory(this.reportDir);
    } else {
      const html = await this.dump.toHTML();
      const reportPath = path.join(this.reportDir, 'report.html');
      await writeFile(reportPath, wrapWithTemplate(html));
      return reportPath;
    }
  }

  async destroy(): Promise<void> {
    await this.dump.cleanup();
  }
}
```

### 前端加载

```typescript
async function loadReport(html: string) {
  const dump = await GroupedActionDump.fromHTML(html);
  // dump 已经完全恢复，可以直接使用
  return dump;
}
```

---

## 修改清单

### packages/core/src/

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `storage/provider.ts` | 新建 | StorageProvider 接口定义 |
| `storage/memory.ts` | 新建 | MemoryStorage 实现 |
| `storage/file.ts` | 新建 | FileStorage 实现 |
| `storage/index.ts` | 新建 | 导出所有存储类 |
| `screenshot-item.ts` | 重写 | 基于 StorageProvider 的新实现 |
| `dump/types.ts` | 新建 | 可序列化类型定义 |
| `dump/html-utils.ts` | 新建 | HTML 解析/生成辅助函数 |
| `dump/execution-dump.ts` | 新建 | ExecutionDump 类 |
| `dump/grouped-action-dump.ts` | 新建 | GroupedActionDump 类 |
| `dump/image-restoration.ts` | 新建 | restoreImageReferences 函数 |
| `dump/index.ts` | 新建 | 导出所有 dump 类 |
| `report-writer.ts` | 新建 | 报告写入类（支持 append 模式） |
| `report.ts` | 修改 | ReportMergingTool 支持图片 script 标签 |
| `agent/agent.ts` | 修改 | 使用新的类，暴露异步 getImageMap() |
| `types.ts` | 修改 | 更新/删除旧接口 |
| `utils.ts` | 修改 | 删除序列化函数，保留工具函数 |
| `index.ts` | 修改 | 更新导出 |
| `screenshot-registry.ts` | 删除 | 被 StorageProvider 替代 |

### packages/playground/src/

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `common.ts` | 修改 | `extractDumpWithImages` 改为 async |
| `server.ts` | 修改 | 调用 `getImageMap` 加 await |
| `adapters/local-execution.ts` | 修改 | 调用 `extractDumpWithImages` 加 await |

### packages/visualizer/src/

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `utils/load-report.ts` | 修改 | 使用新的 `GroupedActionDump.fromHTML()` |

---

## 优缺点分析

| 优点 | 说明 |
|------|------|
| 完全类型安全 | 所有数据结构都是类，类型推断准确 |
| 存储抽象清晰 | StorageProvider 接口统一内存/文件/远程存储 |
| 无黑魔法 | 显式调用 `serialize()`，无隐式 `toJSON()` |
| 易于测试 | 可 mock StorageProvider，单元测试简单 |
| 扩展性强 | 新增存储类型只需实现接口 |

| 缺点 | 说明 |
|------|------|
| 改动量大 | 需要重构多个文件 |
| 需要异步初始化 | `ScreenshotItem.create()` 是异步的 |
| 学习成本 | 新的 API 需要熟悉 |
| 迁移工作量 | 现有代码需要适配 |

---

## 实现计划

### 阶段一：基础设施
1. 创建 `storage/` 目录结构
2. 实现 `StorageProvider` 接口
3. 实现 `MemoryStorage` 和 `FileStorage`

### 阶段二：核心类
1. 重写 `ScreenshotItem` 类
2. 创建 `ExecutionDump` 类
3. 创建 `GroupedActionDump` 类

### 阶段三：集成
1. 修改 `Agent` 使用新类
2. 更新报告生成逻辑
3. 更新前端加载逻辑

### 阶段四：清理
1. 删除 `screenshot-registry.ts`
2. 删除 `utils.ts` 中的序列化函数
3. 更新 `types.ts` 中的接口定义
