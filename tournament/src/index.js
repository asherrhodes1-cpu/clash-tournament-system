import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import LiveOverlay from './live/LiveOverlay';
import OverlayGate from './overlays/OverlayGate';

// /live/overlay is the OBS Browser source: just the betting round, no site around it.
const path = window.location.pathname.replace(/\/+$/, '');
const isOverlay = path === '/live/overlay';

// /overlay-control is where staff fill in the tournament stream overlays
// (the pages under /overlays). Staff-only.
const isOverlayControl = path === '/overlay-control';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {isOverlay && <LiveOverlay />}
    {isOverlayControl && <OverlayGate />}
    {!isOverlay && !isOverlayControl && <App />}
  </React.StrictMode>
);
