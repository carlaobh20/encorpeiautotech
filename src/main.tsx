import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { injectTokens } from './design/tokens';
import './styles.css';

// Design System: os tokens TS viram CSS variables antes do primeiro render.
injectTokens();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
