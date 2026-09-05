// Matematyka trajektorii — przeniesione 1:1 z poprzedniego index.html.
import { state, DISTANCE_CONFIG } from './state.js'

export const Math3D = {
  rotateX(p, angle) {
    const rad = (angle * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    return { x: p.x, y: p.y * cos - p.z * sin, z: p.y * sin + p.z * cos }
  },
  rotateY(p, angle) {
    const rad = (angle * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    return { x: p.x * cos + p.z * sin, y: p.y, z: -p.x * sin + p.z * cos }
  },
}

export const Trajectories = {
  circle: (t) => ({ x: Math.cos(t), y: 0, z: Math.sin(t) }),
  square: (t) => {
    const cycle = (t % (Math.PI * 2)) / (Math.PI * 2)
    const progress = (cycle < 0 ? cycle + 1 : cycle) * 4
    const side = Math.floor(progress)
    const lt = progress - side
    if (side === 0) return { x: -1 + lt * 2, y: 0, z: -1 }
    if (side === 1) return { x: 1, y: 0, z: -1 + lt * 2 }
    if (side === 2) return { x: 1 - lt * 2, y: 0, z: 1 }
    return { x: -1, y: 0, z: 1 - lt * 2 }
  },
  lissajous: (t) => ({
    x: Math.sin(3 * t),
    y: Math.sin(t),
    z: Math.sin(2 * t + Math.PI / 4),
  }),
  eight: (t) => {
    const d = 1 + Math.sin(t) ** 2
    return { x: Math.cos(t) / d, y: 0, z: (Math.sin(t) * Math.cos(t)) / d }
  },
  helix: (t) => ({ x: Math.cos(t), y: Math.sin(t * 0.4), z: Math.sin(t) }),
}

// Wspólny punkt trajektorii (na żywo i przy nagrywaniu offline)
export function computePoint(t) {
  let p = Trajectories[state.shape](t)
  p = { x: p.x * state.size, y: p.y * state.size, z: p.z * state.size }
  p = Math3D.rotateX(p, state.rotX)
  p = Math3D.rotateY(p, state.rotY)
  return p
}

// Lokalna "prędkość" parametru trajektorii — moduł pochodnej computePoint względem t,
// tj. ile jednostek długości krzywej odpowiada jednostce parametru t w punkcie t.
// Używane, żeby prędkość ze suwaka (m/s) była prędkością liniową WZDŁUŻ krzywej,
// a nie tylko stałą prędkością kątową — bez tego figury o nierównym rozkładzie
// krzywizny (kwadrat, lemniskata, węzeł Lissajous) przyspieszałyby/zwalniałyby
// pozornie w miejscach, gdzie krzywa jest bardziej stroma.
export function trajectoryMetric(t) {
  const epsilon = 0.001
  const a = computePoint(t)
  const b = computePoint(t + epsilon)

  return Math.max(
    Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / epsilon,
    0.001,
  )
}

// JEDNA implementacja całkowania parametru t w czasie, współdzielona przez podgląd
// na żywo (ui.js#update) i eksport offline (audio.js#renderBinaural/renderAmbix).
// Zgłoszenie 18.08 (Oskar): eksportowany WAV musi brzmieć tak samo jak podgląd na
// żywo — dwie osobne implementacje tej samej wielkości fizycznej to dokładnie błąd
// "v9 Sfery" (dwie niezależne trajektorie rozjeżdżające się cicho), więc obie strony
// wołają tę samą funkcję zamiast liczyć czas przez omega().
export function stepTrajectory(t, dt, speed, direction) {
  if (speed <= 0) return t
  const metric = trajectoryMetric(t)
  return t + direction * (speed * dt) / metric
}

// Model tłumienia odległości (inverse) — JEDNA implementacja współdzielona
// między PannerNode i eksportem AmbiX (Zasada 2: jedna wielkość liczona raz).
//
// maxDistance NIE występuje w tym wzorze i to nie jest przeoczenie: w Web Audio
// przycina odległość wyłącznie model 'linear'. Zmierzone na prawdziwym PannerNode
// (HRTF, refDistance 5, rolloff 0.35, kierunek stały, RMS znormalizowany do 5 m):
//   150 m -> 0.08969, a wzór z przycięciem twierdziłby 0.13072
//   300 m -> 0.04619, a wzór z przycięciem twierdziłby 0.13072
// Dziś to nieosiągalne (najdalszy punkt to narożnik kwadratu przy rozmiarze 55,
// czyli 77,8 m), ale przycięcie wróciłoby jako rozjazd torów przy większej figurze.
// maxDistance zostaje w DISTANCE_CONFIG, bo potrzebuje go sam PannerNode.
export function calculateDistanceGain(dist, config = DISTANCE_CONFIG) {
  const d = Math.max(config.refDistance, dist)
  return config.refDistance / (config.refDistance + config.rolloffFactor * (d - config.refDistance))
}
