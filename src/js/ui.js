// Wiring DOM: rysowanie radaru, synchronizacja UI, kontrolki, wczytywanie pliku,
// nagrywanie. Przeniesione 1:1 z poprzedniego index.html + integracja z nowym
// paskiem v3.1 (kropka statusu zamiast tekstu "Audio Context: Idle/Running").
import { state, VIEW_RANGE } from './state.js'
import { computePoint } from './math.js'
import { ensureAudio, buildSource, renderBinaural, renderAmbix, encodeWavFloat32 } from './audio.js'
import { setHeaderPlaying } from './header.js'

// ===== PĘTLA WIZUALIZACJI (niezależna od audio) =====
export function update() {
  if (state.isRunning) {
    state.time += 0.016 * state.speed * state.direction
    state.pos = computePoint(state.time)
    if (state.ctx && state.panner) {
      const now = state.ctx.currentTime
      state.panner.positionX.setTargetAtTime(state.pos.x, now, 0.05)
      state.panner.positionY.setTargetAtTime(state.pos.y, now, 0.05)
      state.panner.positionZ.setTargetAtTime(state.pos.z, now, 0.05)
    }
    draw()
    syncUI()
  }
  requestAnimationFrame(update)
}

// ===== RYSOWANIE =====
export function draw() {
  const ctx = state.canvasCtx
  if (!ctx) return
  const w = state.canvas.width
  const h = state.canvas.height
  const cx = w / 2
  const cy = h / 2
  const zoom = Math.min(w, h) / 2 / VIEW_RANGE

  ctx.clearRect(0, 0, w, h)

  // Osie
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, cy)
  ctx.lineTo(w, cy)
  ctx.moveTo(cx, 0)
  ctx.lineTo(cx, h)
  ctx.stroke()

  // Pierścienie referencyjne 20/40/60/80 m
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  for (let r = 20; r <= 80; r += 20) {
    ctx.beginPath()
    ctx.arc(cx, cy, r * zoom, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Podgląd trajektorii (Ghost Path)
  ctx.beginPath()
  ctx.strokeStyle = 'rgba(255, 171, 0, 0.22)'
  ctx.setLineDash([5, 5])
  for (let i = 0; i <= Math.PI * 2 + 0.05; i += 0.05) {
    const p = computePoint(i)
    const px = cx + p.x * zoom
    const pz = cy + p.z * zoom
    if (i === 0) ctx.moveTo(px, pz)
    else ctx.lineTo(px, pz)
  }
  ctx.stroke()
  ctx.setLineDash([])

  // Punkt dźwięku (promień lekko zależny od wysokości Y)
  const tx = cx + state.pos.x * zoom
  const tz = cy + state.pos.z * zoom
  const rad = Math.max(4, 9 + Math.max(-5, Math.min(7, state.pos.y * 0.08)))
  ctx.shadowBlur = 20
  ctx.shadowColor = '#FFAB00'
  ctx.fillStyle = '#FFAB00'
  ctx.beginPath()
  ctx.arc(tx, tz, rad, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0

  // Wskaźnik wysokości (Y): -60 m..60 m -> 0..100%
  const elev = document.getElementById('elevationIndicator')
  const percent = ((state.pos.y + 60) / 120) * 100
  elev.style.bottom = `${Math.max(0, Math.min(100, percent))}%`
  document.getElementById('heightLabel').textContent = `${state.pos.y.toFixed(1)}m`
}

export function syncUI() {
  document.getElementById('sizeVal').textContent = state.size
  document.getElementById('rotXVal').textContent = state.rotX
  document.getElementById('rotYVal').textContent = state.rotY
  document.getElementById('debugCoords').textContent =
    `XYZ: [${state.pos.x.toFixed(2)}, ${state.pos.y.toFixed(2)}, ${state.pos.z.toFixed(2)}]`
}

// ===== STATUS ODTWARZANIA =====
// Poprzednio aktualizował tekst "Audio Context: Idle/Running" w starym nagłówku.
// Wg decyzji z 18.08 (zasady-zgodnosci-z-manifestem.md, sekcja 4a) pasek v3.1 pokazuje
// tylko pulsującą kropkę — patrz header.js. Mały wskaźnik przy "Geometria Ruchu"
// (audioIndicator) i sam przycisk ODTWÓRZ/WYCISZ nadal niosą czytelny stan w treści apki.
export function setPlayStatus(playing) {
  setHeaderPlaying(playing)
}

// ===== ROZMIAR RADARU (responsywny) =====
export function resizeRadar() {
  const c = state.canvas
  if (!c) return
  const panel = c.closest('.glass')
  const availH = (panel ? panel.clientHeight : 600) - 120
  const availW = (panel ? panel.clientWidth : 600) - 170
  const size = Math.max(280, Math.min(availW, availH))
  const dpr = window.devicePixelRatio || 1
  c.style.width = size + 'px'
  c.style.height = size + 'px'
  c.width = Math.round(size * dpr)
  c.height = Math.round(size * dpr)
}

// ===== KONTROLKI =====
export function wireControls() {
  document.getElementById('shapeSelect').onchange = (e) => (state.shape = e.target.value)
  document.getElementById('waveformSelect').onchange = (e) => {
    state.waveform = e.target.value
    if (state.mode === 'synth') buildSource()
  }
  document.getElementById('speedRange').oninput = (e) => {
    state.speed = parseFloat(e.target.value)
    document.getElementById('speedVal').textContent = state.speed.toFixed(1)
  }
  document.getElementById('sizeRange').oninput = (e) => (state.size = parseInt(e.target.value))
  document.getElementById('rotXRange').oninput = (e) => (state.rotX = parseInt(e.target.value))
  document.getElementById('rotYRange').oninput = (e) => (state.rotY = parseInt(e.target.value))
  document.getElementById('repsRange').oninput = (e) => {
    state.reps = parseInt(e.target.value)
    document.getElementById('repsVal').textContent = state.reps
  }
  document.getElementById('recFormat').onchange = (e) => (state.recFormat = e.target.value)

  document.getElementById('btnDirection').onclick = (e) => {
    state.direction *= -1
    e.target.textContent = state.direction === 1 ? 'Zgodnie z wskaz.' : 'Przeciwnie'
  }

  // ODTWÓRZ / WYCISZ (zmiana barwy + napisu; lazy-init audio)
  const btnToggle = document.getElementById('btnToggleAudio')
  btnToggle.onclick = async () => {
    await ensureAudio()
    state.audioActive = !state.audioActive
    state.gain.gain.setTargetAtTime(state.audioActive ? 0.35 : 0, state.ctx.currentTime, 0.1)
    if (state.audioActive) {
      btnToggle.textContent = 'WYCISZ'
      btnToggle.classList.remove('is-idle')
      btnToggle.classList.add('is-active')
    } else {
      btnToggle.textContent = 'ODTWÓRZ'
      btnToggle.classList.remove('is-active')
      btnToggle.classList.add('is-idle')
    }
    const ind = document.getElementById('audioIndicator')
    ind.style.background = state.audioActive ? '#00E5CC' : '#9C9890'
    ind.style.boxShadow = state.audioActive ? '0 0 10px rgba(0,229,204,0.5)' : 'none'
    setPlayStatus(state.audioActive)
  }

  // ===== WCZYTYWANIE WŁASNEGO DŹWIĘKU (pętla) =====
  const fileInput = document.getElementById('fileInput')
  document.getElementById('btnLoadFile').onclick = () => fileInput.click()
  fileInput.onchange = async (e) => {
    const f = e.target.files[0]
    if (!f) return
    const info = document.getElementById('srcInfo')
    info.textContent = 'Dekodowanie…'
    try {
      await ensureAudio()
      const arr = await f.arrayBuffer()
      state.buffer = await state.ctx.decodeAudioData(arr)
      state.mode = 'file'
      state.fileName = f.name
      buildSource()
      info.innerHTML = `Źródło: <span style="color:#00E5CC">${f.name}</span> (pętla)`
      document.getElementById('btnClearFile').style.display = 'inline-block'
    } catch (err) {
      state.mode = 'synth'
      info.innerHTML = `<span style="color:#FF3355">Nie udało się wczytać/zdekodować pliku</span>`
    }
  }
  document.getElementById('btnClearFile').onclick = () => {
    state.mode = 'synth'
    state.buffer = null
    state.fileName = ''
    if (state.ctx) buildSource()
    document.getElementById('srcInfo').textContent = 'Źródło: synteza (oscylator)'
    document.getElementById('btnClearFile').style.display = 'none'
  }

  // ===== NAGRYWANIE =====
  const btnRecord = document.getElementById('btnRecord')
  btnRecord.onclick = async () => {
    const status = document.getElementById('recStatus')
    const sr = 48000
    const fmt = state.recFormat || 'binaural'
    const prev = btnRecord.innerHTML
    btnRecord.disabled = true
    btnRecord.innerHTML = '<span style="color:#FF3355">●</span> Renderowanie…'
    status.style.color = '#FFAB00'
    status.textContent = `Render ${state.reps}× figury (${fmt === 'ambix' ? 'AmbiX 4ch' : 'binaural stereo'})…`
    try {
      await ensureAudio()
      let channels, suffix
      if (fmt === 'ambix') {
        channels = await renderAmbix(state.reps, sr)
        suffix = 'ambix-foa'
      } else {
        channels = await renderBinaural(state.reps, sr)
        suffix = 'binaural'
      }
      const blob = encodeWavFloat32(channels, sr)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const base = state.mode === 'file' && state.fileName ? state.fileName.replace(/\.[^.]+$/, '') : state.shape
      a.href = url
      a.download = `sekwencer_${base}_${suffix}_${state.reps}x.wav`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      const mb = (blob.size / 1048576).toFixed(1)
      status.style.color = '#00E5CC'
      status.textContent = `Zapisano: ${a.download} (${mb} MB, 48 kHz / 32-bit float)`
    } catch (err) {
      status.style.color = '#FF3355'
      status.textContent = 'Błąd: ' + (err && err.message ? err.message : err)
    } finally {
      btnRecord.disabled = false
      btnRecord.innerHTML = prev
    }
  }

  window.addEventListener('resize', resizeRadar)
}
