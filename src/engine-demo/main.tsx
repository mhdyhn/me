import '@fontsource/vazirmatn/arabic-400.css';
import '@fontsource/vazirmatn/arabic-600.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import EngineDemo from './EngineDemo';
import './engine-demo.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root was not found in engine-demo.html.');

createRoot(rootElement).render(
  <StrictMode>
    <EngineDemo />
  </StrictMode>,
);
