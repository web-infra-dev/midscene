# @midscene/computer

Midscene.js Computer Desktop Automation - AI-powered desktop automation for:

- local desktop control on Windows, macOS, and Linux
- remote Windows desktop control over the RDP protocol

See <https://midscenejs.com/platforms/desktop>.

## VNC keyboard input on macOS

When Midscene runs on macOS and controls a foreground VNC client, enable
physical keyboard events so modifier keys are sent as explicit key-down and
key-up transitions. Text must also use sequential input; a positive
`keyboardTypeDelay` enables that behavior in the default `legacy` input mode:

```ts
import { agentForComputer } from '@midscene/computer';

const agent = await agentForComputer({
  keyboardEventMode: 'physical',
  keyboardTypeDelay: 80,
});
```

The default `keyboardEventMode: 'logical'` keeps the standard AppleScript
behavior for non-VNC applications. This option is ignored outside macOS and
when `keyboardDriver` is set to `libnut`.

Use `physical` only for a VNC client with matching en-US keyboard layouts. Its
shifted-punctuation mapping is not layout-independent, and native macOS apps
may interpret the base key directly—for example, `!@#` can become `123`.

## RDP support

Use `agentForRDPComputer()`:

```ts
import { agentForRDPComputer } from '@midscene/computer';

const agent = await agentForRDPComputer({
  host: '10.0.0.10',
  username: 'Admin',
  password: 'secret',
  ignoreCertificate: true,
});
```

When the machine running Midscene has multiple outbound routes, pass
`localAddress` to bind the RDP TCP connection to a specific local source IP:

```ts
const agent = await agentForRDPComputer({
  host: '10.0.0.10',
  username: 'Admin',
  password: 'secret',
  localAddress: '10.0.0.20',
  ignoreCertificate: true,
});
```

RDP usage requires:

- a reachable Windows machine with RDP enabled
- [FreeRDP](https://www.freerdp.com/) installed on the machine running your script

If you need to rebuild the native helper locally from source:

```bash
pnpm --filter @midscene/computer run build:native
```

Run RDP AI tests:

```bash
pnpm --filter @midscene/computer run test:ai:rdp
```
