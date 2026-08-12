# Android WebView first-tap reproduction

This fixture models [issue #2927](https://github.com/web-infra-dev/midscene/issues/2927): after deeplink navigation, a zero-distance 150 ms ADB swipe may not register as the first tap, while a second attempt succeeds.

The APK has two modes:

- `deterministic` deliberately models the affected WebView state. The first gesture containing an Android `ACTION_MOVE` is swallowed. This makes the old `input swipe x y x y 150` fail once and the native `input tap x y` succeed immediately on every device.
- `natural` does not swallow input. Use it on the affected Android 16/cloud-device environment to check whether the platform reproduces the behavior by itself.

This distinction matters: deterministic mode is a regression harness for the input semantics, not proof that every Android WebView has the OEM/cloud-device bug.

## Prerequisites

- A macOS or Linux host
- JDK 17 (`JAVA_HOME` must point to it)
- Android SDK with one installed platform and one installed build-tools version
- An ADB-connected Android device

The fixture uses `aapt2`, `javac`, `d8`, `zipalign`, and `apksigner` directly, so Gradle and Android Studio are not required.

To use an APK that is already built, pass `--apk <path>`. Supplying this option disables the build step. Use `--no-install` only when `io.midscene.taprepro` is already installed on the selected device.

## Run

From the repository root:

```bash
pnpm --filter @midscene/android repro:webview-tap -- \
  --device-id <adb-device-id> \
  --mode deterministic \
  --iterations 3
```

To probe the device without the deterministic guard:

```bash
pnpm --filter @midscene/android repro:webview-tap -- \
  --device-id <adb-device-id> \
  --mode natural \
  --iterations 10
```

The runner builds and installs the APK, opens it through the `midscene-tap-repro://open` deeplink, and compares:

1. legacy `input swipe x y x y 150` (two attempts), and
2. the current local `AndroidDevice.pointer.tap` implementation (one attempt).

Screenshots and `result.json` are saved under `.temp/results/`.

## 中文说明

这个 fixture 用来模拟 issue #2927 的关键输入差异：deeplink 导航后，旧版同点 `swipe` 会产生 `ACTION_MOVE`，在受影响的 WebView 状态下第一次可能被吞掉；原生 `tap` 只有 DOWN/UP，第一次即可生效。

- `deterministic` 模式会主动模拟该脆弱状态，适合稳定回归测试。
- `natural` 模式不注入任何吞手势逻辑，适合拿到原 Android 16 云机和 WebView 环境后验证系统是否自然复现。

因此，`deterministic` 的通过只能证明修复覆盖了输入语义差异，不能替代原 Samsung Android 16 / 网络 ADB 环境的真机结论。
