export interface AndroidCacheCompatibilityFixture {
  framework:
    | 'React Native'
    | 'Flutter'
    | 'Jetpack Compose'
    | 'Lynx'
    | 'WebView';
  packageName: string;
  sourceFile: string;
  replayFile: string;
  prompt: string;
  sourcePoint: { x: number; y: number };
  replayRect: { left: number; top: number; width: number; height: number };
  safeMissPoint: { x: number; y: number };
}

export const ANDROID_CACHE_COMPATIBILITY_FIXTURES: AndroidCacheCompatibilityFixture[] =
  [
    {
      framework: 'React Native',
      packageName: 'com.discord',
      sourceFile: 'react-native.source.xml',
      replayFile: 'react-native.replay.xml',
      prompt: 'the React Native Register action',
      sourcePoint: { x: 200, y: 150 },
      replayRect: { left: 40, top: 300, width: 320, height: 100 },
      safeMissPoint: { x: 100, y: 675 },
    },
    {
      framework: 'Flutter',
      packageName: 'org.localsend.localsend_app',
      sourceFile: 'flutter.source.xml',
      replayFile: 'flutter.replay.xml',
      prompt: 'the Flutter Downloads action',
      sourcePoint: { x: 200, y: 150 },
      replayRect: { left: 40, top: 300, width: 320, height: 100 },
      safeMissPoint: { x: 100, y: 675 },
    },
    {
      framework: 'Jetpack Compose',
      packageName: 'com.openai.chatgpt',
      sourceFile: 'compose.source.xml',
      replayFile: 'compose.replay.xml',
      prompt: 'the Compose Welcome element',
      sourcePoint: { x: 200, y: 150 },
      replayRect: { left: 40, top: 300, width: 320, height: 100 },
      safeMissPoint: { x: 100, y: 675 },
    },
    {
      framework: 'Lynx',
      packageName: 'com.ss.android.ugc.aweme',
      sourceFile: 'lynx.source.xml',
      replayFile: 'lynx.replay.xml',
      prompt: 'the Lynx search action',
      sourcePoint: { x: 200, y: 150 },
      replayRect: { left: 40, top: 300, width: 320, height: 100 },
      safeMissPoint: { x: 100, y: 675 },
    },
    {
      framework: 'WebView',
      packageName: 'com.example.hybrid',
      sourceFile: 'webview.source.xml',
      replayFile: 'webview.replay.xml',
      prompt: 'the WebView Continue checkout action',
      sourcePoint: { x: 200, y: 150 },
      replayRect: { left: 40, top: 300, width: 320, height: 100 },
      safeMissPoint: { x: 100, y: 675 },
    },
  ];
