export const incutAssetUrls = {
  main: {
    chat: new URL('./main-chat.png', import.meta.url).href,
    device: new URL('./main-device.png', import.meta.url).href,
    disconnect: new URL('./main-disconnect.png', import.meta.url).href,
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
    computer: new URL('./sidebar-computer.png', import.meta.url).href,
    harmony: new URL('./sidebar-harmony.png', import.meta.url).href,
    ios: new URL('./sidebar-ios.png', import.meta.url).href,
    overview: new URL('./sidebar-overview.png', import.meta.url).href,
    settings: new URL('./sidebar-settings.png', import.meta.url).href,
    web: new URL('./sidebar-web.png', import.meta.url).href,
  },
} as const;
