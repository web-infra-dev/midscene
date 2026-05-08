import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { hydrateModelEnvStores } from './components/ShellLayout/model-env-storage';
import { applyStoredLocale } from './i18n';
import { applyStoredThemeMode } from './theme/ThemeProvider';

applyStoredThemeMode();
applyStoredLocale();
hydrateModelEnvStores();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
