import { PlaygroundApp } from '@midscene/playground-app';

declare const __APP_VERSION__: string;
declare const __SERVER_URL__: string;

export default function App() {
  return (
    <PlaygroundApp
      serverUrl={__SERVER_URL__}
      appVersion={__APP_VERSION__}
      title="Playground"
      offlineTitle="Midscene Playground"
    />
  );
}
