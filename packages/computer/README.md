# @midscene/computer

Midscene.js Computer Desktop Automation - AI-powered desktop automation for:

- local desktop control on Windows, macOS, and Linux
- remote Windows desktop control over the RDP protocol

See <https://midscenejs.com/computer-introduction.html>.

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
