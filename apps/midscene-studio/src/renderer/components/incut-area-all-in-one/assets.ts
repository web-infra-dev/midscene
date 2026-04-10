export const incutAssetUrls = {
  main: {
    chat: new URL('./assets/main-chat.png', import.meta.url).href,
    device: new URL('./assets/main-device.png', import.meta.url).href,
    disconnect: new URL('./assets/main-disconnect.png', import.meta.url).href,
    phoneScreen: new URL('./assets/main-phone-screen.png', import.meta.url)
      .href,
  },
  playground: {
    action: new URL('./assets/playground-action.png', import.meta.url).href,
    actionChevron: new URL(
      './assets/playground-action-chevron.png',
      import.meta.url,
    ).href,
    history: new URL('./assets/playground-history.png', import.meta.url).href,
    midsceneIcon: new URL(
      '../../../../assets/midscene-icon.png',
      import.meta.url,
    ).href,
    send: new URL('./assets/playground-send.png', import.meta.url).href,
    tool: new URL('./assets/playground-tool.png', import.meta.url).href,
  },
  sidebar: {
    computer: new URL('./assets/sidebar-computer.png', import.meta.url).href,
    harmony: new URL('./assets/sidebar-harmony.png', import.meta.url).href,
    ios: new URL('./assets/sidebar-ios.png', import.meta.url).href,
    overview: new URL('./assets/sidebar-overview.png', import.meta.url).href,
    settings: new URL('./assets/sidebar-settings.png', import.meta.url).href,
    web: new URL('./assets/sidebar-web.png', import.meta.url).href,
  },
} as const;
