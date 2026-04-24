# Studio / Playground Dark Mode 迁移方案

## 目标

- Studio shell、`@midscene/playground-app`、Chrome extension、Report 共用一套主题 token。
- 开启 dark 模式时，Tailwind 类与 antd 组件同时生效，不需要在业务代码里写 `dark:` 分支。
- 切换成本降到「往 `<html>` 加一个 class」即可。

## 当前状态（本次调研结论）

- **没有 dark 实现**：全仓库搜不到 `dark:` Tailwind 变体，也没有 `darkAlgorithm` 绑定。
- **颜色来源分散**：
  - Studio renderer 大量使用 Tailwind arbitrary value（`bg-[#F6F6F6]`、`text-[#474848]`、`border-[#ECECEC]` 等）。
  - `packages/playground-app` 的 `.less` 用硬编码 hex（`#1979FF`、`#f2f4f7` 等）。
  - antd token 只在 `packages/visualizer/src/utils/color.ts` 的 `globalThemeConfig()` 里写死了 `colorPrimary: '#2B83FF'` 和 Layout 背景。
  - ~45 个不同 hex 在 studio + playground-app 里反复出现（`#474848` ×11、`#ECECEC` ×8、`#F2F4F7` ×8、`#1979FF` ×3 等）。
- **共享入口**：playground-app / chrome-extension / report / studio 都经过 `@midscene/visualizer` 的 `globalThemeConfig()`，这是天然的收敛点。

## 分层 Token 清单（建议）

把 ~45 个原始 hex 压缩到下面这组语义 token；每个 token 在 light/dark 各有一套值。

| Token                | 语义             | 当前对应 hex (light) |
| -------------------- | ---------------- | -------------------- |
| `--surface-app`      | 应用背景         | `#F6F6F6`            |
| `--surface-panel`    | 面板背景         | `#FFFFFF`            |
| `--surface-muted`    | 次级灰底         | `#F2F4F7` / `#F0F2F5`|
| `--surface-accent`   | Hover/激活背景   | `rgba(0,0,0,0.05)`   |
| `--border-subtle`    | 分割线           | `#ECECEC` / `#E9ECF3`|
| `--border-strong`    | 描边             | `rgba(0,0,0,0.08)`   |
| `--text-primary`     | 主文案           | `#0D0D0D` / `#000`   |
| `--text-secondary`   | 次文案           | `#474848`            |
| `--text-tertiary`    | 占位/禁用        | `#797A7A` / `#9D9FA0`|
| `--brand-primary`    | 品牌主色         | `#1979FF` / `#2B83FF`|
| `--status-success`   | Live / 成功      | `#12B981` / `#079669`|
| `--status-success-bg`| 成功背景         | `#E5FFF4`            |
| `--status-error`     | 连接失败         | `#E13E37`            |
| `--status-error-bg`  | 错误背景         | `#F7ECEB`            |
| `--status-info`      | Connecting       | `#1979FF`            |
| `--status-info-bg`   | Info 背景        | `#E5F0FF`            |
| `--icon-muted`       | 禁用/灰态圆点    | `#B6B6B6`            |

> 规则：业务代码只能用语义 token。`brand-primary`/`status-*` 这类品牌色不跟着 dark 反色，只调整背景/前景的对比度变体。

## 技术方案

### 1. 一处定义 token

在 `packages/visualizer/src/theme/` 新建：

- `tokens.css` —— 用 CSS 变量定义 light/dark 两套：
  ```css
  :root {
    --surface-app: #F6F6F6;
    --text-primary: #0D0D0D;
    /* ... */
  }
  :root.dark {
    --surface-app: #141414;
    --text-primary: #F5F5F5;
    /* ... */
  }
  ```
- `tokens.ts` —— 导出同名常量 `tokenVar('surface-app') === 'var(--surface-app)'`，用于 antd `ConfigProvider.theme.token` 与 less `@theme()` 的统一引用。

### 2. Tailwind v4 绑定 CSS 变量

Studio 的 `tailwind.config`（或 v4 的 `@theme` 指令）里：

```css
@theme {
  --color-surface-app: var(--surface-app);
  --color-surface-panel: var(--surface-panel);
  --color-text-primary: var(--text-primary);
  /* ... */
}

@custom-variant dark (&:where(.dark, .dark *));
```

业务代码改成 `bg-surface-app text-text-primary`，不再写 `bg-[#F6F6F6]`。

### 3. antd 使用同一组变量

改造 `globalThemeConfig()`（`packages/visualizer/src/utils/color.ts`）：

```ts
import { theme as antdTheme } from 'antd';

export function globalThemeConfig(mode: 'light' | 'dark' = 'light'): ThemeConfig {
  return {
    algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: 'var(--brand-primary)',
      colorBgContainer: 'var(--surface-panel)',
      colorBgElevated: 'var(--surface-panel)',
      colorBgLayout: 'var(--surface-app)',
      colorText: 'var(--text-primary)',
      colorTextSecondary: 'var(--text-secondary)',
      colorBorder: 'var(--border-subtle)',
      colorError: 'var(--status-error)',
      colorSuccess: 'var(--status-success)',
    },
  };
}
```

> antd 从 v5 起允许 token 值为 `var(...)`，因此一次定义就可以让 Form/Select/Button/Alert 全部跟着 CSS 变量走。

### 4. 切换机制

- `ThemeModeProvider`（新增，放 `@midscene/visualizer`）：
  - 持久化当前模式到 `localStorage`。
  - 给 `<html>` 加/去 `.dark`。
  - Electron 环境用 `nativeTheme.themeSource === 'dark'` 跟随系统；带监听同步到 renderer。
  - 通过 React context 暴露 `mode` + `setMode`，供 `PlaygroundThemeProvider` 把模式传给 `globalThemeConfig(mode)`。

### 5. 改造顺序（低风险优先）

1. 落 token + CSS 变量骨架，light 值 = 现有颜色（UI 完全不变）。
2. 替换一个 PoC 面板——建议先做 `SessionSetupPanel`（本次刚重写过，范围小、antd + Tailwind 都涉及），验证 token 在 antd Form/Select 中的表现。
3. 批量替换 Tailwind arbitrary value → semantic class，用 grep 清单对照（第一节 token 表）。
4. 批量替换 `.less` 中的硬编码 hex → `var(--...)`。
5. 接入 `ThemeModeProvider`，在 Studio 顶栏/设置里加一个三态开关（`light` / `dark` / `system`）。
6. Chrome extension + report 跟随升级（它们已经共享 `globalThemeConfig`，成本最低）。

## PoC 落地情况（已实现）

- Token 层：`apps/studio/src/renderer/App.css` 定义 `--midscene-*` 16+ 个语义
  token，light + `[data-theme='dark']` 两套值，通过 Tailwind v4 `@theme`
  暴露为 utility 类，`@custom-variant dark ([data-theme='dark'])`。
- 状态管理：`apps/studio/src/renderer/theme/ThemeProvider.tsx` 支持
  `light` / `dark` / `system` 三档，`system` 下通过 `matchMedia` 跟随 OS；
  仅写 `<html data-theme>`，避免 `.dark` class 与 data-attr 双信号。
- FOUC：`index.tsx` 在 React mount 前同步 `applyStoredThemeMode()`。
- antd 集成：`StudioAntdProvider` 使用真实 hex（按 `resolved` 选 light /
  dark 常量表）喂给 antd，避免 `var(--…)` 被 tinycolor 解析失败导致
  hover/active 衍生色错乱；`algorithm` 跟随模式切换。
- 外部包复用：`@midscene/visualizer` 的 `universal-playground` /
  `prompt-input` / `playground-result` 与 `@midscene/playground-app` 的
  `SessionSetupPanel.less` 全部通过 `var(--midscene-*)` 带 light fallback
  读 token，既跟随 host 切换，也兼容没有设 token 的场景。
- 入口：左下角设置菜单的 Theme 项循环切 `Light → Dark → System`。

## 仍待推进

- `packages/visualizer/src/utils/color.ts` 的 `globalThemeConfig()` 还是
  硬编码 light；chrome-extension、report 接入 dark 需要把这个函数改成
  `globalThemeConfig(mode)` 并共用同一套 `--midscene-*` token。
- scrcpy 预览、phone/pc 插画仍是浅色素材；需要给 dark 单独出图或加 filter。
- Player / scroll-to-bottom 等少量 visualizer `.less` 片段仍有硬编码色。

## 风险与取舍

- **第三方组件**：`rc-dock`、`antd Modal` 等自带样式需要逐个核对 dark 下是否可读；部分要靠 `.less` 里再加 dark override。
- **scrcpy / 视频预览**：设备画面本身是位图，dark 下主要是调整外框/占位色；`ConnectingPreview` 等插画可能需要一套深色变体。
- **硬编码品牌色（`#1979FF`、`#2B83FF`）并存**：token 统一后仅保留一个 brand 色，下游代码里出现过不同蓝需要对账。
- **全量替换 ~45 种 hex 的工作量不小**，但一次性替换比长期 `dark:` 分支维护成本低得多。
- **渐进路径不建议**：只给个别 panel 加 `dark:` 分支会导致 Tailwind 与 antd 永远对不齐，反而更难收敛。
