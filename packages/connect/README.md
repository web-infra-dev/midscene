# @midscene/connect

Connect any screen to Midscene. Describe a device in one `.mjs` file, serve it
over HTTP, then drive it with the Agent SDK, the CLI, or the Playground.

English / [简体中文](./README.zh.md)

## 1. Define a device

One file describes one kind of device. `options` select a concrete instance.
Keys of `actions` that match a built-in primitive are plain functions; any other
key is a custom action.

```js
// car-screen.mjs
export default {
  name: 'Car Screen',
  description: 'In-car touchscreen driven by a robot arm', // added to aiAct context
  pointerType: 'touch', // required with `swipe`: 'touch' | 'mouse'
  options: {
    type: 'object',
    properties: { armId: { type: 'string' } },
    required: ['armId'],
  },
  async connect({ armId }) {
    const arm = await openArm(armId);
    return {
      screenshot: () => camera.jpeg(), // PNG/JPEG Buffer or base64
      actions: {
        tap: (p) => arm.tap(p.x, p.y),
        swipe: (from, to, opts) => arm.swipe(from, to, opts?.duration),
        homeButton: () => arm.pressHome(),
        wakeVoiceAssistant: {
          description: 'Wake up the voice assistant with a phrase',
          params: {
            type: 'object',
            properties: {
              phrase: { type: 'string' },
              button: { 'x-midscene-locate': true, description: 'The mic button' },
            },
            required: ['phrase'],
          },
          call: ({ phrase, button }) => arm.tapAndSay(button.center, phrase),
        },
      },
      destroy: () => arm.close(),
    };
  },
};
```

`import { defineDevice } from '@midscene/connect'` adds type hints, but you don't need it.

### Built-in primitives

The signatures match core's `InputPrimitives`. Coordinates are screenshot pixels.

| Group | Primitives | Rule |
| --- | --- | --- |
| Pointer | `tap`, `doubleClick`, `rightClick`, `middleClick`, `hover`, `longPress`, `dragAndDrop` | Every other pointer primitive needs `tap` |
| Swipe | `swipe`, `pinch` | `swipe` needs `pointerType`; `pinch` needs a touch `swipe` |
| Keyboard | `typeText`, `keyboardPress`, `clearInput`, `cursorMove` | The first three come together |
| Scroll | `scroll` | |
| System | `backButton`, `homeButton`, `recentAppsButton` | |

### Param schemas

Custom action `params` and device `options` use a small JSON Schema subset:
`string` (`enum`, `minLength`, `maxLength`), `number`/`integer` (`minimum`, `maximum`),
`boolean`, `array` (`items`, `minItems`, `maxItems`), `object` (`properties`, `required`),
and `description`. A top-level property marked `{ "x-midscene-locate": true }` is an element
that the AI locates. Your `call` receives `{ description, center, rect }`.
`serve` rejects any keyword outside this subset at startup. Request bodies are
validated strictly, so unknown keys fail.

## 2. Serve it

```sh
npx @midscene/connect serve ./car-screen.mjs --arm-id mg400-1
# ✔ Car Screen is ready
#   Connect URL: http://127.0.0.1:5820
#   API docs:    http://127.0.0.1:5820/api/docs/
```

Each `serve` process holds one device instance. Use `--port` to serve more devices.
On a non-loopback `--host`, the server requires a bearer token. Pass `--token`, or use the one
it generates and prints.

## 3. Drive it

```js
import { agentOverConnectProtocol } from '@midscene/connect';

const agent = await agentOverConnectProtocol({ url: 'http://127.0.0.1:5820' });
await agent.aiAct('Open the music app and search for "Jay Chou"');
await agent.aiAssert('Search results are visible');
```

```sh
export MIDSCENE_CONNECT_URL=http://127.0.0.1:5820   # or pass --url / --token
npx @midscene/connect act --prompt "Open the music app"
npx @midscene/connect tap --locate "the search box"
npx @midscene/connect wakevoiceassistant --phrase "hello"
npx @midscene/connect playground
```

The CLI builds its commands from the served device's action space.

## Embedding

To mount the protocol inside an existing Node server:

```js
import { createConnectHandler } from '@midscene/connect/server';

const handler = createConnectHandler({ name: 'Phone', screenshot, actions }, {
  basePath: '/devices/phone-1/api',
  token,
});
http.createServer((req, res) => handler.handle(req, res) || next(req, res));
// clients connect with url: http://host:port/devices/phone-1
```

## HTTP API

| Method | Path | |
| --- | --- | --- |
| GET | `/api/info` | Name, description, `pointerType`, primitives, custom actions |
| GET | `/api/screenshot` | `{ image: dataURL, width, height }` |
| GET | `/api/size` | `{ width, height }` |
| POST | `/api/primitives/{name}` | Run a primitive |
| POST | `/api/actions/{name}` | Run a custom action; returns `{ ok, result? }` |
| GET | `/api/openapi.json`, `/api/docs/` | OpenAPI spec and Swagger UI |

The server runs actions one at a time. Errors come back as `{ error, code }`.
