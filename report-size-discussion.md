# Inline Report 体积膨胀问题讨论稿

## TL;DR

Midscene 的单文件（inline）报告会在执行期间不断追加完整的 execution dump。前端加载时会按 execution id/name 只使用最后一份，但 HTML 文件不会清理旧 dump。长任务因此累积大量不可见的重复 JSON。

这不是某次任务 error 后遗漏清理造成的偶发问题：当前 `finalize()` 在正常结束时同样不会 compact，反而会额外追加一次最新 dump。

建议保留执行中的 append-only 写入，保障运行期间的报告实时可见和主线程不被同步 I/O 阻塞；在报告结束、上传或导出前增加一次安全的 compact。对已完成报告，这项优化通常应优先于图片格式转换。

## 复现实例

报告：`android-2026-06-08_11-39-19-123cf110.html`

| 项目 | 结果 |
| --- | ---: |
| 原始单文件报告 | 150.30 MiB |
| 内嵌截图节点 | 83 个（79 张去重画面，均为 PNG） |
| 截图 Base64 节点占用 | 92.75 MiB |
| `midscene_web_dump` JSON 标签 | 487 份 |
| 这些 dump 对应的 execution | 1 个 |
| 所有 dump JSON | 55.56 MiB |
| 最后一份有效 dump | 约 232 KiB |
| 可回收的重复 dump JSON | 约 55.34 MiB |
| 实际 report shell / JS / 其他非截图内容 | 约 1.56 MiB |

换言之，截图以外看似有约 57.6 MiB，并不是 report bundle 很大；其中几乎全部是历史 dump。

## 当前实现与取舍

`ReportGenerator.writeInlineExecution()` 的当前策略是：

1. 首次写入 report shell。
2. 每次 execution 更新时，只追加此前尚未写入的截图。
3. 每次 execution 更新时，追加完整的 `midscene_web_dump`。
4. 前端加载所有 dump 后，按稳定 execution id 去重并保留最后一份。

这个设计有明确的运行期收益：报告可增量更新；写入通过 `fs/promises` 异步排队，避免大 dump 在 Electron 主线程同步落盘而冻结 IPC 和 UI。

但 append-only 文件不会自行收缩。`finalize()` 当前会重写一次最后 execution、等待队列完成、追加 Agent comment，然后直接返回 report 路径；它没有 compact 或重写 HTML 的步骤。因此成功、失败都保留完整历史。非正常进程退出只会让最终状态少一次写入，不是历史 dump 未被清理的根因。

相关实现：

- `packages/core/src/report-generator.ts`：`writeInlineExecution()`、`finalize()`。
- `packages/core/src/report.ts`：已经有读取所有 dump 后按 execution id 保留最后一份的去重逻辑，可作为 compact 语义的参考。

## 与图片压缩的关系

同一份 Android report 的图片实验结果如下：

| 方案 | 完整报告 | 截图二进制 |
| --- | ---: | ---: |
| 原始 PNG | 150.30 MiB | 69.56 MiB |
| 仅截图改为 WebP quality 90 | 85.42 MiB | 20.89 MiB |

WebP 使截图二进制减少约 70%，但完整报告只减少约 43%，因为重复 dump 没有变化。

若先 compact 重复 dump，再做 WebP quality 90，按该样本估计可从 150.30 MiB 降至约 30 MiB。两个优化相互独立：

- **dump compact**：消除重复的结构化数据；对 JPEG/PNG/WebP 都有效。
- **WebP/AV1 等图片或视频编码**：降低截图资产大小；对截图密集报告有效。

## 建议方案

### 方案 A：在 `finalize()` 后 compact（推荐）

执行期仍维持 append-only；结束时：

1. 等待现有 write queue 完成。
2. 解析报告中所有 dump，按当前前端一致的规则保留每个 execution 的最后版本。
3. 保留已写入且仍被引用的截图节点、report shell 与 Agent comment。
4. 写到临时文件，校验完成后以原子 rename 替换原报告。

优点：最终报告天然紧凑，用户无需额外操作。风险点是最终重写会有一次 I/O 峰值，需确保失败时保留原文件。

### 方案 B：上传/导出前 compact

不改变本地执行期间以及结束后的原文件；只对即将上传或导出的副本 compact。

优点：对现有生成路径侵入小。缺点：用户本地打开的已完成报告仍然很大，且不同入口的行为不一致。

### 方案 C：提供显式 `compactReport()` 或 CLI

作为 A/B 的补充，适合历史报告和排障文件。单独提供并不能解决默认体验。

## 需要讨论和确认的点

1. 是否接受 `finalize()` 时一次异步 compact，作为单文件报告的默认行为？
2. compact 的保留语义是否应严格复用前端当前的 execution 去重规则，避免渲染结果变化？
3. 如何保证原子性：临时文件 + rename 失败时保留原报告；Windows 上的替换策略也需要覆盖。
4. 是否仅 compact inline HTML，还是 `html-and-external-assets` 格式也需要处理重复 dump？
5. 上传/导出流程是否应额外对旧报告执行 compact，避免历史报告继续占用 CDN 和下载流量？
6. 图片格式升级（例如 `image/webp`）是否与 compact 拆成两个独立改动推进？建议拆开，先解决无损的重复 dump。

## 建议的验收指标

- 长任务结束后的 HTML 中，对同一个 execution 只保留一份有效 dump。
- compact 前后在 report UI 中显示的 execution、task、截图和 Agent comment 一致。
- 执行中仍可打开并实时刷新报告。
- compact 失败不会损坏原报告。
- 为多次 update、多个 execution、失败 execution、旧格式 dump、directory mode 添加回归测试。
