import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('[midscene-bdd] Missing #root element');
}

createRoot(rootElement).render(<App />);
