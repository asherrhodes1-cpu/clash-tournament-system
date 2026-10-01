import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import LiveOverlay from './live/LiveOverlay';

// /live/overlay is the OBS Browser source: just the betting round, no site around it.
const isOverlay = window.location.pathname.replace(/\/+$/, '') === '/live/overlay';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {isOverlay ? <LiveOverlay /> : <App />}
  </React.StrictMode>
);
