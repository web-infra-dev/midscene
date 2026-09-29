# 常见问题 FAQ

## 各平台常见问题

以下平台的常见问题已整合到各自的文档中：

- [Web 浏览器 - Playwright](./integrate-with-playwright#faq)
- [Web 浏览器 - Puppeteer](./integrate-with-puppeteer#faq)
- [Web 浏览器 - Chrome 插件](./quick-start#chrome-extension-faq)
- [Web 浏览器 - 桥接模式](./bridge-mode#faq)
- [Android](./platforms/android#常见问题)
- [iOS](./platforms/ios#常见问题)
- [HarmonyOS](./platforms/harmonyos#常见问题)
- [PC 桌面](./platforms/desktop#常见问题)

## 操作 VNC 等桌面客户端时，为什么会丢失大写字母或修饰键？ {#keyboard-input-through-desktop-clients}

使用 `@midscene/computer` 操作 VNC、TeamViewer 或虚拟机控制台时，部分客户端可能无法完整识别键盘事件。常见现象包括：大写 `K` 变成 `k`、`!` 变成 `1`，或者 `Control+S` 只输入了 `s`。

遇到这些问题时，可以增加修饰键事件的间隔。下面是一组已经在 Windows VNC 全屏模式下验证过的配置。

```typescript
import { agentForComputer } from '@midscene/computer';

const agent = await agentForComputer({
  inputStrategy: 'sequential',
  keyboardTypeDelay: 120,
  keyboardModifierDelay: 100,
  keyboardLayout: 'en-US',
});
```

其中，`keyboardModifierDelay` 是解决修饰键丢失问题的主要配置。建议从 `100` 开始测试。确认输入正常后，可以逐步减小这个数值。

### 为什么增加间隔可以解决问题？

大写字母、特殊字符和组合键都依赖修饰键。

例如：

- 大写 `K` 需要按下 `Shift`，再按下 `K`。
- en-US 键盘布局中的 `!` 需要按下 `Shift`，再按下 `1`。
- `Control+S` 需要按下 `Control`，再按下 `S`。

Midscene 会把这些操作转换成修饰键按下、主键按下和按键释放等事件。

某些桌面客户端会捕获这些事件，并转发给另一个系统或功能模块。如果事件之间的间隔太短，客户端可能无法在处理主键时保留修饰键状态。结果就是大写字母变成小写、特殊字符变成数字，或者组合键只剩下主键。

设置 `keyboardModifierDelay` 后，Midscene 会分阶段发送这些事件，并在每个阶段之间等待。这样可以给桌面客户端留出识别和转发修饰键状态的时间。

VNC 全屏模式是已经验证过的典型场景。不过，这个问题并不只与 VNC 或远程控制有关。只要桌面客户端需要捕获或转发键盘事件，就可能受到输入时序的影响。

### 各项配置分别有什么作用？

- `keyboardModifierDelay`：控制一次带修饰键输入过程中，各阶段之间的等待时间。它适用于 `Control+S` 等组合键，也适用于大写字母中隐含的 `Shift`。
- `keyboardTypeDelay`：控制连续输入文本时，相邻字符之间的等待时间。
- `inputStrategy: 'sequential'`：逐个输入文本字符，使 Midscene 可以为大写字母和特殊字符发送对应的按键序列。
- `keyboardLayout: 'en-US'`：启用 en-US 键盘布局中的 Shift 字符映射，例如使用 `Shift+1` 输入 `!`。

拉丁大写字母不依赖 `keyboardLayout`。只有 `!`、`@`、`#` 等与键盘布局有关的 Shift 字符，才需要设置该选项。

:::warning
只有本机和目标环境都使用 en-US 键位时，才能设置 `keyboardLayout: 'en-US'`。其他键盘布局可能使用不同的标点键位，或者需要 AltGr 等修饰键。
:::

### 这个配置适用于哪些输入方式？

`keyboardModifierDelay` 只对本机 libnut 键盘驱动生效。

- Windows 和 Linux 的本机桌面控制使用 libnut。
- macOS 设置 `keyboardDriver: 'libnut'` 后，也会使用这条输入路径。
- 直接通过 RDP 协议输入时，该配置不生效。
- macOS 使用默认的 AppleScript 键盘驱动时，该配置不生效。

AppleScript 使用另一套输入方式。它是否能被桌面客户端正确识别，仍取决于客户端的快捷键拦截、键盘模式和布局转换。

### 如何发送组合键？

通过 `keyName` 传入组合键。使用 `+` 连接修饰键和主键，并删除 `+` 两侧的空格。

```typescript
// 向当前获得焦点的元素发送 Control+S。
await agent.aiKeyboardPress(undefined, {
  keyName: 'Control+S',
});

// 先定位终端窗口，再发送 Control+Shift+P。
await agent.aiKeyboardPress('终端窗口', {
  keyName: 'Control+Shift+P',
});
```

请使用 `Control+S`，不要使用 `Control + S`。

如果目标已经获得焦点，请将第一个参数设置为 `undefined`。这样可以避免额外点击改变当前选区或光标位置。

## 会有哪些信息发送到 AI 模型？

Midscene 会发送页面截图到 AI 模型。在某些场景下，例如调用 `aiAsk` 或 `aiQuery` 时传入 `domIncluded: true`，页面的 DOM 信息也会被发送。

如果你担心数据隐私问题，请参阅 [数据隐私](./data-privacy)。

## 我的模型服务商需要在请求中添加指定的 header

你可以通过环境变量 `MIDSCENE_MODEL_INIT_CONFIG_JSON` 中的 `defaultHeaders` 来指定请求时附带的 header，例如：

```bash
# 在请求头中添加 key 为 "foo"，值为 "bar" 的 header
MIDSCENE_MODEL_INIT_CONFIG_JSON='{"defaultHeaders":{"foo":"bar"}}'
```

如果你的模型服务商文档里把这个字段写成 `extra_headers` 或 `extraHeaders`，Midscene 也会兼容这两种别名，并自动归一化到 `defaultHeaders`。多个别名同时存在时，优先级为：`defaultHeaders` > `extra_headers` > `extraHeaders`。

你可以通过 JSON 序列化来生成这个 JSON 的文本以避免手动拼接出错：

```javascript
JSON.stringify({ defaultHeaders: { foo: 'bar' } })
```

## 如何使用 Azure OpenAI Service？

使用 Azure OpenAI Service 时，请先按照[支持的模型与配置](./model-common-config)选择模型，并填写常规配置。Azure 只需要把模型服务地址和 API Key 换成 Azure 的写法：

```bash
MIDSCENE_MODEL_BASE_URL="https://<your-resource>.services.ai.azure.com/openai/v1" # 或 https://<your-resource>.openai.azure.com/openai/v1
MIDSCENE_MODEL_API_KEY="<your-azure-api-key>"
```

`MIDSCENE_MODEL_NAME` 和 `MIDSCENE_MODEL_FAMILY` 等配置，仍应按照[支持的模型与配置](./model-common-config)中的对应模型说明填写。Azure 只是鉴权方式不同的模型供应商，并非一种特殊模型。

这会走普通 OpenAI-compatible 路径，以 `Authorization: Bearer ...` 请求头发送 `POST /openai/v1/chat/completions`。`MIDSCENE_MODEL_BASE_URL` 不要追加 `/chat/completions`。大多数 `/openai/v1` 端点不需要 `api-version`。

如果你的资源仍然以 `400 Missing required query parameter: api-version` 报错，说明该资源的 `/openai/v1` surface 尚未 GA。可以通过 `defaultQuery` 注入这个查询参数：

```bash
MIDSCENE_MODEL_INIT_CONFIG_JSON='{"defaultQuery":{"api-version":"preview"}}'
```

`api-version` 的值按你的资源要求填写（`preview`，或 Azure 门户里显示的带日期版本，如 `2025-01-01-preview`）。这样每个请求都会变成 `.../openai/v1/chat/completions?api-version=preview`。

如果某个 Azure-compatible 网关只接受 `api-key` 请求头，可以额外添加下面的配置，通过 header 发送真实 API Key：

```bash
MIDSCENE_MODEL_API_KEY="placeholder"
MIDSCENE_MODEL_INIT_CONFIG_JSON='{"defaultHeaders":{"api-key":"<your-azure-api-key>"}}'
```

这里的 `MIDSCENE_MODEL_API_KEY="placeholder"` 只是为了满足 OpenAI SDK 的初始化要求，真实 API Key 会通过 `defaultHeaders.api-key` 发送。

当某个资源同时需要 `api-version` 和 `api-key` 请求头时，可以把两种兜底配置合并：

```bash
MIDSCENE_MODEL_API_KEY="placeholder"
MIDSCENE_MODEL_INIT_CONFIG_JSON='{"defaultQuery":{"api-version":"preview"},"defaultHeaders":{"api-key":"<your-azure-api-key>"}}'
```

Azure AD / keyless 鉴权（`DefaultAzureCredential`）的方式现在已经不再支持，请使用 API Key 的方式。

## 使用 Azure OpenAI 时点击坐标偏移

在使用 GPT-5 系列模型时，你可能会发现：同一份脚本在 OpenAI 官方 API 上点击位置正确，但切到 Azure OpenAI 后点击位置出现固定比例的偏移。这个偏移和分辨率相关：截图较大时（如 `1920x1080`）出现，截图较小时（如 `1280x600`）则正常。

原因在于 Azure 端的图片处理。GPT-5 返回的是基于它实际看到的截图尺寸的绝对坐标，而 Midscene 发送图片时带上了 `"detail": "original"`，让模型看到原始分辨率的图片（参见 [GPT-5 说明](./model-common-config#gpt)）。Azure 没有正确处理 `"detail": "original"`，会在服务端对大图进行缩放（短边被压缩到 768）。于是模型在缩放后的坐标系里作答，而 Midscene 仍按原始分辨率还原坐标，最终产生按比例的偏移。可以通过 token 消耗来验证 `original` 是否生效：如果 `original` 生效，图片的 token 消耗会明显更高。

有两种规避办法：

1. 使用 OpenAI 官方的 GPT-5，或配置其他模型单独用于定位，而只把 Azure 平台的 GPT-5 作为规划模型。
2. 通过 Agent 参数 `screenshotShrinkFactor` 把截图预先缩放到较小尺寸，使图片不触发 Azure 的服务端缩放阈值。详见 [`screenshotShrinkFactor`](./reference/#common)。

## 如何配置 midscene_run 目录？

Midscene 会将运行产物（报告、日志、缓存等）保存在 `midscene_run` 目录下。默认情况下，该目录会创建在当前工作目录下。

你可以通过环境变量 `MIDSCENE_RUN_DIR` 来自定义该目录的位置，支持相对路径或绝对路径：

```bash
# 使用相对路径
export MIDSCENE_RUN_DIR="./my_custom_dir"

# 使用绝对路径
export MIDSCENE_RUN_DIR="/tmp/midscene_output"
```

该目录包含以下子目录：

- `report/` - 测试报告文件（HTML 格式）
- `log/` - 调试日志文件
- `cache/` - 缓存文件（详见 [缓存](./caching)）

更多全局运行参数请参考[运行时配置](./reference/#runtime-configuration)。

## 如何提升运行效率？

有几种方法可以提高运行效率：
1. 使用即时操作接口，如 `agent.aiTap('Login Button')` 代替 `agent.ai('Click Login Button')`。
2. 尽量使用较低的分辨率，降低输入 token 成本。
3. 更换更快的模型服务。
4. 使用缓存来加速调试过程。更多详情请参阅 [缓存](./caching)。

## 如何通过链接控制报告中播放器的默认回放样式？

在报告页面的链接后添加查询参数即可覆盖 **Focus on cursor** 和 **Show element markers** 开关的默认值，决定是否在报告中聚焦鼠标位置和元素标记。使用 `focusOnCursor` 和 `showElementMarkers`，参数值支持 `true`、`false`、`1` 或 `0`，例如：`...?focusOnCursor=false&showElementMarkers=true`。

## 如何把报告以纯播放器的形式嵌入其它页面?

当你需要把报告嵌入到别的页面(例如放进 `iframe`)时,在报告链接后添加 `player-only=1` 查询参数,即可隐藏所有外围界面(顶部栏、侧边栏、时间线和详情面板),只保留回放播放器。另外两个参数用来调整播放器:

- `play-control=1` —— 在 player-only 模式下显示底部播放控制条(默认隐藏)。仅接受 `=1` 开启。
- `auto-play` —— 是否在加载后自动播放。它独立于 `player-only`,对所有报告播放器都生效。**默认开启**;添加 `auto-play=0` 可关闭自动播放。

典型的嵌入形如 `...?player-only=1&play-control=1`。它同样可以和 `#task-<id>` 锚点组合使用,从而深链到某一具体步骤并只展示该步骤的播放器:`...?player-only=1#task-0-5`。若想让任意报告(无论是否嵌入)打开时不自动播放,使用 `...?auto-play=0`。

## 元素定位出现偏移

如果在使用 Midscene 时遇到元素定位不准确的问题，可以按照以下步骤排查和解决：

### 1. 升级到最新版本

确保你使用的是最新版本的 Midscene，新版本通常包含定位准确性的优化和改进。

```bash
# Web 自动化
npm install @midscene/web@latest
# iOS 自动化
npm install @midscene/ios@latest
# CLI 工具
npm install @midscene/cli@latest
# 或者其他和你平台对应的 package
```

### 2. 使用更好的视觉模型

Midscene 的元素定位能力依赖于 AI 模型的视觉理解能力，所以请务必选择支持视觉能力的模型。

通常来说新版本、参数大的模型会比老版本、参数小的模型表现更好。比如 Qwen3-VL 会好于 Qwen2.5-VL，它的 plus 版本会好于 flash 版本。

当前的模型建议请参考[支持的模型与配置](./model-common-config)。

### 3. 检查 Model Family 配置

确认你的模型配置中 `MIDSCENE_MODEL_FAMILY` 参数设置是否正确，`MIDSCENE_MODEL_FAMILY` 配置错误会影响 Midscene 对模型的适配逻辑。详见 [模型配置](./model-config)。

### 4. 优化提示词，结合视觉特征和位置信息

如果定位结果随机落在不相关的元素上，而且每次执行结果差异较大，通常说明模型无法理解图标按钮背后的语义。

以 `aiTap('个人中心')` 为例，这是一个功能性描述，模型可能并不了解个人中心图标具体的样式；而 `aiTap('人形头像 icon')` 是一个视觉性的描述，模型可以根据其视觉特征完成元素定位。

解决方法：优化提示词，结合视觉特征和位置信息来描述元素。

```typescript
// ❌ 仅使用功能性描述
await agent.aiTap('个人中心');

// ✅ 使用视觉性描述
await agent.aiTap('人形头像 icon');

// ✅ 结合视觉特征和位置信息
await agent.aiTap('页面右上角的人形头像图标');
```

### 5. 开启 `deepLocate`

如果定位结果落在目标元素附近，但有若干像素的偏移，说明模型大概率已经识别对了目标，只是在定位时仍有偏差。

解决方法：开启 `deepLocate` 会对定位效果有明显提升。

```typescript
await agent.aiTap('登录按钮', {
  deepLocate: true
});
```

更多关于 `deepLocate` 的说明，请参阅 [API 文档](/zh/reference/#深度定位deeplocate)。

### 6. 在 web 浏览器中将 dpr 提高到 2

如果你是在 web 浏览器里运行 Midscene，可以尝试将 dpr 提高到 `2`。一般 CI 环境中的默认 dpr 往往是 `1`，提高到 `2` 后页面会更清晰，对小元素的定位效果通常会更好。

需要注意的是，这会消耗更多 token。

## aiAct 中模型规划了错误的滚动和滑动方向 {#scroll-and-swipe-directions}

如果在 `aiAct()` 中遇到模型规划了错误的滚动或滑动方向，有可能是因为自然语言中的方向描述带有歧义。

以“向下滚动”为例，它可能表示下面几种情况：

- **鼠标滚轮向下滚动**：按 Windows 常见的鼠标滚轮设置，页面内容会向上移动。
- **手指在屏幕上向下滑动**：页面内容会跟随手指向下移动。
- **期望看到页面下方的内容**：需要结合设备的操作方式，确定手指或鼠标滚轮应该向哪个方向操作。

因此，模型规划的方向与预期不同，可能是因为它对指令中的方向有了不同的理解。

一个比较好的减少歧义的方式是，在指令中**明确表达想要达到的结果**，例如：

- “向下滚动页面到页脚”。
- “向上滚动日期选择器使日期增加”。
- “向右滚动页面查看右边 tab 的内容”。

即使模型和你对方向词的理解不同，清晰的目的也有助于模型规划正确的操作方向。

Midscene 会优先要求模型根据滚动和滑动的目的确定操作方向。对于“向下滚动”“向下滑动”这类模糊指令，如果结合上下文仍无法明确意图，则使用以下默认约定：

- **scroll**：方向按希望查看的屏外内容方向解释。例如，scroll down 表示查看页面下方的内容。
- **swipe**：方向按手指移动方向解释。例如，swipe down 表示手指向下移动。

## 豆包手机是否使用了 Midscene 作为底层方案？

没有。
