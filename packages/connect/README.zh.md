# @midscene/connect

把任意屏幕接入 Midscene：用一个 `.mjs` 文件描述设备，通过 HTTP 启动服务，然后就能用 Agent SDK、CLI 或 Playground 操作它。

[English](./README.md) / 简体中文

## 1. 定义设备

一个文件描述一类设备，`options` 用于选择具体实例。`actions` 里的键如果和内置原语同名，就直接写函数；其他键都是自定义动作。

```js
// car-screen.mjs
export default {
  name: 'Car Screen',
  description: 'In-car touchscreen driven by a robot arm', // 会加入 aiAct 上下文
  pointerType: 'touch', // 提供 swipe 时必填：'touch' | 'mouse'
  options: {
    type: 'object',
    properties: { armId: { type: 'string' } },
    required: ['armId'],
  },
  async connect({ armId }) {
    const arm = await openArm(armId);
    return {
      screenshot: () => camera.jpeg(), // PNG/JPEG Buffer 或 base64
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

`import { defineDevice } from '@midscene/connect'` 可以带来类型提示，但不是必需的。

### 内置原语

签名与 core 的 `InputPrimitives` 一致，坐标单位为截图像素。

| 分组 | 原语 | 约束 |
| --- | --- | --- |
| 指针 | `tap`、`doubleClick`、`rightClick`、`middleClick`、`hover`、`longPress`、`dragAndDrop` | 其他指针原语都需要同时提供 `tap` |
| 滑动 | `swipe`、`pinch` | `swipe` 需要设置 `pointerType`；`pinch` 需要触摸方式的 `swipe` |
| 键盘 | `typeText`、`keyboardPress`、`clearInput`、`cursorMove` | 前三个必须一起提供 |
| 滚动 | `scroll` | |
| 系统 | `backButton`、`homeButton`、`recentAppsButton` | |

### 参数 Schema

自定义动作的 `params` 和设备的 `options` 使用一个精简的 JSON Schema 子集：`string`（`enum`、`minLength`、`maxLength`）、`number`/`integer`（`minimum`、`maximum`）、`boolean`、`array`（`items`、`minItems`、`maxItems`）、`object`（`properties`、`required`），以及 `description`。顶层属性标记 `{ "x-midscene-locate": true }` 表示这是一个由 AI 定位的元素，`call` 收到的是 `{ description, center, rect }`。`serve` 启动时会拒绝子集之外的关键字；请求体也会严格校验，出现未知字段即报错。

## 2. 启动服务

```sh
npx @midscene/connect serve ./car-screen.mjs --arm-id mg400-1
# ✔ Car Screen is ready
#   Connect URL: http://127.0.0.1:5820
#   API docs:    http://127.0.0.1:5820/api/docs/
```

每个 `serve` 进程持有一台设备实例，要接多台设备就用 `--port` 起多个服务。`--host` 不是本机回环地址时，服务端要求携带 bearer token：可以用 `--token` 指定，否则会自动生成并打印出来。

## 3. 操作设备

```js
import { agentOverConnectProtocol } from '@midscene/connect';

const agent = await agentOverConnectProtocol({ url: 'http://127.0.0.1:5820' });
await agent.aiAct('打开音乐 App，搜索“周杰伦”');
await agent.aiAssert('搜索结果已显示');
```

```sh
export MIDSCENE_CONNECT_URL=http://127.0.0.1:5820   # 也可以用 --url / --token
npx @midscene/connect act --prompt "打开音乐 App"
npx @midscene/connect tap --locate "搜索框"
npx @midscene/connect wakevoiceassistant --phrase "你好"
npx @midscene/connect playground
```

CLI 的命令是根据所连设备的 action space 生成的。

## 嵌入已有服务

在已有的 Node 服务里挂载该协议：

```js
import { createConnectHandler } from '@midscene/connect/server';

const handler = createConnectHandler({ name: 'Phone', screenshot, actions }, {
  basePath: '/devices/phone-1/api',
  token,
});
http.createServer((req, res) => handler.handle(req, res) || next(req, res));
// 客户端使用 url: http://host:port/devices/phone-1
```

## HTTP API

| 方法 | 路径 | |
| --- | --- | --- |
| GET | `/api/info` | 名称、描述、`pointerType`、原语、自定义动作 |
| GET | `/api/screenshot` | `{ image: dataURL, width, height }` |
| GET | `/api/size` | `{ width, height }` |
| POST | `/api/primitives/{name}` | 执行原语 |
| POST | `/api/actions/{name}` | 执行自定义动作，返回 `{ ok, result? }` |
| GET | `/api/openapi.json`、`/api/docs/` | OpenAPI 规范和 Swagger UI |

服务端一次只执行一个动作，出错时返回 `{ error, code }`。
