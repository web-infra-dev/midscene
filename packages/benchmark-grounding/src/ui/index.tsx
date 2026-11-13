import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import type { UIData } from '../reporter';
import { App } from './App';
import { brandLogo } from './brand';
import './styles.css';

const icon = document.getElementById('benchmark-icon');
if (icon instanceof HTMLLinkElement) icon.href = brandLogo;

const root = document.getElementById('root');
if (!root) throw new Error('Missing benchmark root element');

try {
  const embedded = document.getElementById('benchmark-data');
  if (!embedded?.textContent)
    throw new Error('Missing embedded benchmark data');
  const data = JSON.parse(embedded.textContent) as UIData;
  if (
    (data.mode !== 'viewer' && data.mode !== 'report') ||
    !Array.isArray(data.testcases)
  ) {
    throw new Error('Invalid embedded benchmark data');
  }
  createRoot(root).render(
    <StrictMode>
      <HashRouter>
        <App data={data} />
      </HashRouter>
    </StrictMode>,
  );
} catch (error) {
  root.setAttribute('role', 'alert');
  root.className = 'app-error';
  root.textContent = `Unable to open benchmark: ${error instanceof Error ? error.message : String(error)}`;
}
