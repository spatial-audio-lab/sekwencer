import './styles/main.css'
import { state } from './js/state.js'
import { update, wireControls, setPlayStatus } from './js/ui.js'
import { wireHeader } from './js/header.js'
import { initScene3D, resizeScene3D } from './js/scene3d.js'

// ===== START (bez ekranu startowego) =====
// Pętla animacji startuje na load, AudioContext leniwie przy pierwszym geście
// (ensureAudio() w ui.js). Etap 2: scena 3D (Three.js) zastępuje dawny canvas 2D.
function boot() {
  initScene3D(document.getElementById('scene3dContainer'))
  resizeScene3D()
  wireControls()
  wireHeader()
  state.isRunning = true
  setPlayStatus(false)
  update()
}

boot()
