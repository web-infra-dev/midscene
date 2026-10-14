# @midscene/computer

Midscene 的 Windows、macOS、Linux 桌面自动化库，同时支持远程 RDP 桌面。参见 <https://midscenejs.com/platforms/desktop>。

## 远程原生桌面桥接

`midscene-computer-bridge` 通过带鉴权的 WebSocket 暴露已有的原生 `ComputerDevice`。服务运行在**被测机器的交互式登录会话**中；`ComputerAgent`、模型调用、工作流和报告运行在控制机。被测机器只部署薄 Device 服务，适合远程 macOS 桌面。已有 `agentForComputer` 和 `agentForRDPComputer` 可继续使用。

在被测 Mac 安装 `@midscene/computer`，为服务进程授予屏幕录制和辅助功能权限，通过资源管理器向 `MIDSCENE_COMPUTER_BRIDGE_TOKEN` 注入随机共享密钥（至少 16 字符），然后启动：

```sh
midscene-computer-bridge --target-id allocated-mac
```

服务默认监听 `127.0.0.1:8766`。通过受保护隧道或 TLS/鉴权网络边界接入。例如在控制机运行：

```sh
ssh -N -L 8766:127.0.0.1:8766 user@target-mac
```

为控制机注入相同密钥及正常的 Midscene 模型配置：

```ts
import { agentForRemoteComputer } from '@midscene/computer';

const agent = await agentForRemoteComputer({
  url: 'ws://127.0.0.1:8766', // 隧道转发到被测 Mac，不操作控制机桌面
  token: process.env.MIDSCENE_COMPUTER_BRIDGE_TOKEN!,
  expectedOS: 'macos',
});
try {
  await agent.aiAct('打开已准备好的应用');
  await agent.aiAssert('应用已展示');
} finally {
  await agent.destroy();
}
```

接入 Project setup 时，创建 `RemoteComputerDevice`，调用 `await device.connect()` 后创建 `new ComputerAgent(device, agentOptions)`。连接前注册清理，teardown 时销毁 Agent 和 Device。`device.connectionInfo` 返回被测端真实 OS、资源标识、服务会话、显示器和尺寸；`expectedOS` 用于校验握手结果。坐标和 DPR 使用被测端数据。密钥只出现在握手中，不进入 URL、Device 序列化或 Agent options。自定义 Action 留在控制机。

协议只转发截图、尺寸及原生输入，按顺序执行请求。输入失败会返回错误；超时或连接失败会终止连接，**不重放操作**。断开会等待原生 Device 清理，心跳检测控制机失联。资源分配及桌面/会话独占由调用方保证。服务不创建登录会话、不安装应用、不执行 Shell，也不运行完整测试 Worker。使用已有 RDP 时，Windows RDP 与 Linux X11/xrdp 环境由调用方提前准备。
