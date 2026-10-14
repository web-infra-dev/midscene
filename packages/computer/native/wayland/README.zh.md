# 可选的 Wayland 观察帧源

此程序通过 wlr-screencopy v3 采集真实合成器像素，不注入按键。显式构建需要 C 编译器、`wayland-scanner` 以及 `wayland-client`、`libpng` 开发包：

```sh
sh packages/computer/native/wayland/build.sh /tmp/midscene-wayland
```

程序应运行在被测桌面会话内；测试虚拟机时，应在客户机内部运行。用 `ObservationFrameSource.start({command, args})` 接收标准输出，将每次新建帧源的工厂作为 Computer Agent 的 `observationFrameSource`，再调用 `startObserving({captureMode: 'source', maxFrames: 600})`。默认采样行为不变。源图像尺寸必须与 Agent 桌面一致，不要将局部裁剪帧用于 Agent 断言。

`ready` 是合成器帧时间，不是显示器物理呈现时间，也不是 PNG 编码完成时间。Hyprland 0.56.2 在渲染提交回调记录该时间。默认使用独立的会话时钟域。`--verify-monotonic` 表示调用方已核实合成器使用 Linux CLOCK_MONOTONIC；程序还会逐帧检查源时间是否位于请求与收到 ready 之间。只有核实合成器实现后才能启用。此时使用客户机 boot ID 标识时钟域，并保留 ±1 微秒数值转换余量，不猜测主客机时钟偏移。

每行 NDJSON 绑定帧身份、PNG、尺寸和时间。编码及传输背压期间会暂停采集，因此不保证帧率，应检查真实相邻帧间隔。缓冲区溢出计入 `droppedFrames`，source 模式不静默抽帧。`observer.recordEvent({name, timing})` 记录独立测量的输入事件范围。`observation.exportRecord()` 保留全部已收集帧，不受 AI 最多选择八张证据图的限制。dispose 前应复制记录及图像。

对 500ms 要求，应比较同一已验证时钟域中的输入事件与旧/新像素边界：上界 ≤500ms 才通过，下界 >500ms 才失败，其余无法判定。解读结果前明确按下、完整按键或释放的计时语义。编码、传输、模型响应的延迟不能充当截图时间。基线缺失、异常间隔、丢帧或时钟域不匹配均须审查；平均帧率不能证明完整覆盖。

编码默认使用无损 PNG filter NONE，避免自适应滤波搜索延迟；`--png-filter adaptive` 可用于受控基线对照。`--trace` 在标准错误输出逐帧 source/request/ready/encoded/emitted 纳秒值与字节数，以 frameId 关联；应限制诊断运行时长，并与 NDJSON 标准输出分开保存。±1微秒只覆盖数值转换，不是采样间隔、调度、复制过程、时钟同步或物理呈现的误差上界；仍须检查合成器源码及同一guest时钟。

`benchmark-encoder.c` 直接包含实际编码器，可进行无模型调用的本地测量。用与 `build.sh` 相同的协议生成源码、头文件和库编译；参数为 `BGRA_FILE WIDTH HEIGHT STRIDE ADAPTIVE_FILTER OUTPUT_PNG`。预热五次后输出100行耗时纳秒/PNG字节数CSV，应解码PNG并逐像素比较RGB。这不是guest帧率测试。trace对同一frameId可能包含初始和完成两条记录；合并时保留已完成记录的emittedNs。
