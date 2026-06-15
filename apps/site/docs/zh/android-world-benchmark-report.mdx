# Midscene AndroidWorld Benchmark 测试报告

import { BenchmarkReportPreview } from '@theme';

<style>{`
.benchmark-status {
  display: inline-flex;
  min-width: 48px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}

.benchmark-status-pass {
  color: #15803d;
  background: rgb(220 252 231 / 70%);
  border: 1px solid rgb(187 247 208 / 80%);
}

.benchmark-status-fail {
  color: #b91c1c;
  background: rgb(254 226 226 / 75%);
  border: 1px solid rgb(254 202 202 / 85%);
}

.dark .benchmark-status-pass {
  color: #86efac;
  background: rgb(22 101 52 / 35%);
  border-color: rgb(34 197 94 / 35%);
}

.dark .benchmark-status-fail {
  color: #fca5a5;
  background: rgb(127 29 29 / 35%);
  border-color: rgb(248 113 113 / 35%);
}

.benchmark-round table {
  width: 100%;
  table-layout: fixed;
}

.benchmark-round th,
.benchmark-round td {
  vertical-align: middle;
}

.benchmark-round th:nth-child(1),
.benchmark-round td:nth-child(1) {
  width: 56px;
  text-align: center;
}

.benchmark-round th:nth-child(2),
.benchmark-round td:nth-child(2) {
  width: auto;
  word-break: break-word;
}

.benchmark-round th:nth-child(3),
.benchmark-round td:nth-child(3) {
  width: 104px;
  text-align: center;
}

.benchmark-round th:nth-child(4),
.benchmark-round td:nth-child(4) {
  width: 112px;
}

.benchmark-report-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  white-space: nowrap;
}

.benchmark-report-link::after {
  content: "↗";
  font-size: 0.9em;
  line-height: 1;
  transform: translateY(-1px);
}
`}</style>

<BenchmarkReportPreview
  invalidMessage="无效的 benchmark 报告 URL。"
  loadingMessage="报告加载中..."
  titlePrefix="Benchmark 报告"
/>

本文是 Midscene 针对 AndroidWorld benchmark 的测试报告。本次测试中，Midscene 取得了 **Pass@1 93.10%**、**Pass@2 95.69%**、**Pass@3 97.41%** 的结果。

:::info 关于 Android World

[AndroidWorld](https://github.com/google-research/android_world) 是 Google Research 提供的 Android Agent benchmark。它运行在真实 Android 模拟器上，用 20 个真实 Android 应用中的 116 个程序化任务来评估 Agent，并由 benchmark 负责初始化任务和校验结果。

:::

## 运行配置

| 字段 | 值 |
| --- | --- |
| Model Name | `Gemini-3.5-Flash` |
| Midscene version | `1.9.5` |
| DeepThink | on |
| `MIDSCENE_REPLANNING_CYCLE_LIMIT` | 120 |
| AndroidWorld 工程 | 为了降低 benchmark 过程中的偶发波动，我们对 AndroidWorld 工程做了若干稳定性修复。具体例子见下方。 |
| 验收规则 | 少量 AndroidWorld validator 按任务意图做了校准，涉及的 case 见下方列表。 |

## 稳定性提升

以下改动不改变任务意图，主要用于降低浏览器渲染、accessibility tree 刷新、任务 setup 时序等带来的偶发失败。

| 修改内容 | 涉及的 case |
| --- | --- |
| BrowserDraw 绘制后强制刷新 canvas 像素，并加粗、圆角化画笔，让目标颜色更稳定地落到最终 canvas 像素里。 | `BrowserDraw` |
| Browser task 完成后，读取 accessibility tree 中的 `Success!` 文本时增加重试，避免 stale accessibility tree 误判。 | `BrowserMaze`<br />`BrowserMultiply`<br />`BrowserDraw` |
| SMS 任务开始前会先准备好需要的短信和联系人；现在会确认这些短信能在收件箱查到、联系人能在通讯录查到，再开始让 agent 执行。 | `SimpleSmsReplyMostRecent`<br />`SimpleSmsSendReceivedAddress` |
| Expense 类任务启动 Pro Expense 后等待数据库表创建完成，再由 validator 写入测试数据，避免初始数据库未初始化导致失败。 | `ExpenseAddMultiple`<br />`ExpenseAddMultipleFromGallery`<br />`ExpenseAddMultipleFromMarkor`<br />`ExpenseAddSingle`<br />`ExpenseDeleteDuplicates`<br />`ExpenseDeleteDuplicates2`<br />`ExpenseDeleteMultiple`<br />`ExpenseDeleteMultiple2`<br />`ExpenseDeleteSingle` |
| OsmAnd 任务提前把离线地图文件放入应用数据目录，并等待 OsmAnd 解压内置底图，确保地图数据 ready 后再执行。 | `OsmAndFavorite`<br />`OsmAndMarker`<br />`OsmAndTrack` |

## 验证条件调整

本次 benchmark 使用的 AndroidWorld `main` 分支中，以下验证条件做过调整：

| 修改内容 | 涉及的 case |
| --- | --- |
| Calendar 的 "after start time" 验收目标改为边界点之后 1 分钟的事件，避免事件正好落在边界点时，不同模型对 `after` 是否包含边界点的理解差异影响判定。 | `SimpleCalendarFirstEventAfterStartTime` |
| Expense 从 Markor 导入时，接受 Markor note 中额外带上的 `Reimbursable.` 后缀；对比 note 文本时会忽略这个后缀及末尾句号差异。 | `ExpenseAddMultipleFromMarkor` |
| Markor 合并 notes 时，允许单换行或空行分隔，并兼容 Markor 自动补上的 `.md` 扩展名。 | `MarkorMergeNotes` |
| Recipe 的数量、时长和 ingredient count 允许省略单位，但错误数量或错误单位仍会失败。 | `RecipeAddSingleRecipe`<br />`RecipeAddMultipleRecipes`<br />`RecipeAddMultipleRecipesFromMarkor`<br />`RecipeAddMultipleRecipesFromMarkor2`<br />`RecipeAddMultipleRecipesFromImage`<br />`NotesRecipeIngredientCount` |
| 最小亮度按 Android 实际 setting 值 `0` 验证，而不是旧的 `1`。 | `SystemBrightnessMin`<br />`SystemBrightnessMinVerify` |

## 报告文件

详细的报告如下，供大家参考。

<details open className="benchmark-round">
<summary>Round 1（115 份报告 · 108 PASS · 7 FAIL）</summary>

| # | 任务 | 状态 | 报告 |
| --- | --- | --- | --- |
| 1 | AudioRecorderRecordAudio | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-1-AudioRecorderRecordAudio__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 2 | AudioRecorderRecordAudioWithFileName | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-2-AudioRecorderRecordAudioWithFileName__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 3 | BrowserDraw | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-3-BrowserDraw__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 4 | BrowserMaze | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-4-BrowserMaze__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 5 | BrowserMultiply | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-5-BrowserMultiply__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 6 | CameraTakePhoto | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-6-CameraTakePhoto__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 7 | CameraTakeVideo | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-7-CameraTakeVideo__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 8 | ClockStopWatchPausedVerify | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-8-ClockStopWatchPausedVerify__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 9 | ClockStopWatchRunning | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-9-ClockStopWatchRunning__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 10 | ClockTimerEntry | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-10-ClockTimerEntry__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 11 | ContactsAddContact | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-11-ContactsAddContact__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 12 | ContactsNewContactDraft | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-12-ContactsNewContactDraft__group-0-870fcd56-5c81-4700-b73e-deffc5151594-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 13 | ExpenseAddMultiple | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-13-ExpenseAddMultiple__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 14 | ExpenseAddMultipleFromGallery | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-14-ExpenseAddMultipleFromGallery__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 15 | ExpenseAddMultipleFromMarkor | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-15-ExpenseAddMultipleFromMarkor__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 16 | ExpenseAddSingle | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-16-ExpenseAddSingle__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 17 | ExpenseDeleteDuplicates | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-17-ExpenseDeleteDuplicates__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 18 | ExpenseDeleteDuplicates2 | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-18-ExpenseDeleteDuplicates2__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 19 | ExpenseDeleteMultiple | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-19-ExpenseDeleteMultiple__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 20 | ExpenseDeleteMultiple2 | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-20-ExpenseDeleteMultiple2__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 21 | ExpenseDeleteSingle | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-21-ExpenseDeleteSingle__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 22 | FilesDeleteFile | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-22-FilesDeleteFile__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 23 | FilesMoveFile | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-23-FilesMoveFile__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 24 | MarkorAddNoteHeader | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-24-MarkorAddNoteHeader__group-1-41cadf26-7f06-4b4c-9bc1-8c35347f11fd-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 25 | MarkorChangeNoteContent | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-25-MarkorChangeNoteContent__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 26 | MarkorCreateFolder | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-26-MarkorCreateFolder__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 27 | MarkorCreateNote | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-27-MarkorCreateNote__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 28 | MarkorCreateNoteAndSms | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-28-MarkorCreateNoteAndSms__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 29 | MarkorCreateNoteFromClipboard | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-29-MarkorCreateNoteFromClipboard__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 30 | MarkorDeleteAllNotes | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-30-MarkorDeleteAllNotes__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 31 | MarkorDeleteNewestNote | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-31-MarkorDeleteNewestNote__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 32 | MarkorDeleteNote | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-32-MarkorDeleteNote__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 33 | MarkorEditNote | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-33-MarkorEditNote__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 34 | MarkorMergeNotes | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-34-MarkorMergeNotes__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 35 | MarkorMoveNote | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-35-MarkorMoveNote__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 36 | MarkorTranscribeReceipt | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-36-MarkorTranscribeReceipt__group-2-b42ec230-5cee-4b34-917e-15f8e3296c01-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 37 | MarkorTranscribeVideo | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-37-MarkorTranscribeVideo__group-3-ef3f3ad9-563f-4802-8a0c-05f45aa3d302-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 38 | OpenAppTaskEval | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-38-OpenAppTaskEval__group-3-ef3f3ad9-563f-4802-8a0c-05f45aa3d302-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 39 | OsmAndFavorite | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-39-OsmAndFavorite__group-3-ef3f3ad9-563f-4802-8a0c-05f45aa3d302-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 40 | OsmAndMarker | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-40-OsmAndMarker__group-3-ef3f3ad9-563f-4802-8a0c-05f45aa3d302-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 42 | RecipeAddMultipleRecipes | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-42-RecipeAddMultipleRecipes__group-3-ef3f3ad9-563f-4802-8a0c-05f45aa3d302-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 43 | RecipeAddMultipleRecipesFromImage | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-43-RecipeAddMultipleRecipesFromImage__group-3-ef3f3ad9-563f-4802-8a0c-05f45aa3d302-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 44 | RecipeAddMultipleRecipesFromMarkor | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-44-RecipeAddMultipleRecipesFromMarkor__group-3-ef3f3ad9-563f-4802-8a0c-05f45aa3d302-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 45 | RecipeAddMultipleRecipesFromMarkor2 | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-45-RecipeAddMultipleRecipesFromMarkor2__group-4-e26952de-4051-468d-b545-16865f0487da-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 46 | RecipeAddSingleRecipe | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-46-RecipeAddSingleRecipe__group-4-e26952de-4051-468d-b545-16865f0487da-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 47 | RecipeDeleteDuplicateRecipes | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-47-RecipeDeleteDuplicateRecipes__group-4-e26952de-4051-468d-b545-16865f0487da-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 48 | RecipeDeleteDuplicateRecipes2 | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-48-RecipeDeleteDuplicateRecipes2__group-4-e26952de-4051-468d-b545-16865f0487da-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 49 | RecipeDeleteDuplicateRecipes3 | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-49-RecipeDeleteDuplicateRecipes3__group-4-e26952de-4051-468d-b545-16865f0487da-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 50 | RecipeDeleteMultipleRecipes | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-50-RecipeDeleteMultipleRecipes__group-4-e26952de-4051-468d-b545-16865f0487da-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 51 | RecipeDeleteMultipleRecipesWithConstraint | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-51-RecipeDeleteMultipleRecipesWithConstraint__group-4-e26952de-4051-468d-b545-16865f0487da-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 52 | RecipeDeleteMultipleRecipesWithNoise | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-52-RecipeDeleteMultipleRecipesWithNoise__group-4-e26952de-4051-468d-b545-16865f0487da-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 53 | RecipeDeleteSingleRecipe | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-53-RecipeDeleteSingleRecipe__group-4-e26952de-4051-468d-b545-16865f0487da-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 54 | RecipeDeleteSingleWithRecipeWithNoise | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-54-RecipeDeleteSingleWithRecipeWithNoise__group-4-e26952de-4051-468d-b545-16865f0487da-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 55 | RetroCreatePlaylist | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-55-RetroCreatePlaylist__group-4-e26952de-4051-468d-b545-16865f0487da-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 56 | RetroPlayingQueue | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-56-RetroPlayingQueue__group-4-e26952de-4051-468d-b545-16865f0487da-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 57 | RetroPlaylistDuration | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-57-RetroPlaylistDuration__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 58 | RetroSavePlaylist | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-58-RetroSavePlaylist__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 59 | SaveCopyOfReceiptTaskEval | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-59-SaveCopyOfReceiptTaskEval__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 60 | SimpleCalendarAddOneEvent | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-60-SimpleCalendarAddOneEvent__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 61 | SimpleCalendarAddOneEventInTwoWeeks | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-61-SimpleCalendarAddOneEventInTwoWeeks__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 62 | SimpleCalendarAddOneEventRelativeDay | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-62-SimpleCalendarAddOneEventRelativeDay__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 63 | SimpleCalendarAddOneEventTomorrow | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-63-SimpleCalendarAddOneEventTomorrow__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 64 | SimpleCalendarAddRepeatingEvent | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-64-SimpleCalendarAddRepeatingEvent__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 65 | SimpleCalendarDeleteEvents | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-65-SimpleCalendarDeleteEvents__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 66 | SimpleCalendarDeleteEventsOnRelativeDay | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-66-SimpleCalendarDeleteEventsOnRelativeDay__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 67 | SimpleCalendarDeleteOneEvent | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-67-SimpleCalendarDeleteOneEvent__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 68 | SimpleDrawProCreateDrawing | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-68-SimpleDrawProCreateDrawing__group-6-da9c75aa-15dc-4c93-8d4d-058322db6c12-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 69 | SimpleSmsReply | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-69-SimpleSmsReply__group-6-da9c75aa-15dc-4c93-8d4d-058322db6c12-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 70 | SimpleSmsReplyMostRecent | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-70-SimpleSmsReplyMostRecent__group-6-da9c75aa-15dc-4c93-8d4d-058322db6c12-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 71 | SimpleSmsResend | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-71-SimpleSmsResend__group-7-5743ca3e-6ab9-41a8-b0f0-3b3d47bb5e9d-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 72 | SimpleSmsSend | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-72-SimpleSmsSend__group-7-5743ca3e-6ab9-41a8-b0f0-3b3d47bb5e9d-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 73 | SimpleSmsSendClipboardContent | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-73-SimpleSmsSendClipboardContent__group-7-5743ca3e-6ab9-41a8-b0f0-3b3d47bb5e9d-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 74 | SimpleSmsSendReceivedAddress | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-74-SimpleSmsSendReceivedAddress__group-7-5743ca3e-6ab9-41a8-b0f0-3b3d47bb5e9d-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 75 | SystemBluetoothTurnOff | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-75-SystemBluetoothTurnOff__group-7-5743ca3e-6ab9-41a8-b0f0-3b3d47bb5e9d-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 76 | SystemBluetoothTurnOffVerify | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-76-SystemBluetoothTurnOffVerify__group-8-47bb9356-d880-425c-87cc-e0a575c206fe-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 77 | SystemBluetoothTurnOn | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-77-SystemBluetoothTurnOn__group-8-47bb9356-d880-425c-87cc-e0a575c206fe-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 78 | SystemBluetoothTurnOnVerify | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-78-SystemBluetoothTurnOnVerify__group-8-47bb9356-d880-425c-87cc-e0a575c206fe-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 79 | SystemBrightnessMax | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-79-SystemBrightnessMax__group-8-47bb9356-d880-425c-87cc-e0a575c206fe-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 80 | SystemBrightnessMaxVerify | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-80-SystemBrightnessMaxVerify__group-8-47bb9356-d880-425c-87cc-e0a575c206fe-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 81 | SystemBrightnessMin | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-81-SystemBrightnessMin__group-8-47bb9356-d880-425c-87cc-e0a575c206fe-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 82 | SystemBrightnessMinVerify | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-82-SystemBrightnessMinVerify__group-8-47bb9356-d880-425c-87cc-e0a575c206fe-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 83 | SystemCopyToClipboard | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-83-SystemCopyToClipboard__group-8-47bb9356-d880-425c-87cc-e0a575c206fe-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 84 | SystemWifiTurnOff | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-84-SystemWifiTurnOff__group-8-47bb9356-d880-425c-87cc-e0a575c206fe-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 85 | SystemWifiTurnOffVerify | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-85-SystemWifiTurnOffVerify__group-8-47bb9356-d880-425c-87cc-e0a575c206fe-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 86 | SystemWifiTurnOn | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-86-SystemWifiTurnOn__group-8-47bb9356-d880-425c-87cc-e0a575c206fe-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 87 | SystemWifiTurnOnVerify | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-87-SystemWifiTurnOnVerify__group-9-3e79ebb7-b4ce-469c-8ab4-3144e89fd63e-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 88 | TurnOffWifiAndTurnOnBluetooth | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-88-TurnOffWifiAndTurnOnBluetooth__group-9-3e79ebb7-b4ce-469c-8ab4-3144e89fd63e-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 89 | TurnOnWifiAndOpenApp | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-89-TurnOnWifiAndOpenApp__group-9-3e79ebb7-b4ce-469c-8ab4-3144e89fd63e-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 90 | VlcCreatePlaylist | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-90-VlcCreatePlaylist__group-9-3e79ebb7-b4ce-469c-8ab4-3144e89fd63e-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 91 | VlcCreateTwoPlaylists | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-91-VlcCreateTwoPlaylists__group-9-3e79ebb7-b4ce-469c-8ab4-3144e89fd63e-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 92 | NotesIsTodo | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-92-NotesIsTodo__group-3-ef3f3ad9-563f-4802-8a0c-05f45aa3d302-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 93 | NotesMeetingAttendeeCount | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-93-NotesMeetingAttendeeCount__group-3-ef3f3ad9-563f-4802-8a0c-05f45aa3d302-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 94 | NotesRecipeIngredientCount | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-94-NotesRecipeIngredientCount__group-3-ef3f3ad9-563f-4802-8a0c-05f45aa3d302-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 95 | NotesTodoItemCount | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-95-NotesTodoItemCount__group-3-ef3f3ad9-563f-4802-8a0c-05f45aa3d302-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 96 | SimpleCalendarAnyEventsOnDate | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-96-SimpleCalendarAnyEventsOnDate__group-5-2004414b-1b9f-45ab-a92c-eaf473e47c3c-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 97 | SimpleCalendarEventOnDateAtTime | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-97-SimpleCalendarEventOnDateAtTime__group-6-da9c75aa-15dc-4c93-8d4d-058322db6c12-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 98 | SimpleCalendarEventsInNextWeek | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-98-SimpleCalendarEventsInNextWeek__group-6-da9c75aa-15dc-4c93-8d4d-058322db6c12-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 99 | SimpleCalendarEventsInTimeRange | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-99-SimpleCalendarEventsInTimeRange__group-6-da9c75aa-15dc-4c93-8d4d-058322db6c12-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 100 | SimpleCalendarEventsOnDate | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-100-SimpleCalendarEventsOnDate__group-6-da9c75aa-15dc-4c93-8d4d-058322db6c12-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 101 | SimpleCalendarFirstEventAfterStartTime | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-101-SimpleCalendarFirstEventAfterStartTime__group-6-da9c75aa-15dc-4c93-8d4d-058322db6c12-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 102 | SimpleCalendarLocationOfEvent | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-102-SimpleCalendarLocationOfEvent__group-6-da9c75aa-15dc-4c93-8d4d-058322db6c12-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 103 | SimpleCalendarNextEvent | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-103-SimpleCalendarNextEvent__group-6-da9c75aa-15dc-4c93-8d4d-058322db6c12-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 104 | SimpleCalendarNextMeetingWithPerson | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-104-SimpleCalendarNextMeetingWithPerson__group-6-da9c75aa-15dc-4c93-8d4d-058322db6c12-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 105 | SportsTrackerActivitiesCountForWeek | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-105-SportsTrackerActivitiesCountForWeek__group-7-5743ca3e-6ab9-41a8-b0f0-3b3d47bb5e9d-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 106 | SportsTrackerActivitiesOnDate | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-106-SportsTrackerActivitiesOnDate__group-7-5743ca3e-6ab9-41a8-b0f0-3b3d47bb5e9d-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 107 | SportsTrackerActivityDuration | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-107-SportsTrackerActivityDuration__group-7-5743ca3e-6ab9-41a8-b0f0-3b3d47bb5e9d-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 108 | SportsTrackerLongestDistanceActivity | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-108-SportsTrackerLongestDistanceActivity__group-7-5743ca3e-6ab9-41a8-b0f0-3b3d47bb5e9d-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 109 | SportsTrackerTotalDistanceForCategoryOverInterval | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-109-SportsTrackerTotalDistanceForCategoryOverInterval__group-7-5743ca3e-6ab9-41a8-b0f0-3b3d47bb5e9d-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 110 | SportsTrackerTotalDurationForCategoryThisWeek | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-110-SportsTrackerTotalDurationForCategoryThisWeek__group-7-5743ca3e-6ab9-41a8-b0f0-3b3d47bb5e9d-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 111 | TasksCompletedTasksForDate | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-111-TasksCompletedTasksForDate__group-9-3e79ebb7-b4ce-469c-8ab4-3144e89fd63e-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 112 | TasksDueNextWeek | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-112-TasksDueNextWeek__group-9-3e79ebb7-b4ce-469c-8ab4-3144e89fd63e-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 113 | TasksDueOnDate | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-113-TasksDueOnDate__group-9-3e79ebb7-b4ce-469c-8ab4-3144e89fd63e-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 114 | TasksHighPriorityTasks | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-114-TasksHighPriorityTasks__group-9-3e79ebb7-b4ce-469c-8ab4-3144e89fd63e-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 115 | TasksHighPriorityTasksDueOnDate | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-115-TasksHighPriorityTasksDueOnDate__group-9-3e79ebb7-b4ce-469c-8ab4-3144e89fd63e-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 116 | TasksIncompleteTasksOnDate | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-116-TasksIncompleteTasksOnDate__group-9-3e79ebb7-b4ce-469c-8ab4-3144e89fd63e-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |

</details>

<details open className="benchmark-round">
<summary>Round 2（7 份报告 · 3 PASS · 4 FAIL）</summary>

| # | 任务 | 状态 | 报告 |
| --- | --- | --- | --- |
| 37 | MarkorTranscribeVideo | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-37-MarkorTranscribeVideo__group-1-64f79cdf-48e8-4f61-8957-25c700986d73-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 40 | OsmAndMarker | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-40-OsmAndMarker__group-2-6bd15c82-4ed2-4f96-abf7-c88572389853-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 41 | OsmAndTrack | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-41-OsmAndTrack__group-3-f4ea5170-8b8e-4f9a-b824-a63f2891b5ce-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 43 | RecipeAddMultipleRecipesFromImage | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-43-RecipeAddMultipleRecipesFromImage__group-4-484dd8b1-5c38-4437-bc2a-dc27c0ae3030-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 48 | RecipeDeleteDuplicateRecipes2 | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-48-RecipeDeleteDuplicateRecipes2__group-5-63973ecd-498e-49c3-bd78-9b4753b09c3b-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 49 | RecipeDeleteDuplicateRecipes3 | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-49-RecipeDeleteDuplicateRecipes3__group-6-aeb4ae0d-5009-4e65-99ba-8b68dec80292-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 83 | SystemCopyToClipboard | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-83-SystemCopyToClipboard__group-7-be57c739-1f22-4619-8d7d-5ed83ce40c5b-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |

</details>

<details open className="benchmark-round">
<summary>Round 3（5 份报告 · 2 PASS · 3 FAIL）</summary>

| # | 任务 | 状态 | 报告 |
| --- | --- | --- | --- |
| 15 | ExpenseAddMultipleFromMarkor | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-15-ExpenseAddMultipleFromMarkor__group-0-369e3fc9-fc5c-4e8b-b772-79ed60e80f08-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 37 | MarkorTranscribeVideo | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-37-MarkorTranscribeVideo__group-1-903c0656-7826-4f41-9690-e91aa30e458c-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 40 | OsmAndMarker | <span className="benchmark-status benchmark-status-pass">PASS</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-40-OsmAndMarker__group-2-9cce7b88-8441-48c5-aed1-a03b6bda31c9-Pass.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 48 | RecipeDeleteDuplicateRecipes2 | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-48-RecipeDeleteDuplicateRecipes2__group-3-ee73848e-6d46-468f-8d76-ead83c182098-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |
| 49 | RecipeDeleteDuplicateRecipes3 | <span className="benchmark-status benchmark-status-fail">FAIL</span> | <a href="/zh/android-world-benchmark-report.html?file=Task-49-RecipeDeleteDuplicateRecipes3__group-4-74e82f14-18f6-467c-a6a9-3b85852aba30-Fail.html" className="benchmark-report-link" target="_blank" rel="noreferrer" title="在新页面打开报告">报告</a> |

</details>
