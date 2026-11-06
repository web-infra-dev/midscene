/// <reference types="chrome" />

export async function captureTabScreenshot(
  tab: chrome.tabs.Tab,
): Promise<string | null> {
  if (tab.id === undefined || tab.windowId === undefined) return null;

  const isSourceTabActive = async () =>
    (await chrome.tabs.query({ active: true, windowId: tab.windowId }))[0]
      ?.id === tab.id;

  let sourceTabWasDeactivated = false;
  const onActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
    if (activeInfo.windowId === tab.windowId && activeInfo.tabId !== tab.id) {
      sourceTabWasDeactivated = true;
    }
  };
  chrome.tabs.onActivated.addListener(onActivated);

  try {
    if (!(await isSourceTabActive())) return null;

    const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
    });

    const stillActive = await isSourceTabActive();
    return !sourceTabWasDeactivated && stillActive ? screenshot : null;
  } finally {
    chrome.tabs.onActivated.removeListener(onActivated);
  }
}
