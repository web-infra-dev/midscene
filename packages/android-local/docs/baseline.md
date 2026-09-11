# 性能基线（Phase 0 / Phase 1 起点）

**目标平台优先级：普通安卓手机**（车机约束在 Phase 3 再评估）。

| 项 | 值 |
| --- | --- |
| 设备 | Android 12 / SDK 31 / arm64-v8a / 2560×1600 / density 320 / 2 核模拟器（非手机硬件，仅作相对对比） |
| 运行时 | Termux `nodejs-lts` = Node **v24.18.0**（`process.platform=android`） |
| 权限通道 | rish（Shizuku 13.6.0 server，shell uid 2000） / adb（host 侧，shell uid 2000） |
| 采样 | 每项 5 次连续调用；AI 闭环跑 2 轮 |

## 1. 两个后端对比（同一台设备）

| 指标 | rish（设备本机） | adb（host / USB） | 说明 |
| --- | --- | --- | --- |
| 截图 P50 | **463–464 ms**（两次复测一致） | 1136 ms（806–1568） | rish 走设备本地文件通道，省掉 adb 传输；adb 用 `exec-out screencap -p` 直读 PNG |
| 截图 payload | 674 KB PNG | 120 KB PNG（屏幕内容不同） | 均为合法 PNG |
| 输入（keyevent） | 470 ms | **90 ms** | rish 每次调用新建 `app_process`；adb 复用长连接 |
| `healthCheck` | 130 ms（空载） | ~90 ms | rish 空载时 spawn 很快 |
| rish spawn 开销 | 130 ms（空载）→ 1.6–1.8 s（设备繁忙） | 不适用 | **负载对 rish 影响极大** |
| 动作空间 | 13 个动作 + `Launch`/`Terminate` | 同左（同一 `LocalAndroidDevice`） | 两后端行为一致 |

## 2. AI 端到端闭环（设备本机 Node + rish）

`startActivity(Settings)` → `aiAssert(Settings 已打开)` → `aiTap(Battery)` → `aiAssert(电池页面)`

| 轮次 | startActivity | aiAssert #1 | aiTap | aiAssert #2 | 总计 |
| --- | --- | --- | --- | --- | --- |
| 第 1 轮 | 4.2 s | 7.0 s | 4.0 s | 5.8 s | **21.9 s** |
| 第 2 轮 | 5.9 s | 18.5 s | 18.9 s | 12.1 s | **59.6 s** |

结论：**模型往返（4–19 s/步，波动大）是主要成本**；截图（0.46 s）已不是瓶颈。

## 3. 图像处理（wasm sharp，设备内）

| 操作 | 耗时 |
| --- | --- |
| `metadata` | 270 ms |
| `jpeg` 编码 | 710 ms（`@midscene/shared/img` 路径下 1365 ms） |
| `resize` | 280 ms（shared 路径 386 ms） |
| `extract`（crop） | 66 ms（shared 路径 56 ms） |
| `extend`（padding） | 338 ms（shared 路径 241 ms） |

## 3.5 Unicode（中文）输入通道

| 路径 | 耗时 | 说明 |
| --- | --- | --- |
| ASCII `input text` | ~470 ms | 走 rish，单次 spawn |
| 非 ASCII（yadb，含 CJK/emoji） | **9.95 s（首次）** | `app_process -Djava.class.path=<yadb> ... -keyboard '<text>'`，包含 ART 启动 + yadb 内部剪贴板粘贴；可用但偏慢 |

设备实测（Android 12）：Settings 搜索框成功输入 `中文输入测试 hello`，能力探测返回 `textInput: "full"`。

## 4. 优化线索（Phase 1/3）

1. **减少 rish spawn 次数**：每次 `input` 一次 spawn（470 ms）。可合并连续输入（例如 `input keyevent a b c` 已支持批量），或 Phase 2 用 Shizuku UserService 常驻连接。
2. **截图**：设备本机 463 ms 已可用；进一步优化走 UserService + FD/LocalSocket（消除文件通道）。
3. **模型往返**：控制图片尺寸（`screenshotShrinkFactor`）、减少每步的上下文、必要时用更快的模型；这是端到端时延的绝对大头。
4. **adb 后端**：输入快、截图慢，适合"PC + USB 手机"调试与回归；CI 里用它当参照实现。
5. **Unicode 输入**：yadb 每次输入都要启动一次 ART（约 10s）。Phase 2 可改为常驻 UserService / 专用 IME（广播式），把中文输入降到百毫秒级。

## 5. 复测方法

```bash
# rish 后端（设备本机）
adb push <android-local dist> /data/local/tmp/ && run-as com.termux sh /data/local/tmp/device-loop-run.sh

# adb 后端（host）
node -e "…AdbShellTransport…"   # 见 Phase 0 探针脚本
```

复测要求：同一台设备、同一屏幕内容、空载重启后各测 3 轮取 P50，并记录设备负载（`uptime`）。
