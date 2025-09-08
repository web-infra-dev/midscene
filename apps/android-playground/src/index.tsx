import ReactDOM from 'react-dom/client';
import App from './App-universal';

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(<App />);
}
