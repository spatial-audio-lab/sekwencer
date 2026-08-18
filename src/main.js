import './styles/main.css'
import { state } from './js/state.js'
import { update, resizeRadar, wireControls, setPlayStatus } from './js/ui.js'
import { wireHeader } from './js/header.js'

// ===== START (bez ekranu startowego) =====
// Przeniesione 1:1: pętla rysowania startuje na load, AudioContext leniwie
// przy pierwszym geście (ensureAudio() w ui.js).
function boot() {
  state.canvas = document.getElementById('radarCanvas')
  state.canvasCtx = state.canvas.getContext('2d')
  resizeRadar()
  wireControls()
  wireHeader()
  state.isRunning = true
  setPlayStatus(false)
  update()
}

boot()
