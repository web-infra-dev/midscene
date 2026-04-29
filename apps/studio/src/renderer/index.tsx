import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { hydrateModelEnvStores } from './components/ShellLayout/model-env-storage';
import { applyStoredThemeMode } from './theme/ThemeProvider';

applyStoredThemeMode();
hydrateModelEnvStores();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
