# @midscene/android-local

Android device control for a Midscene agent running on the device. The package
provides a `LocalAndroidDevice`, a transport for commands executed with shell
privileges, an ADB transport for development, and a YAML-driven runner. It is
currently private and is bundled into the [Android host app](../../apps/android-host/README.md).

The host app runs Node inside the APK and obtains shell access through either a
Shizuku UserService or the device's wireless-debugging `adbd`. Neither path
requires a PC during a run. Initial provisioning still needs a Node runtime and
an ADB client; see the host app's build instructions. The ADB transport in this
package also supports a PC connected to a device for debugging.

## Use the device API

```ts
import { Agent } from '@midscene/core/agent';
import {
  AdbShellTransport,
  LocalAndroidDevice,
} from '@midscene/android-local';

const transport = new AdbShellTransport({ serial: 'emulator-5554' });
const device = await LocalAndroidDevice.create(transport, { displayId: 0 });

try {
  const agent = new Agent(device, { generateReport: false });
  await agent.aiAct('open Settings');
} finally {
  await transport.close();
}
```

For the on-device channel, the host app supplies an `ExecBridgeCommandRunner`
and file I/O to `ShellTransport`. The transport does not start or authorize
Shizuku itself. Unsupported operations raise `AndroidTransportError` with a
machine-readable code.

## Run a config

```bash
midscene-local doctor --backend adb-shell --serial <device-id>
midscene-local run examples/local-agent.config.yaml
```

The host app invokes the same runner with its own bridge settings. Keep model
credentials in the environment or the host app's private credential file, not
in a checked-in YAML config. See the [host app guide](../../apps/android-host/README.md)
for the on-device setup.

## Validate

```bash
pnpm exec nx test @midscene/android-local
pnpm exec nx build @midscene/android-local
```

The unit tests use fake command runners and do not require a device. A full APK
build and its Android unit tests are documented in the
[host app README](../../apps/android-host/README.md).
