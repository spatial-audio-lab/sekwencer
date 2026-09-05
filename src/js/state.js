// Wspólny stan aplikacji — jedno źródło prawdy, importowane przez audio.js/ui.js/main.js.
// Przeniesione 1:1 z poprzedniego jednoplikowego index.html (bez zmian pól ani wartości
// domyślnych) — patrz claude/etap4-sekwencer-generator-trajektorii-plan.md w projekcie Claude.

export const state = {
  ctx: null,
  panner: null,
  gain: null,
  filter: null,
  srcNode: null, // aktualne źródło (oscylator lub bufferSource)
  buffer: null, // wczytany plik audio (AudioBuffer)
  mode: 'synth', // 'synth' | 'file'
  fileName: '',
  recFormat: 'binaural',
  isRunning: false,
  audioActive: false,

  shape: 'circle',
  speed: 5.0,
  direction: 1,
  size: 25,
  rotX: 0,
  rotY: 0,
  waveform: 'triangle',
  volume: 0.35, // 0..1 — mnożnik gain przy odtwarzaniu na żywo (patrz btnToggleAudio / volumeRange w ui.js)
  reps: 2,

  time: 0,
  pos: { x: 0, y: 0, z: 0 },
}

// Promień siatki odniesienia w scenie 3D [m] (scene3d.js). 85 m mieści figurę o skali
// 55 nawet w narożnikach kwadratu (55*sqrt2 ≈ 78 m) — punkt nigdy nie ucieka poza siatkę.
export const VIEW_RANGE = 85
export const MAX_DUR = 180 // limit długości nagrania [s] (ochrona pamięci)

// Wspólne stałe toru audio i eksportu (Zasada 2: jedna wielkość liczona jeden raz)
export const DISTANCE_CONFIG = {
  model: 'inverse',
  refDistance: 5,
  maxDistance: 100,
  rolloffFactor: 0.35,
}

export const SYNTH_FILTER_CONFIG = {
  type: 'lowpass',
  frequency: 1000,
}

export const EXPORT_LEVELS = {
  fileGain: 0.5, // zrównanie trybu pliku: binaural miał 0.5, AmbiX miał 0.9 (+5.1 dB)
  synthGain: 0.5,
}
