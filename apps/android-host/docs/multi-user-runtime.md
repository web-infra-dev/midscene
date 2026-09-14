# Multi-user runtime / 多用户运行时

## 结论与边界

2026-09-13 华为车机实测：前台用户 11，Host 仅安装在用户 11，Shizuku
以 shell UID 2000（属于用户 0）运行。UserService 在 `LoadedApk.makeApplication`
阶段失败，异常为 `Unable to get package info ... is package not installed?`。
将同一 Host APK 登记到用户 0 后，UserService 成功绑定并返回 UID 2000。
随后发现 shell 读取 `/storage/emulated/11/Android/data/.../yadb` 被拒绝。
这是两个独立问题，增加等待时间不能解决它们。

- 只保留 Shizuku UserService，不恢复 rish、不回退 root、不关闭 SELinux。
- 用户 0 包登记属于部署范围变更，必须显式执行。Host 不自行安装或授权。
  不切换前台用户，不迁移用户 11 的数据，不在用户 0 运行 Agent。
- yadb 的小型资产经有大小上限的 Binder 参数传递，由 shell 原子替换固定目标
  `/data/local/tmp/yadb`，最终设为只读。无需读取其他用户的共享存储。
- 大载荷由 shell 写入 `/data/local/tmp/midscene-android/u<userId>`；父目录为
  shell-only `0700`。通过可靠管道传回，Binder 只传文件描述符，不承载整张截图。
  HTTP 桥仍只监听 loopback，要求进程级 token；文件读取限定当前调用用户的通道，
  校验规范路径和大小（20 MiB），传输有期限及队列上限。
- 安装任一步失败即报告失败，不写成功凭据。最后执行无需模型调用的 `doctor`
  验证 Node → HTTP → Binder → shell → 截图回传。成功凭据表示安装验证通过，
  运行前仍须检查 Shizuku 当前绑定状态。

## 部署与恢复

先用设备适配的安装器安装到当前前台用户。华为车机继续使用已提供的
`huawei-apk-installer/install-apk.sh --huawei --serial <id> --user <userId> ...`。
不要用卸载重装来解决这类问题。

在 `apps/android-host` 下执行：

```bash
# 只读检查；缺少条件则失败，不偷偷修复。
bash scripts/check-multi-user.sh --serial <device-id>

# 确认需要这个多用户兼容步骤后，显式为用户 0 登记现有 Host 包。
bash scripts/check-multi-user.sh --serial <device-id> --register-owner
```

脚本不会安装 Shizuku、启动 server、改授权、加电池白名单或重启设备。
如果 Shizuku 在用户 0 缺失，应通过已批准的部署方式单独处理。
完成后，在当前用户的 Host 中重新执行 **Install Agent Runtime**。
只有日志出现 `runtime ready: ...` 且没有本轮失败，才算验证完成。

旧 YAML 的 `device.fileChannelDir` 若仍指向 `/storage/emulated/...`，需要显式改为
`/data/local/tmp/midscene-android/u<userId>`；不要覆盖用户已有模型配置。
新建 Prompt/Self-check 配置与 `doctor` 会采用新路径。

不要对所有 `peek=-1` 都套用这个修复：先看 `ShizukuServiceStarter` 的实际栈。
当前方案不宣称覆盖所有 OEM ROM；如果系统禁止用户 0 包登记，停止并报告不支持，
不再自动寻找越权途径。

## English summary

On the tested Huawei head unit (Android 12, foreground user 11), UserService failed
while constructing `Application` because the Host package was absent for user 0.
Explicitly registering the existing APK for user 0 restored a shell-UID binding.
A second failure came from shell being unable to read user 11's emulated storage.

The Host retains one privilege backend: Shizuku UserService running as UID 2000.
Owner-user registration is an explicit deployment decision, never an automatic
in-app action. No root fallback, permission grant, user switch or data migration
is part of the repair. The checker is read-only unless `--register-owner` is given;
it registers only the Host, not Shizuku.

The bounded yadb asset is sent through Binder and atomically installed read-only.
Large shell-owned payloads stream through reliable descriptor pipes, avoiding
both Binder's transaction-size limit and cross-user FUSE access. The authenticated
loopback bridge and service validate channel containment for the caller's user.
Transfers have size, time and queue limits; the parent directory is shell-only.

Provisioning fails closed and writes its receipt only after a no-model `doctor`
checks the actual Node/HTTP/Binder/shell/screenshot path. A receipt is installation
evidence, not a replacement for live Shizuku readiness. Existing YAML files using
external-storage channels must explicitly select the new per-user path. Do not
overwrite model settings or treat every `peek=-1` as this specific failure.

## 本次验证 / Validation

- `pnpm exec nx test android-host`：49 项 JVM 单测 + 7 项部署脚本测试。
- `pnpm run lint` 与 `git diff --check`。
- `cd apps/android-host && ./gradlew :app:assembleDebug :app:testDebugUnitTest`。
- 华为专用 HDB 安装器覆盖安装，用户 11 数据保留；未重装或重启 Shizuku。
- 实机 UserService UID 2000，yadb 14,431 字节、权限 `0444`。
- 实机通过 2,097,152 字节管道校验，以及 Node `doctor` 的真实截图回传。
- 22:58:57 首次完整验证、22:59:37 Host 强制停止后重新启动验证均成功；
  后者截图 140,654 字节、642 ms。Shizuku server 未重启，UserService 正常销毁重建，
  旧版本遗留的单个 Midscene 服务进程已停止。
- Android 12 的 `URLDecoder.decode(String, Charset)` 不可用，已改为受支持的
  charset-name 重载，并通过实机截图路径验证。
- Additional Android `:app:lintDebug` was attempted but dependency downloads
  failed with a TLS handshake error (Google Maven / Maven Central). It is not
  counted as passed. No model-driven tap, typing or vehicle-control task was run.

## References

- [Android 12 LoadedApk: initializeJavaContextClassLoader uses UserHandle.myUserId](https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/android-12.0.0_r1/core/java/android/app/LoadedApk.java)
- [Shizuku UserService bootstrap](https://raw.githubusercontent.com/RikkaApps/Shizuku-API/master/server-shared/src/main/java/rikka/shizuku/server/UserService.java)
- [Android ParcelFileDescriptor: reliable pipes and error propagation](https://developer.android.com/reference/android/os/ParcelFileDescriptor)
