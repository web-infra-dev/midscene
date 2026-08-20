# RFC 0010 · Workflow Execution Project 并发调度

状态：**已实现**

范围：让 `runTestProject()` 以 Execution Project 为最小并发单元，并用
`test.maxConcurrency` 限制一次 run 中同时 active 的 Project 数量。单个
Execution Project 内部的 Workflow Document、Case、retry 和 Step 仍保持串行。

本 RFC 建立在 RFC 0005 定义的单进程 runner 与稳定顺序之上，只取代其
“runner 不支持并发”的限制。配置、Node Registry 和 Handler 仍在同一进程中
单次加载，单个 Project 内部的执行顺序也不变。

---

## 1. 结论

`TestProjectDefinition.test.maxConcurrency` 接受正整数，默认值为 `1`：

```ts
export default defineTestProject({
  projects: [androidProject, iosProject, webProject],
  test: {
    maxConcurrency: 2,
    bail: 0,
    testTimeout: 120_000,
  },
  nodes,
});
```

上述配置最多同时运行两个 Execution Project。每个 Project 占用一个并发
slot，从 Project setup 开始一直持有到 Project teardown 完成。下一个 Project 不会
在上一个 Project 仍在释放设备、浏览器或其他资源时提前复用该 slot。

`maxConcurrency: 1` 保持原有串行行为。当配置值大于本次选中的 Project 数量时，
有效并发度为选中 Project 数量。

## 2. 为什么以 Project 为并发边界

一个 Execution Project 通常通过 setup 获取一个设备、browser page、Agent 或云端
lease，再把同一份 Context 传给该 Project 内的全部 Node。如果在同一 Project 内并发
Document 或 Case，多个执行链会同时操作同一份可变状态，并破坏 `beforeAll`、
`beforeEach`、retry、history 和 teardown 的时序。

不同 Execution Project 则有独立的 setup 生命周期和 Context，可以分别获取不同资源。
因此，Project 是在不改变 YAML 执行语义的前提下提升吞吐量的最小安全边界。

## 3. 配置契约

`test.maxConcurrency` 遵循以下规则：

1. 省略时解析为 `1`；
2. 必须是有限正整数；
3. `0`、负数、小数、字符串与无穷大都是配置错误；
4. 它仅控制 Execution Project 并发，不隐式改变任何其他层级的调度方式；
5. 本次不增加 CLI `--max-concurrency` 参数，配置文件是唯一入口。

## 4. 调度模型

runner 先完成全部已选 Project 的文件发现、收集、变量解析和静态校验，再获取
Project 资源。这一 preflight 边界不因并发而改变。

执行阶段使用有界 worker pool。worker 按配置顺序领取下一个未启动 Project，并在
同一 worker 中运行完整 Project 生命周期：

```text
claim Project in configuration order
  Project setup                      <-- acquire slot
    Workflow Document 1
      beforeAll
      Case 1 attempt 1
      Case 1 retry
      Case 2 attempt 1
      afterAll
      document-scoped cleanup
    Workflow Document 2
      ...
  Project teardown                   <-- release slot after completion
claim next Project
```

同一 Project 内不创建 Document、Case、attempt 或 Step worker pool。这些层级继续使用
现有顺序，并继续共享该 Project setup 返回的 Context。

没有 setup 的 Project 在开始执行时占用 slot，在其虚拟 teardown 边界结束时释放。
在 preflight 中已经失败的 Project 不获取运行资源，它的 Case 直接记录为
`project-preflight-failed`。

## 5. 顺序与可观测性

并发只允许完成时间不确定，不允许输出结构随完成顺序漂移。

- Project 按配置顺序领取；
- `summary.json`、`runTestProject()` 返回值和汇总结果中的 Project 始终按配置顺序排列；
- 单个 Project 内部的 Document 和 Case 顺序不变；
- 并发 Project 的实时 progress 可以交错，并带有 Project 名称以标识来源；
- `maxConcurrency: 1` 继续使用原有单 Project progress 格式。

本 RFC 不修改结果 schema、fact 文件身份、报告目录或 Midscene HTML 报告语义。

## 6. Bail、中断与错误

### 6.1 Bail

`test.bail` 仍按最终失败 Case 数计数，`0` 表示禁用。达到阈值后：

1. worker 不再领取或启动新 Project；
2. 已启动 Project 的当前 Case 允许完成必要的 `afterEach` 和 Node cleanup；
3. 该 Project 在下一个调度边界停止新 Case 或 Document，未运行 Case 标记为 `bail`；
4. 已启动 Document 的 `afterAll` 与 Document cleanup，以及 Project teardown
   仍按生命周期规则执行；
5. slot 在 Project teardown 完成后释放，但不再用于启动新 Project。

因为多个 Project 可能在阈值达到前已经开始 Case，最终失败数可以超过 `bail`
阈值。这是有界并发下的预期语义，不通过强制中断已运行 Case 来追求精确计数。

### 6.2 中断

SIGINT 或 SIGTERM 会中断整次 run：

- 不再启动新 Project；
- active Step 收到 aborted signal；
- 已启动 Project 使用可用于清理的 signal 执行 hook、Node cleanup 和 Project teardown；
- runner 等待所有已启动 Project 完成清理后再返回中断结果。

### 6.3 错误隔离

Project setup 失败只使该 Project 无法执行 Case。setup 失败前已注册的 teardown 仍会
执行，其他 Project 可以继续。Project 中的业务 Case 失败也不会直接取消其他
Project，除非它使 `bail` 达到阈值。

fatal device error 也只停止拥有该设备 Context 的 Project；该 Project 的剩余 Case
标记为 `fatal-error`，其他 Project 继续运行。fatal Case 仍计入最终失败 Case，因此
可能通过全局 `bail` 间接停止后续 Project 调度。

调度器、结果写入或 progress callback 等基础设施错误属于整次 run 的错误。runner
会中断 root signal，停止领取新 Project，等待所有已启动 Project 完成清理，然后
重新抛出第一个基础设施错误。

## 7. 并发安全契约

Test Project 配置模块只加载一次，Node Registry 和 Node Handler 对所有 Execution
Project 共享。因此，开启大于 `1` 的并发度时，项目维护者必须保证：

- 每次 Project setup 获取该 Project 独立的设备、page、Agent、lease 和续租任务；
- setup 返回的 Context 不与其他 active Project 共享不可并发的可变对象；
- 配置模块顶层变量和 Node 闭包捕获的可变状态是只读、按 Project 分区，或使用
  正确的同步机制；
- teardown 只释放当前 Project 获取的资源，不关闭其他 active Project 正在使用的
  全局对象；
- 结果目录、报告文件名和业务测试数据不使用会发生跨 Project 冲突的固定身份。

如果底层只有一个物理设备、一个可变 browser page，或一份无法隔离的全局数据，
项目应保持 `maxConcurrency: 1`。runner 不会自动推断资源是否安全。

## 8. 非目标

本 RFC 不包含：

- 单个 Execution Project 内的 Document、Case、retry 或 Step 并发；
- DAG、依赖调度、分支、循环或 Step parallel 语法；
- worker thread 或子进程隔离；
- 为共享设备、Agent 或业务数据自动加锁；
- 动态调整并发度、Project 优先级或公平调度策略；
- 新的 CLI 并发参数；
- 结果 schema、`midscene_run` 路径或 HTML 报告改造。

## 9. 验收条件

1. `maxConcurrency` 省略或为 `1` 时，Project 按原顺序串行；
2. 三个 Project 配置 `maxConcurrency: 2` 时，同时 active 的 Project 不超过两个；
3. slot 在 setup 开始时占用，且在 teardown 完成前不释放；
4. 不同 Project 可并发，但同一 Project 中的 Case 不并发；
5. Project 完成顺序变化时，返回结果和 `summary.json` 仍按配置顺序；
6. 并发 progress 可以明确识别所属 Project；
7. bail 达到阈值后不再启动新 Project，active Project 完成 cleanup 和 teardown；
8. SIGINT 与 SIGTERM 不启动新 Project，且在返回前 drain 所有已启动 Project；
9. setup 失败会执行已注册 teardown，不会超出并发上限；
10. 无效 `maxConcurrency` 在执行 setup 前以明确配置错误失败。
