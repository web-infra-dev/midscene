# PR Review 指南

## 背景

本次改动重构了截图存储和报告生成系统，主要目标：
1. 引入 `StorageProvider` 抽象，支持内存和文件两种存储方式
2. 新增 `ScreenshotItem` 类统一截图数据处理
3. 重构 Dump 序列化系统，支持目录报告格式（图片单独存储）
4. 优化大型报告的内存占用

---

## PR 堆叠结构

```
main
  └── #1770 (PR1) ← 基础设施（纯新增，无破坏性）
        └── #1771 (PR2) ← 核心集成 + 类型改动
              └── #1772 (PR3) ← UI 层
                    └── #1774 (PR4) ← 清理旧 API (Breaking Change)
```

**合入顺序**: PR1 → PR2 → PR3 → PR4（依次合入 main）

---

## PR1: Storage + Dump 基础设施

**链接**: https://github.com/web-infra-dev/midscene/pull/1770

**改动量**: 20 files, +1800 左右

**特点**: 纯新增代码，不修改现有 API，可独立编译

### 核心改动

| 文件 | 说明 |
|------|------|
| `packages/core/src/storage/` | 新增 StorageProvider 接口、MemoryStorage、FileStorage |
| `packages/core/src/screenshot-item.ts` | 新增 ScreenshotItem 类 |
| `packages/core/src/dump/` | 新增 ExecutionDump、GroupedActionDump、序列化工具 |
| `packages/core/src/report-writer.ts` | 新增 ReportWriter |
| `packages/core/src/types.ts` | 仅添加 `ReportDumpWithAttributes.imageMap` 和 `ExecutionRecorderItem.screenshot` 类型 |

### Review 重点

- [ ] StorageProvider 接口设计是否合理
- [ ] ScreenshotItem 的 lazy loading 实现
- [ ] Dump 序列化/反序列化逻辑
- [ ] HTML 工具函数（script tag 生成/解析）

---

## PR2: Agent 集成 + Directory Report

**链接**: https://github.com/web-infra-dev/midscene/pull/1771

**改动量**: 43 files, +997/-427

**特点**: 核心集成，包含类型改动和新功能

### 核心改动

| 文件 | 说明 |
|------|------|
| `packages/core/src/types.ts` | **添加 `UIContext.screenshot` 属性**，添加 AgentOpt 新选项 |
| `packages/core/src/agent/agent.ts` | 集成新的 Storage 和 Dump 系统 |
| `packages/core/src/agent/task-cache.ts` | 更新缓存逻辑 |
| `packages/android/src/agent.ts` | 添加默认 FileStorage |
| `packages/ios/src/agent.ts` | 添加默认 FileStorage |
| `packages/web-integration/src/` | 各平台适配 |
| `apps/site/docs/` | API 文档更新 |

### 新增 API

```typescript
// UIContext 新增属性
abstract screenshot: ScreenshotItem;

// AgentOpt 新增选项
useDirectoryReport?: boolean;      // 使用目录报告格式
storageProvider?: StorageProvider; // 自定义存储提供者
taskCache?: TaskCache;             // 任务缓存实例
filePathResolver?: (filePath: string) => string; // 文件路径解析器
```

### Review 重点

- [ ] `UIContext.screenshot` 属性的引入
- [ ] Agent 生命周期管理（destroyed flag）
- [ ] FileStorage 在各平台的默认行为
- [ ] Directory Report 格式的图片提取逻辑
- [ ] 新增的 `directory-report.test.ts` 测试覆盖

---

## PR3: Visualizer + UI

**链接**: https://github.com/web-infra-dev/midscene/pull/1772

**改动量**: 7 files, +291/-67

### 核心改动

| 文件 | 说明 |
|------|------|
| `packages/visualizer/src/component/blackboard/` | 截图获取逻辑更新 |
| `packages/visualizer/src/utils/playground-utils.ts` | Dump 提取工具 |
| `packages/visualizer/src/utils/replay-scripts.ts` | 图片恢复逻辑 |
| `apps/report/src/` | Report viewer 适配 |

### Review 重点

- [ ] IndexedDBStorageProvider 的 imageMap 支持
- [ ] 图片恢复逻辑的兼容性（新旧格式）
- [ ] Blackboard 组件的 context 变化

---

## PR4: 移除旧 API

**链接**: https://github.com/web-infra-dev/midscene/pull/1774

**改动量**: 1 file, +2/-8

**⚠️ Breaking Change**

### 移除内容

```typescript
// 移除
UIContext.screenshotBase64: string

// 迁移方式
- context.screenshotBase64
+ await context.screenshot.getData()
```

### Review 重点

- [ ] 确认所有使用处已迁移（PR2 中已完成）
- [ ] 是否需要在 changelog 中标注 breaking change

---

## 测试验证

```bash
# 构建验证
pnpm run build

# 单元测试
pnpm run test

# AI 测试（需要 .env）
pnpm run test:ai

# E2E 测试
pnpm run e2e
```

---

## 注意事项

1. **PR4 是 Breaking Change**：如果担心影响，可以先合入 PR1-PR3，PR4 留到下个大版本
2. **合入后目标分支自动变化**：当 PR1 合入后，PR2 的目标分支会自动变成 main
3. **如需修改某个 PR**：修改后需要 rebase 后续 PR 并 force push

```bash
# 例如修改 PR2 后，同步到 PR3 和 PR4
git checkout feat/pr3-visualizer-ui
git rebase feat/pr2-agent-directory-report

git checkout feat/pr4-remove-legacy-api
git rebase feat/pr3-visualizer-ui

git push -f origin feat/pr3-visualizer-ui feat/pr4-remove-legacy-api
```
