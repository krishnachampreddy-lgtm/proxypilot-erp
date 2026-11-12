import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import './pwa.js';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';

// ?still=morning|evening renders one high-quality photo of the campus (used to make the app backgrounds)
const stillTime = new URLSearchParams(window.location.search).get('still');
if (stillTime) {
  const el = document.getElementById('root');
  el.style.cssText = 'position:fixed;inset:0';
  const q = new URLSearchParams(window.location.search);
  const stop = q.get('stop');
  // &at=7:40 sets the school clock, &adv=20 lets the day run that many seconds first
  const at = q.get('at')?.split(':').map(Number);
  window.__campusDebug = true;
  import('./campus/index.js').then(async ({ createCampus, STOPS, SHOTS, shotView, prepared }) => {
    await prepared.catch(() => {});
    // &shot=arrival.1 frames one of the director's shots (&shot=inside.staff looks into a room)
    const shot = q.get('shot')?.split('.');
    const view = stop !== null ? STOPS[+stop] : shot ? shotView(shot[0], shot[1]) : undefined;
    const startMinutes = at ? at[0] * 60 + (at[1] || 0) : view?.clock;
    const api = createCampus(el, { mode: 'still', time: stillTime, view, startMinutes });
    api.ready.then(() => {
      if (q.get('adv')) api.advance(+q.get('adv'));
      api.renderStill();
      window.__campusApi = api;
      window.__campusShots = SHOTS;
      window.__shotView = shotView;
      window.__stillReady = true;
    });
  });
} else {
  if (new URLSearchParams(window.location.search).has('debug')) window.__campusDebug = true;
  createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
}
