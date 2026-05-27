import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import './index.css'
import App from './App.tsx'

const p = new Protocol()
maplibregl.addProtocol('pmtiles', p.tile.bind(p))

// Chrome extensions that intercept fetch requests (ad blockers, password
// managers, etc.) set up async chrome.runtime message listeners and then get
// torn down when MapLibre cancels an in-flight tile request, producing a
// harmless "message channel closed" unhandled rejection. Suppress it so it
// doesn't pollute the console during normal use.
// e.reason can be an Error object OR a plain string depending on the extension.
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason instanceof Error
    ? e.reason.message
    : String(e.reason ?? '');
  if (msg.includes('message channel closed')) {
    e.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
