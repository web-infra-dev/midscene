// Shared device-icon URLs. Android and Harmony share the same Android glyph
// (Harmony's form factor maps closer to Android than to iPhone), and Web
// shares the desktop PC glyph since Web sessions run inside a desktop
// browser. See apps/studio/assets/{android,iphone,pc}.png for the source
// art.
const androidDeviceIcon = new URL(
  '../../../assets/android.png',
  import.meta.url,
).href;
const iosDeviceIcon = new URL('../../../assets/iphone.png', import.meta.url)
  .href;
const computerDeviceIcon = new URL('../../../assets/pc.png', import.meta.url)
  .href;

export const assetUrls = {
  device: {
    android: androidDeviceIcon,
    computer: computerDeviceIcon,
    harmony: androidDeviceIcon,
    ios: iosDeviceIcon,
    web: computerDeviceIcon,
  },
  main: {
    chat: new URL('./main-chat.png', import.meta.url).href,
    connectionClosed: new URL(
      '../../../assets/connection-closed.svg',
      import.meta.url,
    ).href,
    connectionFailed: new URL(
      '../../../assets/connection-failed.svg',
      import.meta.url,
    ).href,
    device: new URL('./main-device.png', import.meta.url).href,
    platformAndroid: androidDeviceIcon,
    platformIos: iosDeviceIcon,
    platformHarmony: androidDeviceIcon,
    platformPc: computerDeviceIcon,
    platformWeb: computerDeviceIcon,
    devices: new URL('../../../assets/devices.svg', import.meta.url).href,
    disconnect: new URL('./main-disconnect.png', import.meta.url).href,
    env: new URL('../../../assets/env.svg', import.meta.url).href,
    sphere: new URL('../../../assets/sphere.svg', import.meta.url).href,
    pc: computerDeviceIcon,
    phone: androidDeviceIcon,
    phoneScreen: new URL('./main-phone-screen.png', import.meta.url).href,
  },
  playground: {
    action: new URL('./playground-action.png', import.meta.url).href,
    actionChevron: new URL('./playground-action-chevron.png', import.meta.url)
      .href,
    history: new URL('./playground-history.png', import.meta.url).href,
    midsceneIcon: new URL('../../../assets/midscene-icon.png', import.meta.url)
      .href,
    send: new URL('./playground-send.png', import.meta.url).href,
    tool: new URL('./playground-tool.png', import.meta.url).href,
  },
  sidebar: {
    android: new URL('./sidebar-android.svg', import.meta.url).href,
    computer: new URL('./sidebar-computer.png', import.meta.url).href,
    harmony: new URL('./sidebar-harmony.png', import.meta.url).href,
    ios: new URL('./sidebar-ios.png', import.meta.url).href,
    leftSidebar: new URL('../../../assets/left-sidebar.svg', import.meta.url)
      .href,
    collapse: new URL('./sidebar-collapse.svg', import.meta.url).href,
    expand: new URL('./sidebar-expand.svg', import.meta.url).href,
    overview: new URL('./sidebar-overview.png', import.meta.url).href,
    settings: new URL('./sidebar-settings.png', import.meta.url).href,
    web: new URL('./sidebar-web.png', import.meta.url).href,
  },
} as const;
