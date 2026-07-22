# Backlog

- 排查并增强 `aiAct` plan 回放：相邻的状态切换型 `aiTap` 若经 locate cache 解析为同一元素，当前会原样连续执行，可能把刚展开的下拉框再次收起。需要确定应在规划阶段约束、执行阶段检测/重规划，还是两者结合，并补覆盖下拉选择场景的回归测试。
- 改善报告的 cache 可观测性：`aiAct` plan cache 命中目前只显示为 `LoadYaml Cache`，其后回放的 Tap/Locate 不继承来源标记，容易被误读为未走缓存；评估为回放子步骤增加“来自已缓存工作流”的只读标识。
- 压缩已完成的 inline report dump：当前写入策略会在每次进度更新时 append 完整 dump，前端仅在读取时按 execution id/name 保留最后一份。长任务会留下大量冗余 JSON；例如 Android report 有 487 份同一 execution 的 dump（约 55 MiB 可回收）。保留运行期 append 的非阻塞特性，但在结束、导出或上传前增加安全的 compact 步骤，并补长任务回归测试。
