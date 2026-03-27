import './App.less';
import { PlaygroundApp } from '@midscene/playground-app';

declare const __APP_VERSION__: string;

export default function App() {
  return (
    <PlaygroundApp
      serverUrl={window.location.origin}
      appVersion={__APP_VERSION__}
      title="Android Playground"
      offlineTitle="Midscene Android Playground"
      defaultDeviceType="android"
      branding={{
        title: 'Android Playground',
        targetName: 'android',
      }}
    />
  );
}
