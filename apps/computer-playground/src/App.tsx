import { PlaygroundApp } from '@midscene/playground-app';

declare const __APP_VERSION__: string;

export default function App() {
  return (
    <PlaygroundApp
      serverUrl={window.location.origin}
      appVersion={__APP_VERSION__}
      title="Computer Playground"
      defaultDeviceType="computer"
      branding={{
        targetName: 'computer',
      }}
      offlineTitle="Midscene Computer Playground"
    />
  );
}
