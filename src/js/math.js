// Matematyka trajektorii — przeniesione 1:1 z poprzedniego index.html.
import { state } from './state.js'

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

// Prędkość kątowa figury [rad/s] — spójna z pętlą na żywo (0.016*speed / klatkę @60fps)
export function omega() {
  return 0.96 * state.speed
}
