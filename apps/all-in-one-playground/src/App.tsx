import { PlaygroundApp } from '@midscene/playground-app';

declare const __APP_VERSION__: string;

export default function App() {
  return (
    <PlaygroundApp
      serverUrl={window.location.origin}
      appVersion={__APP_VERSION__}
      title="All-in-One Playground"
      offlineTitle="Midscene All-in-One Playground"
      branding={{
        title: 'All-in-One Playground',
        targetName: 'platform',
      }}
    />
  );
}
