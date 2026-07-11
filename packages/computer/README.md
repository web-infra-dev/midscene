# @midscene/computer

Midscene.js Computer Desktop Automation - AI-powered desktop automation for:

- local desktop control on Windows, macOS, and Linux
- remote Windows desktop control over the RDP protocol

See <https://midscenejs.com/computer-introduction.html>.

## Native element location cache

Local desktop agents can generate and replay XPath-based element location cache entries from platform accessibility trees:

- macOS uses the Accessibility tree and requires Accessibility permission.
- Windows uses the active local window's UI Automation tree. No extra dependency is required for ordinary apps; current cache-coordinate validation covers 100% display scaling.
- Linux uses AT-SPI and requires Python GI, the AT-SPI 2.0 typelib, a session D-Bus and accessibility bus, and an active or focused target application.

Install the Linux tree-reading dependencies with one of these commands:

```bash
# Debian / Ubuntu
sudo apt-get install -y at-spi2-core gir1.2-atspi-2.0 python3-gi

# Fedora
sudo dnf install -y at-spi2-core python3-gobject
```

The RDP agent only receives screenshots and sends remote input. It does not expose the remote Windows UI Automation tree, so native XPath cache replay is not available over RDP.

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
