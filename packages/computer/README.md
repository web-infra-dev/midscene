# @midscene/computer

Midscene.js Computer Desktop Automation - AI-powered desktop automation for:

- local desktop control on Windows, macOS, and Linux
- remote Windows desktop control over the RDP protocol

See <https://midscenejs.com/computer-introduction.html>.

## RDP support

Use `agentFromComputer()` with a remote target:

```ts
import { agentFromComputer } from '@midscene/computer';

const agent = await agentFromComputer({
  remote: {
    type: 'rdp',
    host: '10.0.0.10',
    username: 'Admin',
    password: 'secret',
    ignoreCertificate: true,
  },
});
```

Build native helpers locally:

```bash
pnpm --filter @midscene/computer run build:native
```

Run RDP AI tests:

```bash
pnpm --filter @midscene/computer run test:ai:rdp
```
