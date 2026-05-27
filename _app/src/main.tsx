import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import './index.css'
import App from './App.tsx'

const p = new Protocol()
maplibregl.addProtocol('pmtiles', p.tile.bind(p))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
