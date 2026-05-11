export const playgroundAppEn = {
  app: {
    title: 'Playground',
    offlineTitle: 'Midscene Playground',
    offlineStatusText: 'Server offline...',
  },
  sessionSetup: {
    defaultTitle: 'Create Agent',
    defaultDescription: 'Create a platform session before running actions.',
    setupBlocked: 'Setup blocked',
    failedToLoadSetup: 'Failed to load setup',
    fieldRequired: '{label} is required',
    creating: 'Creating...',
  },
  scrcpy: {
    missingServerUrl: 'scrcpy preview metadata is missing a server URL.',
    webCodecsUnsupported:
      'Current browser does not support WebCodecs, so live scrcpy preview is unavailable.',
    failedToStartDecoder: 'Failed to start decoder.',
    willRetry: 'Scrcpy preview will retry automatically.',
    chromiumHint: 'Please use a modern Chromium browser to view the stream.',
    preparingAndroid: 'Preparing Android device connection…',
    startingDecoder: 'Starting video decoder…',
    streamConnected: 'Live scrcpy preview connected',
    unableToStart: 'Unable to start scrcpy preview',
    disconnectedRetrying: 'scrcpy preview disconnected, retrying…',
    connecting: 'Connecting to scrcpy preview server…',
    metadataTimeout:
      'Timed out waiting {seconds}s for scrcpy video stream metadata.',
  },
  preview: {
    tapFailed: 'Tap failed',
    inputFailed: 'Input failed',
    keyboardPressFailed: 'Keyboard press failed',
    webCodecsHttpDisabled:
      'Live scrcpy streaming is unavailable because WebCodecs API is disabled in non-secure (HTTP) contexts with non-localhost addresses.',
    pollingFallback:
      'Currently using screenshot polling as fallback. To enable scrcpy streaming:',
    instructionOpen: 'Open',
    instructionAdd: 'Add',
    instructionSetTo: 'Set to',
    instructionEnabled: 'Enabled',
    instructionRelaunch: 'and relaunch Chrome',
    pollingTitle: 'Screenshot polling mode',
    unavailableTitle: 'Preview unavailable',
    unavailableDescription:
      'This session did not expose a preview capability in runtime metadata.',
  },
  conversation: {
    title: 'Playground',
    skipCountdown: 'Skip countdown',
    automationStartingSoon: 'Automation Starting Soon',
    countdownRequested:
      'The selected session requested a countdown before execution.',
    pleaseWait: 'Please wait until the run starts.',
    serverOffline: 'Playground server offline',
    reconnectRuntime:
      'Reconnect the runtime to continue using the Android playground.',
  },
};

export default playgroundAppEn;
