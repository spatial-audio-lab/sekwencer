// Silnik audio (na żywo) + render offline (nagrywanie) + enkoder WAV.
import { state, MAX_DUR } from './state.js'
import { computePoint, omega } from './math.js'

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
    distanceModel: 'inverse',
  })
  state.panner.rolloffFactor = 0
  state.filter = ctx.createBiquadFilter()
  state.filter.type = 'lowpass'
  state.filter.frequency.value = 1000
  state.gain = ctx.createGain()
  state.gain.gain.value = 0
  state.filter.connect(state.panner)
  state.panner.connect(state.gain)
  state.gain.connect(ctx.destination)
  buildSource()
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
    try {
      disconnectNode.disconnect()
    } catch (e) {}
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
    sourceNode = state.filter
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
function oscSample(type, ph) {
  const x = ph - Math.floor(ph)
  switch (type) {
    case 'sine':
      return Math.sin(2 * Math.PI * x)
    case 'square':
      return x < 0.5 ? 1 : -1
    case 'sawtooth':
      return 2 * x - 1
    case 'triangle':
    default:
      return 4 * Math.abs(x - 0.5) - 1
  }
}

export async function renderBinaural(reps, sr) {
  const dur = reps * ((2 * Math.PI) / omega())
  if (dur > MAX_DUR)
    throw new Error(
      `Nagranie ~${Math.round(dur)} s przekracza limit ${MAX_DUR} s — zmniejsz powtórzenia lub zwiększ prędkość.`,
    )
  const len = Math.max(1, Math.ceil(sr * dur))
  const oac = new OfflineAudioContext(2, len, sr)
  const panner = new PannerNode(oac, {
    panningModel: 'HRTF',
    distanceModel: 'inverse',
  })
  panner.rolloffFactor = 0
  const gain = oac.createGain()
  gain.gain.value = 0.5
  let src
  if (state.mode === 'file' && state.buffer) {
    src = oac.createBufferSource()
    src.buffer = state.buffer
    src.loop = true
    src.connect(panner)
  } else {
    const o = oac.createOscillator()
    o.type = state.waveform
    o.frequency.value = 140
    const f = oac.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 1000
    o.connect(f)
    f.connect(panner)
    src = o
  }
  panner.connect(gain)
  gain.connect(oac.destination)
  const step = 1 / 200
  for (let ts = 0; ts <= dur; ts += step) {
    const t = state.direction * omega() * ts
    const p = computePoint(t)
    panner.positionX.setValueAtTime(p.x, ts)
    panner.positionY.setValueAtTime(p.y, ts)
    panner.positionZ.setValueAtTime(p.z, ts)
  }
  src.start(0)
  const rb = await oac.startRendering()
  return [rb.getChannelData(0), rb.getChannelData(1)]
}

export async function renderAmbix(reps, sr) {
  const dur = reps * ((2 * Math.PI) / omega())
  if (dur > MAX_DUR)
    throw new Error(
      `Nagranie ~${Math.round(dur)} s przekracza limit ${MAX_DUR} s — zmniejsz powtórzenia lub zwiększ prędkość.`,
    )
  const N = Math.max(1, Math.ceil(sr * dur))
  const mono = new Float32Array(N)
  if (state.mode === 'file' && state.buffer) {
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
      mono[i] = (s / chN) * 0.9
    }
  } else {
    const freq = 140
    for (let i = 0; i < N; i++)
      mono[i] = oscSample(state.waveform, (i / sr) * freq) * 0.5
  }
  const W = new Float32Array(N)
  const Y = new Float32Array(N)
  const Z = new Float32Array(N)
  const X = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const ts = i / sr
    const t = state.direction * omega() * ts
    const p = computePoint(t)
    let ax = -p.z
    let ay = -p.x
    let az = p.y
    const len = Math.hypot(ax, ay, az) || 1
    ax /= len
    ay /= len
    az /= len
    const s = mono[i]
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
