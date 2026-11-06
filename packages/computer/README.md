# @midscene/computer

Desktop automation library for Midscene, providing AI-powered testing and automation capabilities for Windows, macOS, and Linux, with RDP support for remote Windows desktops.

See <https://midscenejs.com/platforms/desktop>.

## Remote native desktop bridge

`midscene-computer-bridge` exposes the existing native `ComputerDevice` over an authenticated WebSocket connection. Run it in the **target computer's interactive login session**. The controller runs `ComputerAgent`, model requests, workflows and reports; the target needs only this thin Device service. This is particularly useful for remote macOS desktops. Existing `agentForComputer` and `agentForRDPComputer` remain available.

On the target Mac, install `@midscene/computer`, grant Screen Recording and Accessibility permissions to the process running it, and inject a random shared secret (at least 16 characters) into `MIDSCENE_COMPUTER_BRIDGE_TOKEN` through your resource manager. Start the service:

```sh
midscene-computer-bridge --target-id allocated-mac
```

It binds `127.0.0.1:8766` by default. Expose it through a protected tunnel or a TLS/authenticated network boundary. For example, on the controller:

```sh
ssh -N -L 8766:127.0.0.1:8766 user@target-mac
```

Inject the same secret into the controller environment, alongside the usual Midscene model configuration:

```ts
import { agentForRemoteComputer } from '@midscene/computer';

const agent = await agentForRemoteComputer({
  url: 'ws://127.0.0.1:8766', // tunnel to the target Mac, not the controller desktop
  token: process.env.MIDSCENE_COMPUTER_BRIDGE_TOKEN!,
  expectedOS: 'macos',
});
try {
  await agent.aiAct('Open the prepared application');
  await agent.aiAssert('The application is visible');
} finally {
  await agent.destroy();
}
```

For Project setup, use `RemoteComputerDevice`, `await device.connect()`, then `new ComputerAgent(device, agentOptions)`. Register cleanup before connecting and destroy the Agent and Device at teardown. `device.connectionInfo` reports the actual target OS, resource identifier, service session, display and geometry; `expectedOS` checks this handshake. Display coordinates and DPR come from the target. The token is sent only in the handshake, never in URLs, Device serialization or Agent options. Custom actions remain on the controller.

The protocol forwards screenshots, size and native input primitives only. Requests run in order; input errors are returned, and a timeout or transport failure terminates the connection **without replaying actions**. Disconnect waits for native Device cleanup; heartbeats detect lost controllers. Resource allocation and exclusive ownership of each desktop/session belong to the caller. The service does not create login sessions, install apps, run shell commands or start a full test Worker. Prepare Linux X11/xrdp or Windows RDP separately when using the existing RDP transport.
