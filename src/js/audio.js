// Silnik audio (na żywo) + render offline (nagrywanie) + enkoder WAV.
import { state, MAX_DUR, DISTANCE_CONFIG, SYNTH_FILTER_CONFIG, EXPORT_LEVELS } from './state.js'
import { computePoint, stepTrajectory, calculateDistanceGain } from './math.js'

const SOURCE_FADE_IN = 0.02
const SOURCE_FADE_OUT = 0.025
const SILENCE = 0.0001

// ===== SILNIK AUDIO (na żywo) =====
export async function ensureAudio() {
  if (state.ctx) {
    if (state.ctx.state === 'suspended') await state.ctx.resume()
    return
  }
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  state.ctx = ctx
  state.panner = new PannerNode(ctx, {
    panningModel: 'HRTF',
    distanceModel: DISTANCE_CONFIG.model,
  })
  state.panner.refDistance = DISTANCE_CONFIG.refDistance
  state.panner.maxDistance = DISTANCE_CONFIG.maxDistance
  state.panner.rolloffFactor = DISTANCE_CONFIG.rolloffFactor
  state.filter = ctx.createBiquadFilter()
  state.filter.type = SYNTH_FILTER_CONFIG.type
  state.filter.frequency.value = SYNTH_FILTER_CONFIG.frequency
  state.gain = ctx.createGain()
  state.gain.gain.value = 0
  state.filter.connect(state.panner)
  state.panner.connect(state.gain)
  state.gain.connect(ctx.destination)
  buildSource()

  // Hak diagnostyczny dla harnessu Playwright (scripts/verify-scene3d.mjs) — pozwala
  // zmierzyć realny poziom sygnału po pannerze (AnalyserNode), nie tylko sprawdzić czy
  // kod się wykonał bez wyjątku. Analogiczne do window.__orbita3d w scene3d.js.
  window.__orbitaAudio = state
}

function stopSource(source, sourceGain, disconnectNode) {
  if (!source || !sourceGain || !state.ctx) return

  const now = state.ctx.currentTime
  sourceGain.gain.cancelScheduledValues(now)
  sourceGain.gain.setValueAtTime(SILENCE, now)
  sourceGain.gain.exponentialRampToValueAtTime(SILENCE, now + SOURCE_FADE_OUT)

  const cleanupAt = now + SOURCE_FADE_OUT + 0.01
  try {
    source.stop(cleanupAt)
  } catch (e) {}

  window.setTimeout(() => {
    try {
      source.disconnect()
    } catch (e) {}
    try {
      sourceGain.disconnect()
    } catch (e) {}
    // disconnectNode to jednorazowy węzeł utworzony dla TEGO źródła (np. bufferSource
    // w trybie pliku) — NIGDY współdzielony węzeł silnika (state.filter/state.panner).
    // W trybie syntezy nie ma takiego jednorazowego węzła (filtr jest trwale spięty
    // z pannerem w ensureAudio()), więc disconnectNode jest wtedy celowo null.
    if (disconnectNode) {
      try {
        disconnectNode.disconnect()
      } catch (e) {}
    }
  }, Math.ceil((SOURCE_FADE_OUT + 0.02) * 1000))
}

// Buduje/odbudowuje źródło zależnie od trybu (synteza / wczytany plik).
// Każde źródło ma własny gain, aby jego wymiana nie powodowała nieciągłości fali.
export function buildSource() {
  if (!state.ctx) return

  if (state.srcNode) {
    stopSource(state.srcNode, state.sourceGain, state.sourceNode)
    state.srcNode = null
    state.sourceGain = null
    state.sourceNode = null
  }

  const now = state.ctx.currentTime
  const sourceGain = state.ctx.createGain()
  sourceGain.gain.setValueAtTime(SILENCE, now)

  let src
  let sourceNode
  if (state.mode === 'file' && state.buffer) {
    src = state.ctx.createBufferSource()
    src.buffer = state.buffer
    src.loop = true
    sourceNode = src
    sourceGain.connect(state.panner)
  } else {
    src = state.ctx.createOscillator()
    src.type = state.waveform
    src.frequency.value = 140
    // state.filter jest węzłem WSPÓŁDZIELONYM, trwale spiętym z pannerem w
    // ensureAudio() — nie wolno go traktować jako jednorazowy węzeł do rozłączenia
    // (patrz komentarz w stopSource). Bug naprawiony 18.08: poprzednio sourceNode
    // wskazywał na state.filter, więc zmiana kształtu fali w trakcie odtwarzania
    // rozłączała filtr od pannera po fade-out starego źródła, wyciszając cały dźwięk.
    sourceNode = null
    sourceGain.connect(state.filter)
  }

  src.connect(sourceGain)
  src.start(now)
  sourceGain.gain.exponentialRampToValueAtTime(1, now + SOURCE_FADE_IN)

  state.srcNode = src
  state.sourceGain = sourceGain
  state.sourceNode = sourceNode
}

// ===== NAGRYWANIE =====
// Symuluje przebieg parametru t w czasie DOKŁADNIE tym samym krokiem (stepTrajectory
// z math.js), którego używa podgląd na żywo w ui.js#update — zapewnia, że eksportowany
// WAV brzmi identycznie jak to, co słychać podczas odtwarzania, także dla figur
// o nierównym rozkładzie krzywizny (kwadrat, lemniskata, węzeł Lissajous), gdzie stała
// prędkość kątowa (dawne omega()) dawałaby inny przebieg niż stała prędkość liniowa.
// totalAngle to sumaryczny kąt (parametr t) do przebycia dla `reps` powtórzeń figury;
// maxSteps to twarde zabezpieczenie, gdyby prędkość=0 (wtedy stepTrajectory nie
// przesuwa t) — pętla i tak zatrzyma się po czasie odpowiadającym ~1.2×MAX_DUR,
// a poniższy check `dur > MAX_DUR` zgłosi ten sam błąd co poprzednio przy prędkości 0.
function buildTimeSchedule(totalAngle, dtStep) {
  if (state.speed <= 0) {
    throw new Error('Prędkość musi być większa od 0 m/s, aby wygenerować nagranie w ruchu.')
  }
  const maxSteps = Math.ceil((MAX_DUR * 1.2) / dtStep)
  const ts = [0]
  const ta = [0]
  let t = 0
  while (Math.abs(t) < totalAngle && ts.length < maxSteps) {
    t = stepTrajectory(t, dtStep, state.speed, state.direction)
    ts.push(ts[ts.length - 1] + dtStep)
    ta.push(t)
  }
  return { ts, ta, dur: ts[ts.length - 1] }
}

export async function renderBinaural(reps, sr) {
  const schedule = buildTimeSchedule(Math.PI * 2 * reps, 1 / 200)
  const dur = schedule.dur
  if (dur > MAX_DUR)
    throw new Error(
      `Nagranie ~${Math.round(dur)} s przekracza limit ${MAX_DUR} s — zmniejsz powtórzenia lub zwiększ prędkość.`,
    )
  const len = Math.max(1, Math.ceil(sr * dur))
  const oac = new OfflineAudioContext(2, len, sr)
  const panner = new PannerNode(oac, {
    panningModel: 'HRTF',
    distanceModel: DISTANCE_CONFIG.model,
  })
  panner.refDistance = DISTANCE_CONFIG.refDistance
  panner.maxDistance = DISTANCE_CONFIG.maxDistance
  panner.rolloffFactor = DISTANCE_CONFIG.rolloffFactor
  const gain = oac.createGain()
  gain.gain.value = EXPORT_LEVELS.synthGain
  let src
  if (state.mode === 'file' && state.buffer) {
    gain.gain.value = EXPORT_LEVELS.fileGain
    src = oac.createBufferSource()
    src.buffer = state.buffer
    src.loop = true
    src.connect(panner)
  } else {
    const o = oac.createOscillator()
    o.type = state.waveform
    o.frequency.value = 140
    const f = oac.createBiquadFilter()
    f.type = SYNTH_FILTER_CONFIG.type
    f.frequency.value = SYNTH_FILTER_CONFIG.frequency
    o.connect(f)
    f.connect(panner)
    src = o
  }
  panner.connect(gain)
  gain.connect(oac.destination)
  for (let i = 0; i < schedule.ts.length; i++) {
    const p = computePoint(schedule.ta[i])
    panner.positionX.setValueAtTime(p.x, schedule.ts[i])
    panner.positionY.setValueAtTime(p.y, schedule.ts[i])
    panner.positionZ.setValueAtTime(p.z, schedule.ts[i])
  }
  src.start(0)
  const rb = await oac.startRendering()
  return [rb.getChannelData(0), rb.getChannelData(1)]
}

export async function renderAmbix(reps, sr) {
  const schedule = buildTimeSchedule(Math.PI * 2 * reps, 1 / 200)
  const dur = schedule.dur
  if (dur > MAX_DUR)
    throw new Error(
      `Nagranie ~${Math.round(dur)} s przekracza limit ${MAX_DUR} s — zmniejsz powtórzenia lub zwiększ prędkość.`,
    )
  const N = Math.max(1, Math.ceil(sr * dur))
  // Wskaźnik idzie w górę monotonicznie razem z i (obie sekwencje czasu rosną), więc
  // odczyt parametru t dla każdej próbki audio jest liniową interpolacją w harmonogramie
  // zbudowanym wyżej (krok 1/200 s) zamiast osobnego przeliczania — O(N), bez utraty
  // precyzji zauważalnej przy tej rozdzielczości.
  let segIdx = 0
  const paramAt = (time) => {
    while (segIdx < schedule.ts.length - 2 && schedule.ts[segIdx + 1] <= time) segIdx++
    const t0 = schedule.ts[segIdx]
    const t1 = schedule.ts[segIdx + 1]
    const frac = t1 > t0 ? Math.min(1, Math.max(0, (time - t0) / (t1 - t0))) : 0
    return schedule.ta[segIdx] + (schedule.ta[segIdx + 1] - schedule.ta[segIdx]) * frac
  }

  let mono
  if (state.mode === 'file' && state.buffer) {
    mono = new Float32Array(N)
    const b = state.buffer
    const srcSR = b.sampleRate
    const chN = b.numberOfChannels
    const L = b.length
    const chans = []
    for (let c = 0; c < chN; c++) chans.push(b.getChannelData(c))
    for (let i = 0; i < N; i++) {
      const idx = Math.floor((i * srcSR) / sr) % L
      let s = 0
      for (let c = 0; c < chN; c++) s += chans[c][idx]
      // Zrównany poziom z renderBinaural (EXPORT_LEVELS.fileGain = 0.5)
      mono[i] = (s / chN) * EXPORT_LEVELS.fileGain
    }
  } else {
    // Generowanie syntezy przez OfflineAudioContext z filtrem SYNTH_FILTER_CONFIG (1000 Hz lowpass)
    // i wzmocnieniem EXPORT_LEVELS.synthGain — identyczny tor i barwa co w renderBinaural i na żywo.
    const synthCtx = new OfflineAudioContext(1, N, sr)
    const o = synthCtx.createOscillator()
    o.type = state.waveform
    o.frequency.value = 140
    const f = synthCtx.createBiquadFilter()
    f.type = SYNTH_FILTER_CONFIG.type
    f.frequency.value = SYNTH_FILTER_CONFIG.frequency
    const g = synthCtx.createGain()
    g.gain.value = EXPORT_LEVELS.synthGain
    o.connect(f)
    f.connect(g)
    g.connect(synthCtx.destination)
    o.start(0)
    const rendered = await synthCtx.startRendering()
    mono = rendered.getChannelData(0)
  }

  const W = new Float32Array(N)
  const Y = new Float32Array(N)
  const Z = new Float32Array(N)
  const X = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const ts = i / sr
    const t = paramAt(ts)
    const p = computePoint(t)
    let ax = -p.z
    let ay = -p.x
    let az = p.y
    const len = Math.hypot(ax, ay, az) || 1
    ax /= len
    ay /= len
    az /= len
    // Tłumienie odległości wspólnym modelem z PannerNode (DISTANCE_CONFIG)
    const distGain = calculateDistanceGain(len)
    const s = mono[i] * distGain
    W[i] = s
    Y[i] = s * ay
    Z[i] = s * az
    X[i] = s * ax
  }
  return [W, Y, Z, X]
}

export function encodeWavFloat32(channels, sr) {
  const numCh = channels.length
  const N = channels[0].length
  const blockAlign = numCh * 4
  const dataLen = N * blockAlign
  const buf = new ArrayBuffer(44 + dataLen)
  const dv = new DataView(buf)
  const ws = (o, s) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i))
  }
  ws(0, 'RIFF')
  dv.setUint32(4, 36 + dataLen, true)
  ws(8, 'WAVE')
  ws(12, 'fmt ')
  dv.setUint32(16, 16, true)
  dv.setUint16(20, 3, true)
  dv.setUint16(22, numCh, true)
  dv.setUint32(24, sr, true)
  dv.setUint32(28, sr * blockAlign, true)
  dv.setUint16(32, blockAlign, true)
  dv.setUint16(34, 32, true)
  ws(36, 'data')
  dv.setUint32(40, dataLen, true)
  let off = 44
  for (let i = 0; i < N; i++)
    for (let c = 0; c < numCh; c++) {
      dv.setFloat32(off, channels[c][i], true)
      off += 4
    }
  return new Blob([buf], { type: 'audio/wav' })
}

// Hak diagnostyczny dla harnessu Playwright (scripts/verify-quickfixes.mjs) — pozwala
// wprost wywołać eksport offline (bez klikania UI/przechwytywania Blob URL), żeby
// numerycznie sprawdzić, że renderBinaural/renderAmbix liczą czas tą samą funkcją
// (stepTrajectory) co podgląd na żywo, a nie starą stałą prędkością kątową.
window.__orbitaExport = { renderBinaural, renderAmbix }
