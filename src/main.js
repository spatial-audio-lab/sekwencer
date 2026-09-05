import './styles/main.css'
import { state } from './js/state.js'
import { computePoint } from './js/math.js'
import { update, wireControls, syncUI, setPlayStatus } from './js/ui.js'
import { wireHeader } from './js/header.js'
import { initScene3D, resizeScene3D, renderScene3D } from './js/scene3d.js'

// ===== START (bez ekranu startowego) =====
// Pętla animacji startuje na load, AudioContext leniwie przy pierwszym geście
// (ensureAudio() w ui.js). Punkt spoczywa na początku trajektorii do momentu
// kliknięcia ODTWÓRZ (state.isRunning = false).
function boot() {
  initScene3D(document.getElementById('scene3dContainer'))
  resizeScene3D()
  wireControls()
  wireHeader()
  state.pos = computePoint(0)
  state.isRunning = false
  setPlayStatus(false)
  syncUI()
  renderScene3D()
  update()
}

boot()
