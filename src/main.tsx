import '@fontsource/vazirmatn/arabic-400.css';
import '@fontsource/vazirmatn/arabic-500.css';
import '@fontsource/vazirmatn/arabic-600.css';
import '@fontsource/vazirmatn/arabic-700.css';
import '@fontsource/vazirmatn/arabic-800.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getSavedCredentials } from './lib/savedLogin';
import './styles.css';
import './theme.css';

// Remove plain-text passwords stored by older versions before rendering any route.
getSavedCredentials();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root was not found in index.html.');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
