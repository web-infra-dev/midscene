import type en from './en';

type Dictionary = typeof en;

const zh: Dictionary = {
  common: {
    cancel: '取消',
    close: '关闭',
    github: 'GitHub',
    save: '保存',
    website: '官网',
  },
  device: {
    platforms: {
      android: 'Android',
      computer: '电脑',
      harmonyos: 'HarmonyOS',
      ios: 'iOS',
      web: 'Web',
    },
    status: {
      connecting: '连接中',
      connectionFailed: '连接失败',
      live: '已连接',
      notConnected: '未连接',
    },
  },
  envConfig: {
    connectivityTest: '连通性测试',
    emptyForm: '请在 Text 标签页中以 KEY=VALUE 的形式输入，会自动同步到这里。',
    formatHint: '请按 KEY=VALUE 的格式按行输入。这些数据会被保存',
    locallyInBrowser: '在你的本地浏览器中',
    placeholder: 'OPENAI_API_KEY=sk-...\nMIDSCENE_MODEL=',
    tabForm: '表单',
    tabText: '文本',
    testFailed: '测试失败，请重试。',
    testing: '测试中...',
    testPassed: '测试通过。',
    title: '模型环境配置',
  },
  mainContent: {
    aria: {
      goBack: '后退',
      goForward: '前进',
      refreshDevices: '刷新设备',
      reloadPage: '刷新页面',
      stopLoading: '停止加载',
      webNavigation: '网页导航',
    },
    connect: {
      android: '连接 Android 设备',
      computer: '连接电脑',
      generic: '连接设备',
      harmonyos: '连接 HarmonyOS 设备',
      ios: '连接 iOS 设备',
      web: '打开网页',
    },
    chat: '对话',
    disconnect: '断开连接',
    noDeviceSelected: '未选择设备',
    playgroundOffline: 'Playground 服务已离线。',
    playgroundStarting: 'Playground 启动中',
    playgroundStartingEllipsis: 'Playground 启动中...',
    preparing: {
      android: '正在准备 Android 设备连接…',
      computer: '正在准备电脑连接…',
      generic: '正在准备设备连接…',
      harmonyos: '正在准备 HarmonyOS 设备连接…',
      ios: '正在准备 iOS 设备连接…',
      web: '正在打开网页…',
    },
    retryRuntime: '重试运行时',
    runtimeError: '运行时错误',
    setup: '设置',
  },
  preview: {
    connecting: '正在准备设备连接...',
    connectionFailed: {
      body: '无法重新连接到该设备。',
      reconnect: '重新连接',
      title: '连接失败',
    },
  },
  playground: {
    loading: 'Playground 加载中…',
    retryRuntime: '重试运行时',
    starting: 'Playground 启动中...',
    title: 'Playground',
    welcome: {
      intro: '这里是体验和测试 Midscene.js 功能的面板。',
      start: '请在下方输入框中输入你的指令开始体验。',
      titleLine1: '欢迎使用',
      titleLine2: 'Midscene.js Playground！',
      usage:
        '你可以使用自然语言指令来操作网页，例如点击按钮、填写表单、查询信息等。',
    },
  },
  settings: {
    environment: '环境配置',
    env: '环境',
    language: '语言',
    settings: '设置',
    theme: '主题',
    themes: {
      dark: '暗色',
      light: '亮色',
      system: '跟随系统',
    },
  },
  shell: {
    aria: {
      collapseSidebar: '折叠侧边栏',
      expandSidebar: '展开侧边栏',
    },
  },
  sidebar: {
    deviceOverview: '概览',
    noDevices: '暂无设备',
    platform: '平台',
    playgroundStarting: 'Playground 启动中',
    runtimeFailedToStart: '运行时启动失败',
  },
};

export default zh;
