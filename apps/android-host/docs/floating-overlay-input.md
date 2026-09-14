# 浮层与输入 / Floating overlay and input

## 结论与边界

2026-09-13 华为车机（Android 12 / API 31，前台用户 11）实测：全局浮层
（`OverlayView`）会把**别的应用的窗口**上的点击全部丢掉，而车机 dock、导航栏
（层级高于浮层的系统窗口）和 Host 自己的控制台（同 UID）始终可点。Android 12
起，输入分发会把"不受信任的窗口"按 alpha 累加出不透明度，超过
`maximum_obscuring_opacity_for_touch`（平台默认 0.8）时直接丢弃落在其下方窗口的
触摸。`FLAG_NOT_TOUCHABLE` 只是"我不接收事件"，**不等于"事件可以穿过我"**，
也不豁免这条检查。

窗口 alpha 因此不是样式选择，而是安全控制项：`OverlayView.obscuringSafeAlpha`
按设备实际阈值反解出 alpha，保证累加值留在阈值之下。默认 0.8 时 alpha ≈ 0.51。
代价是浮层整体半透明，不再是全不透明。

边界：只要浮层保持**全屏 + 全不透明 + 覆盖别的应用**，在 Android 12+ 上没有任何
第三方应用侧的配置能同时满足"看得清"和"点得动"，这是该安全特性的设计结果。
要恢复不透明度只能动设计（缩小窗口 frame、或改成受信任的窗口类型）。

## 实测证据

- 复现：浮层打开时 `adb shell input tap` 点到启动器应用中心里的图标无效；浮层
  关闭时同一点位正常打开应用。dock 上的按钮两种情况都正常。
- 归因：`settings put global block_untrusted_touches 0` 后同一点位恢复；改回默认
  再次失效。说明就是 Android 12 的不受信任触摸拦截，而不是 EMUI 自己的蒙层。
- `dumpsys input` 中本应用窗口 `trustedOverlay=false`、
  `touchOcclusionMode=USE_OPACITY`（`TYPE_APPLICATION_OVERLAY` 属于 system alert
  window，按 alpha 计算），frame 为 `[0,0][2560,1440]`。
- 被否定的猜想：窗口并没有携带 `FLAG_WATCH_OUTSIDE_TOUCH`（加不加白名单都没有）；
  加回 `FLAG_NOT_TOUCH_MODAL` 也不影响结果；启动器的
  `LauncherSmartDockFullScreenMaskWindow` 全程是 `GONE`。
- 累加窗口数：把 `maximum_obscuring_opacity_for_touch` 二分，阈值 0.90 仍被拦、
  0.94 放行，即有效不透明度 ≈ 0.9375 = `1 - (1 - 0.75)^2` —— 参与累加的是**两个**
  窗口：浮层窗口本身，以及 `SurfaceView` 为自身 surface 注册的子窗口。只调父窗口
  alpha 会看起来"完全没效果"。

## 修改

- `OverlayView.applyTouchTransparency`：显式白名单设置
  `NOT_TOUCHABLE | NOT_FOCUSABLE | NOT_TOUCH_MODAL`，清掉
  `WATCH_OUTSIDE_TOUCH / SPLIT_TOUCH`，并按 `safeAlpha` 设置窗口 alpha；每次
  `updateViewLayout` 前重新断言。
- `OverlayView.obscuringSafeAlpha(threshold, windows)`：解
  `1 - (1 - a)^n = threshold * (1 - headroom)`，纯函数，有单测。安全性优先于可读性：
  设备阈值极低时宁可变淡，也不能挡住点击。
- 设置页的 "Floating progress" 开关会持久化，并在每次运行前重新读取，作为现场
  逃生口保留。

验证：`cd apps/android-host && ./gradlew :app:assembleDebug :app:testDebugUnitTest`，
再用华为安装脚本装机复测：浮层打开时点击其他应用图标可正常启动
（`dumpsys input` 中 `alpha=0.51`）。

## 可以买回不透明度的后续项

1. 去掉 `SurfaceView`（改为在窗口自身 surface 上 `onDraw`，用已经在用的
   `HiddenApiBypass` 从 `ViewRootImpl` 取 `SurfaceControl` 继续
   `setSkipScreenshot`）。累加窗口从 2 降到 1，alpha 可从 ≈0.51 提到 ≈0.76；
   同时能省掉当前全屏 25fps 软件绘制的开销（实测约占一个核 41%）。
   失败时仍有既有的 plan A（截图期间隐藏）兜底。
2. 缩小窗口 frame，放弃贴屏幕物理边缘的光束——框架按 frame 判定遮挡，这是唯一
   能保住全不透明的做法。
3. `TYPE_ACCESSIBILITY_OVERLAY` 属于受信任类型可完全豁免，但需要无障碍服务与用户
   授权，产品形态代价大。

## English

On the tested Huawei head unit the floating layer silently dropped taps aimed at
*other apps'* windows, while the car dock, the navigation bar and the host's own
console kept working. Since Android 12 the input dispatcher accumulates an
obscuring opacity over untrusted windows and discards touches bound for windows
below once it exceeds `maximum_obscuring_opacity_for_touch` (0.8 by default).
`FLAG_NOT_TOUCHABLE` removes a window from hit-testing but does not exempt it from
that check, so the window alpha is a safety control, not styling: it is derived
from the device threshold and yields ~0.51 by default. Two windows accumulate —
the layer and the child window `SurfaceView` registers — which is why lowering only
the parent alpha appeared to do nothing. Measured: the threshold bisection flips
between 0.90 and 0.94, i.e. `1 - (1 - 0.75)^2`. Setting
`block_untrusted_touches 0` restored the taps, which pins the cause to the platform
feature rather than to an OEM mask. A full-screen, fully opaque overlay covering
another app cannot be both legible and tappable-through on Android 12+ from a
third-party app; recovering opacity requires a design change (drop the SurfaceView
child window, or shrink the window frame).
