# 强制停止 / Force stop

主页面共用顶栏中的红色停止图标始终可用，不依赖任务的 busy 标记。
确认后结束当前 Host 运行时并关闭应用，需要手动重新打开。

- 不清除配置，不停止目标应用，不重启 Shizuku server。
- 首先封闭新 Node / shell 命令入口；关闭 Host 自有 Node 子进程、
  UserService 及其可识别的后代进程。只按父子关系定位，不按 UID 或包名批量杀进程。
- 停止 started service，避免 START_STICKY 自动拉起；取消完成后返回控制台的行为。
- 清理不依赖任务工作线程；独立看门狗在 2.5 秒后强制结束 Host。
- 未完成报告可能丢失。若整个 UI 主线程 ANR，按钮也无法点击，仍需系统强行停止。
  若远程服务不响应，Host 的看门狗只能保证结束自身，不能保证远端清理完成。
  不承诺终止主动脱离父进程树的后台守护进程。

2026-09-13 华为车机实测：120 秒纯等待任务运行期间，从 UI 点击按钮确认。
Host、Node 和 Midscene UserService 随后全部退出，ActivityManager 无残留服务；
Shizuku server PID 18703 保持不变。测试没有调用模型或控制目标应用。

验证：`pnpm exec nx test android-host`、`pnpm run lint`、
`cd apps/android-host && ./gradlew :app:assembleDebug :app:testDebugUnitTest`。

## English

The shared toolbar always exposes a red Force stop button, including when task
state is stale. Confirmation closes the Host and terminates its runtime. Reopen
the app manually afterward. Configuration, target apps and the Shizuku server
are preserved; an unfinished report may be lost.

New process/command starts are gated, descendant processes are identified by
parent relationships, and started-service ownership is removed to prevent an
automatic restart. A separate 2.5-second watchdog bounds Host shutdown. An
unresponsive remote service may outlive this local deadline; detached daemons
are outside descendant-tree cleanup. A frozen UI still requires the system's
force-stop control.

Verified on the Huawei head unit during a no-model, no-device-action wait task:
the UI confirmation removed Host, Node, UserService and its registered Android
service, while the Shizuku server remained running.
