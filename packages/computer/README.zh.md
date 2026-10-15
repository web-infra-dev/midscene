
### 独立原生区域计时

`RegionObservation.start({ command, args, geometry, maxFrames })` 提供有界、无模型的
测量通道，与 Agent 截图独立。helper 参数使用
`--region x,y,width,height --verify-monotonic`；`geometry` 包含输出内逻辑坐标
x/y/width/height、outputIndex、整数 scale、物理像素 outputWidth/Height 和
transform: 0。调用方仍须核实合成器的时钟映射。旋转、裁切越界或小数缩放不受支持，
出现时拒绝继续测量。

`frames()` 将独立 PNG 字节、不可变 geometry、frameId 和源时间一起返回。
在 `finally` 中调用 `await stop()`，停止后仍可读取已交付证据。帧序号缺失、
geometry/时钟变化、意外 EOF 或容量溢出都会拒绝计时判断，停止后也不例外。
使用有界窗口与足够 maxFrames，不会静默抽帧。本接口不能作为 Agent DeviceFrameSource；
全屏入口拒绝 ROI 记录。区域采样仍不能证明物理显示时间或定位相邻帧之间的状态变化；
跨阈值区间仍为无法判定。应另存全屏截图提供上下文。
