// Wiring DOM: rysowanie radaru, synchronizacja UI, kontrolki, wczytywanie pliku,
// nagrywanie. Przeniesione 1:1 z poprzedniego index.html + integracja z nowym
// paskiem v3.1 (kropka statusu zamiast tekstu "Audio Context: Idle/Running").
import { state } from './state.js'
import { computePoint, stepTrajectory } from './math.js'
import { ensureAudio, buildSource, renderBinaural, renderAmbix, encodeWavFloat32 } from './audio.js'
import { setHeaderPlaying } from './header.js'
import { renderScene3D, resizeScene3D, updateTrajectoryLine, resetCamera } from './scene3d.js'

// Prędkość slidera to metry/sekundę WZDŁUŻ krzywej (nie rad/s) — krok parametru t jest
// dzielony przez lokalną pochodną trajektorii (stepTrajectory w math.js), więc figury
// o nierównym rozkładzie krzywizny (np. lemniskata, węzeł Lissajous) poruszają się ze
// stałą prędkością liniową, a nie tylko stałą prędkością kątową. Ta sama funkcja
// (stepTrajectory) jest też używana przy eksporcie offline w audio.js#renderBinaural/
// renderAmbix, żeby eksportowany WAV brzmiał identycznie jak podgląd na żywo.
function advanceTrajectory(dt) {
  state.time = stepTrajectory(state.time, dt, state.speed, state.direction)
}

// ===== PĘTLA (wizualizacja 3D + audio, jedna wspólna pozycja state.pos) =====
let previousFrameTime = performance.now()

export function update(frameTime = performance.now()) {
  const dt = Math.min((frameTime - previousFrameTime) / 1000, 0.05)
  previousFrameTime = frameTime

  if (state.isRunning) {
    advanceTrajectory(dt)
    state.pos = computePoint(state.time)

    if (state.ctx && state.panner) {
      const now = state.ctx.currentTime
      state.panner.positionX.setTargetAtTime(state.pos.x, now, 0.05)
      state.panner.positionY.setTargetAtTime(state.pos.y, now, 0.05)
      state.panner.positionZ.setTargetAtTime(state.pos.z, now, 0.05)
    }

    renderScene3D()
    syncUI()
  }

  requestAnimationFrame(update)
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

// ===== KONTROLKI =====
export function wireControls() {
  document.getElementById('shapeSelect').onchange = (e) => {
    state.shape = e.target.value
    updateTrajectoryLine()
  }
  document.getElementById('waveformSelect').onchange = (e) => {
    state.waveform = e.target.value
    if (state.mode === 'synth') buildSource()
  }
  document.getElementById('speedRange').oninput = (e) => {
    state.speed = parseFloat(e.target.value)
    document.getElementById('speedVal').textContent = `${state.speed.toFixed(1)} m/s`
  }
  document.getElementById('sizeRange').oninput = (e) => {
    state.size = parseInt(e.target.value)
    updateTrajectoryLine()
  }
  document.getElementById('rotXRange').oninput = (e) => {
    state.rotX = parseInt(e.target.value)
    updateTrajectoryLine()
  }
  document.getElementById('rotYRange').oninput = (e) => {
    state.rotY = parseInt(e.target.value)
    updateTrajectoryLine()
  }
  document.getElementById('repsRange').oninput = (e) => {
    state.reps = parseInt(e.target.value)
    document.getElementById('repsVal').textContent = state.reps
  }
  document.getElementById('recFormat').onchange = (e) => (state.recFormat = e.target.value)

  document.getElementById('btnDirection').onclick = (e) => {
    state.direction *= -1
    e.target.textContent = state.direction === 1 ? 'Zgodnie z wskaz.' : 'Przeciwnie'
  }

  // ===== GŁOŚNOŚĆ =====
  document.getElementById('volumeRange').oninput = (e) => {
    state.volume = parseInt(e.target.value) / 100
    document.getElementById('volumeVal').textContent = e.target.value
    if (state.audioActive && state.ctx && state.gain) {
      state.gain.gain.setTargetAtTime(state.volume, state.ctx.currentTime, 0.05)
    }
  }

  // ODTWÓRZ / ZATRZYMAJ (zmiana barwy + napisu; lazy-init audio)
  const btnToggle = document.getElementById('btnToggleAudio')
  btnToggle.onclick = async () => {
    await ensureAudio()
    state.audioActive = !state.audioActive
    state.gain.gain.setTargetAtTime(state.audioActive ? state.volume : 0, state.ctx.currentTime, 0.1)
    if (state.audioActive) {
      btnToggle.textContent = 'ZATRZYMAJ'
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

  // ===== PRZEŁĄCZNIK RODZAJU ŹRÓDŁA (Synteza / Dźwięk użytkownika) =====
  // Uwaga: to przełącznik WIDOKU paneli — faktyczny state.mode zmienia się
  // dopiero gdy użytkownik wczyta plik (fileInput.onchange) albo go wyczyści
  // (btnClearFile), zgodnie z dotychczasową logiką audio.js/buildSource().
  const srcSynthPanel = document.getElementById('srcSynthPanel')
  const srcFilePanel = document.getElementById('srcFilePanel')
  const btnSrcSynth = document.getElementById('srcModeSynthBtn')
  const btnSrcFile = document.getElementById('srcModeFileBtn')
  function setSourceView(view) {
    const isFile = view === 'file'
    srcSynthPanel.classList.toggle('hidden', isFile)
    srcFilePanel.classList.toggle('hidden', !isFile)
    btnSrcSynth.classList.toggle('is-active', !isFile)
    btnSrcSynth.setAttribute('aria-checked', String(!isFile))
    btnSrcFile.classList.toggle('is-active', isFile)
    btnSrcFile.setAttribute('aria-checked', String(isFile))
  }
  btnSrcSynth.onclick = () => {
    if (state.mode === 'file') document.getElementById('btnClearFile').click()
    setSourceView('synth')
  }
  btnSrcFile.onclick = () => setSourceView('file')

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
      setSourceView('file')
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
    setSourceView('synth')
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

  document.getElementById('btnResetCamera').onclick = () => resetCamera()

  window.addEventListener('resize', resizeScene3D)
}
