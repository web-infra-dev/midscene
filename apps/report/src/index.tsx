import ReactDOM from 'react-dom/client';
import { App } from './App';
import { installHeadlessVideoExport } from './headless-video-export';

// Installs window.__midscene_exportVideoToBase64 for the CLI headless exporter.
// Called explicitly (not a bare side-effect import) so it survives tree-shaking.
installHeadlessVideoExport();

const rootEl = document.getElementById('root');

if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);

  root.render(<App />);
} else {
  console.error('no root element found');
}
