import type { playgroundAppEn } from './en';

type Dictionary = typeof playgroundAppEn;

export const playgroundAppZh: Dictionary = {
  app: {
    title: 'Playground',
    offlineTitle: 'Midscene Playground',
    offlineStatusText: '服务离线…',
  },
  sessionSetup: {
    defaultTitle: '创建 Agent',
    defaultDescription: '运行操作前请先创建一个平台会话。',
    setupBlocked: '配置受阻',
    failedToLoadSetup: '加载配置失败',
    fieldRequired: '{label} 为必填项',
    creating: '创建中…',
  },
  scrcpy: {
    missingServerUrl: 'scrcpy 预览元数据缺少服务地址。',
    webCodecsUnsupported:
      '当前浏览器不支持 WebCodecs，无法启用 scrcpy 实时预览。',
    failedToStartDecoder: '启动解码器失败。',
    willRetry: 'Scrcpy 预览将自动重试。',
    chromiumHint: '请使用现代 Chromium 浏览器查看视频流。',
    preparingAndroid: '正在准备 Android 设备连接…',
    startingDecoder: '正在启动视频解码器…',
    streamConnected: 'Scrcpy 实时预览已连接',
    unableToStart: '无法启动 scrcpy 预览',
    disconnectedRetrying: 'scrcpy 预览已断开，正在重试…',
    connecting: '正在连接 scrcpy 预览服务…',
    metadataTimeout: '等待 scrcpy 视频流元数据超过 {seconds} 秒。',
  },
  preview: {
    tapFailed: '点击失败',
    inputFailed: '输入失败',
    keyboardPressFailed: '键盘按键失败',
    webCodecsHttpDisabled:
      '当前在非 localhost 的非安全（HTTP）环境中，WebCodecs API 被禁用，无法启用 scrcpy 实时流。',
    pollingFallback: '当前回退到截图轮询。要启用 scrcpy 流式预览：',
    instructionOpen: '打开',
    instructionAdd: '添加',
    instructionSetTo: '设置为',
    instructionEnabled: '已启用',
    instructionRelaunch: '后重新启动 Chrome',
    pollingTitle: '截图轮询模式',
    unavailableTitle: '预览不可用',
    unavailableDescription: '该会话未在运行时元数据中暴露预览能力。',
  },
  conversation: {
    title: 'Playground',
    skipCountdown: '跳过倒计时',
    automationStartingSoon: '即将开始自动化',
    countdownRequested: '所选会话在执行前请求倒计时。',
    pleaseWait: '请等待运行开始。',
    serverOffline: 'Playground 服务离线',
    reconnectRuntime: '请重新连接运行时以继续使用 Android Playground。',
  },
};

export default playgroundAppZh;
