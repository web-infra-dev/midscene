# Studio Sidebar Env Unification

## Goal

收敛 Studio 左下角与设置面板里重复的模型配置入口。

用户期望是：

- 左下角只保留一个入口
- 入口名称统一为 `Env`
- `Env` 和 `Model` 不再同时出现
- 所有入口仍然打开同一个现有的环境配置弹窗

## Existing State

当前重复入口来自两层 UI，而且都指向同一个 `ModelEnvConfigModal`：

1. [SettingsDock](/Users/bytedance/personal/midscene_4/apps/studio/src/renderer/components/SettingsDock/index.tsx)
   - 左下角除了 `Settings` 按钮，还有两个 chip：
   - `Model`
   - `Env`

2. [SettingsPanel](/Users/bytedance/personal/midscene_4/apps/studio/src/renderer/components/SettingsPanel/index.tsx)
   - 展开的设置面板里还有两项：
   - `Environment`
   - `Model`

3. [ShellLayout](/Users/bytedance/personal/midscene_4/apps/studio/src/renderer/components/ShellLayout/index.tsx)
   - `onEnvConfigClick={openModelModal}`
   - `onModelConfigClick={openModelModal}`
   - `onEnvClick={openModelModal}`
   - `onModelClick={openModelModal}`

所以现在不是两个能力，而是四个不同位置的重复入口，全部落到同一个 modal。

## Reuse Scan

这次不需要引入新组件或新状态，直接复用现有链路：

- 复用现有 [ModelEnvConfigModal](/Users/bytedance/personal/midscene_4/apps/studio/src/renderer/components/ShellLayout/ModelEnvConfigModal.tsx)
- 复用现有 `openModelModal` 打开逻辑
- 复用现有 `SidebarFooter -> SettingsDock` 结构

不新增 store，不新增 modal，不新增路由状态。

## Synchronized Scope

需要同步收口的文件：

1. `apps/studio/src/renderer/components/SettingsDock/index.tsx`
2. `apps/studio/src/renderer/components/SettingsPanel/index.tsx`
3. `apps/studio/src/renderer/components/Sidebar/index.tsx`
4. `apps/studio/src/renderer/components/ShellLayout/index.tsx`

测试补在 `apps/studio/tests/` 下，优先用现有的轻量渲染测试方式，不引入新测试栈。

## Implementation Plan

### 1. 收敛 dock 的底部入口

修改 `SettingsDock`：

- 删除 `onModelClick` props
- 删除 `Model` chip
- 保留单个 `Env` chip

目标效果：

- 左下角在 `Settings` 右侧只剩一个 `Env`
- 点击后仍然打开现有配置弹窗

### 2. 收敛设置弹层里的重复项

修改 `SettingsPanel`：

- 删除 `onModelConfigClick` props
- 删除 `Model` 这一项
- 保留 `Environment`

这样左下角菜单内部也只剩单一入口，不会再和 dock 外部形成双重重复。

### 3. 统一回调语义

修改 `SidebarFooter` 和 `ShellLayout`：

- 删除 `onModelClick`
- 删除 `onModelConfigClick`
- 统一只传 `onEnvClick` / `onEnvConfigClick`
- `openModelModal` 可以保留实现名，或顺手重命名为更贴近语义的 `openEnvModal`

这里更推荐直接重命名为 `openEnvModal`，避免后续代码继续暗示“Env 和 Model 是两套东西”。

### 4. 补最小回归测试

新增或补充 Studio 组件级测试，覆盖：

- `SettingsDock` 只渲染一个 `Env`，不再渲染 `Model`
- `SettingsPanel` 只渲染 `Environment`，不再渲染 `Model`

如果已有测试文件不适合承载，就新增一个针对 sidebar settings 的轻量测试文件。

## Concrete File Changes

### `apps/studio/src/renderer/components/SettingsDock/index.tsx`

- 删除 `onModelClick?: () => void`
- 删除 `<ActionChip label="Model" ... />`
- 保留 `<ActionChip label="Env" ... />`

### `apps/studio/src/renderer/components/SettingsPanel/index.tsx`

- 删除 `onModelConfigClick?: () => void`
- 删除底部 `Model` 的 `SettingItem`
- 保留 `Environment`

### `apps/studio/src/renderer/components/Sidebar/index.tsx`

- 删除 `SidebarFooterProps.onModelClick`
- 删除传给 `SettingsDock` 的 `onModelClick`

### `apps/studio/src/renderer/components/ShellLayout/index.tsx`

- 设置弹层只传 `onEnvConfigClick`
- `SidebarFooter` 只传 `onEnvClick`
- 删除所有 `onModel...` 传参
- 如有必要，把 `openModelModal` 重命名为 `openEnvModal`

### `apps/studio/tests/*`

- 新增或修改测试，锁住 `Model` 文案和对应入口不再出现

## Risks And Omissions

### 风险

1. `ModelEnvConfigModal` 这个组件名暂时还是旧名字
   - 这不会影响行为
   - 如果这次顺手改名，改动面会扩大到导入与测试引用
   - 这轮建议先只统一入口，不扩大到 modal 文件名重命名

2. `Environment` 与 `Env` 文案是否需要完全一致
   - 当前用户要求是“只留下 Env”
   - 但设置面板里的全称 `Environment` 可读性更好
   - 如果严格按你的字面要求执行，设置面板里也应改成 `Env`

### 默认行为稳定性

- 不改 modal 内容
- 不改保存逻辑
- 不改 connectivity test
- 不改 MainContent 里的引导动作
- 只收敛入口数量和命名

### 不引入新依赖

- 本方案不新增任何 dependency / devDependency

## Recommended Final Behavior

我建议按下面的最终形态执行：

- 左下角 dock：`Settings` + `Env`
- 展开的设置面板：保留 `Environment` 一项，删除 `Model`
- 两处都打开同一个现有配置弹窗

如果你要严格统一字面文案，我会把设置面板里的 `Environment` 也改成 `Env`。
