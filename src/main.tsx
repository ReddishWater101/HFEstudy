import React from 'react';
import ReactDOM from 'react-dom/client';
import { installWebApi } from './lib/webApi';
import App from './App';
import './styles/global.css';

installWebApi();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
