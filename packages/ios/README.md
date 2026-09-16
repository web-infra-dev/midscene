# @midscene/ios

iOS automation library for Midscene, providing AI-powered testing and automation capabilities for iOS simulators and devices.

See <https://midscenejs.com/platforms/ios>.

## Accessibility tree (experimental)

`IOSDevice.getUITree()` captures the accessibility tree from WDA's
`/source?format=json` endpoint and prunes it into Midscene's `UiNode`
format. It is opt-in and not yet consumed by the agent loop.

```ts
const device = new IOSDevice({
  axTree: {
    cache: { enabled: true }, // serve repeated getUITree() calls from cache,
                              // invalidated after every UI-mutating action
    maxDepth: 30,             // pruning depth (default 30)
    includeInvisible: false,  // keep invisible nodes (default: prune leaves)
  },
});
await device.connect();
const snapshot = await device.getUITree(); // { platform: 'ios', capturedAt, root }
```

Benchmark against a booted simulator with WebDriverAgent running:

```bash
pnpm --filter @midscene/ios benchmark:ax-tree
```
