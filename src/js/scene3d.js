// Wizualizacja 3D — Etap 2 przebudowy (Three.js + OrbitControls + GridHelper),
// zastępuje dawny radar canvas 2D + suwak wysokości.
//
// Decyzja projektowa (claude/etap4-sekwencer-generator-trajektorii-plan.md, sekcja
// "spójność wizualizacji 3D ze Sferą"): świadomie INNY silnik niż Sfera (Sfera = własna
// matematyka na canvas 2D, model egocentryczny, bez Three.js). Tu: prawdziwy Three.js,
// kamera lata swobodnie wokół sceny (OrbitControls). Spójność jest na poziomie JĘZYKA
// wizualnego, nie kodu: amber = siatka/trajektoria/odczyt pozycji, cyan zarezerwowany
// dla wartości sterowanych (suwaki), zgodnie z regułą manifestu (zasady-zgodnosci-
// z-manifestem.md, sekcja 1).
//
// Pozycja źródła (sourceMesh) używa TEJ SAMEJ wartości state.pos, którą audio.js karmi
// PannerNode — jedna implementacja pozycji, nie dwie niezależne (patrz morał z błędu v9
// Sfery: dwie osobne implementacje tej samej rotacji rozjechały się cicho na tygodnie).

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { computePoint } from './math.js'
import { state, VIEW_RANGE } from './state.js'

const AMBER = 0xffab00
const DIM = 0x9c9890
const BLACK = 0x0a0c08

// Domyslne ustawienie kamery — uzyte przy starcie i przy resetCamera() (przycisk
// "RESET WIDOKU" w index.html, zgloszenie Oskara 18.08: latwo sie zgubic po obrocie,
// potrzebny szybki powrot "na wprost").
const DEFAULT_CAMERA_POS = new THREE.Vector3(95, 70, 135)
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0)

let renderer, scene, camera, controls
let trajectoryLine, sourceMesh, glowSprite, listenerMesh
let container

export function initScene3D(el) {
  container = el
  scene = new THREE.Scene()
  scene.background = new THREE.Color(BLACK)

  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000)
  camera.position.copy(DEFAULT_CAMERA_POS)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  container.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 30
  controls.maxDistance = 420
  controls.target.copy(DEFAULT_TARGET)

  // Siatka odniesienia (płaszczyzna XZ) — amber środek, dim reszta, mocno wyciszona
  // (zasada 0 manifestu: narzędzia = wydajność i minimalizm, nie immersja Huba).
  const grid = new THREE.GridHelper(VIEW_RANGE * 2.6, 22, AMBER, DIM)
  grid.material.transparent = true
  grid.material.opacity = 0.18
  scene.add(grid)

  // Marker słuchacza w początku układu współrzędnych — nieruchomy punkt odniesienia
  // (odpowiednik "TY" w Sferze, inny wizualnie bo inna technologia, ta sama rola).
  // Kształt musi POKAZYWAĆ KIERUNEK "przód" — poprzedni ośmiościan był symetryczny
  // (czytał się jak "kostka" bez orientacji), Oskar zgłosił że łatwo się zgubić na
  // scenie 3D bez wyraźnego punktu odniesienia (18.08). Grupa: spłaszczony walec
  // ("korpus") + stożek ("nos") wskazujący -Z — to konwencja Web Audio: domyślna
  // orientacja AudioListener to (0,0,-1), zgodna z dawnymi etykietami "Przód (-Z)"
  // na starym radarze 2D (Etap 1).
  listenerMesh = new THREE.Group()
  const listenerMat = new THREE.MeshBasicMaterial({ color: DIM, transparent: true, opacity: 0.6 })

  const listenerBody = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 1.2, 20), listenerMat)
  listenerBody.position.y = 0.6
  listenerMesh.add(listenerBody)

  const listenerNose = new THREE.Mesh(new THREE.ConeGeometry(1.3, 4.2, 20), listenerMat)
  // Stożek ma domyślnie wierzchołek w +Y; obrót -90° wokół X przenosi go na -Z
  // (ta sama formuła rotacji co Math3D.rotateX w math.js — sprawdzone: punkt (0,1,0)
  // trafia w (0,0,-1)).
  listenerNose.rotation.x = -Math.PI / 2
  listenerNose.position.y = 0.6
  listenerMesh.add(listenerNose)

  scene.add(listenerMesh)

  // Trajektoria — linia przerywana amber (odpowiednik dawnego "ghost path" na radarze).
  const lineMat = new THREE.LineDashedMaterial({
    color: AMBER,
    dashSize: 2.5,
    gapSize: 1.8,
    transparent: true,
    opacity: 0.55,
  })
  trajectoryLine = new THREE.Line(new THREE.BufferGeometry(), lineMat)
  scene.add(trajectoryLine)

  // Źródło dźwięku — świecąca sfera amber + halo (sprite z gradientem, additive blending).
  sourceMesh = new THREE.Mesh(
    new THREE.SphereGeometry(2.4, 24, 16),
    new THREE.MeshBasicMaterial({ color: AMBER }),
  )
  scene.add(sourceMesh)

  glowSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: AMBER,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  glowSprite.scale.set(16, 16, 1)
  scene.add(glowSprite)

  updateTrajectoryLine()
  resizeScene3D()

  // Hak diagnostyczny dla harnessu Playwright (scripts/verify-scene3d.mjs) — analogicznie
  // do wzorców z innych apek w projekcie (np. przechwytywanie eksportu w Scenie/Sferze).
  // Nie wpływa na działanie apki, tylko odsłania uchwyty do pomiaru.
  window.__orbita3d = { scene, camera, controls, sourceMesh, trajectoryLine, listenerMesh }

  return { scene, camera, renderer, controls }
}

function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,171,0,0.9)')
  g.addColorStop(0.4, 'rgba(255,171,0,0.35)')
  g.addColorStop(1, 'rgba(255,171,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}

// Przebudowuje geometrię trajektorii — wołane przy zmianie kształtu/skali/obrotu
// w wireControls() (ui.js), NIE co klatkę (koszt niepotrzebny, zasada wydajności).
export function updateTrajectoryLine() {
  const pts = []
  const N = 160
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2
    const p = computePoint(t)
    pts.push(new THREE.Vector3(p.x, p.y, p.z))
  }
  trajectoryLine.geometry.dispose()
  trajectoryLine.geometry = new THREE.BufferGeometry().setFromPoints(pts)
  trajectoryLine.computeLineDistances()
}

// Wołane co klatkę z ui.js#update(). Używa state.pos — TEJ SAMEJ wartości, którą tej
// samej klatce dostaje panner audio (patrz update() w ui.js).
export function renderScene3D() {
  if (!renderer) return
  sourceMesh.position.set(state.pos.x, state.pos.y, state.pos.z)
  glowSprite.position.copy(sourceMesh.position)
  controls.update()
  renderer.render(scene, camera)
}

// Przycisk "RESET WIDOKU" (index.html, wołany z ui.js) — wraca kamerę do domyślnego
// ustawienia startowego. Zgłoszenie Oskara 18.08: po obróceniu sceny łatwo stracić
// orientację, potrzebny szybki powrót "na wprost" bez przeładowania strony.
export function resetCamera() {
  if (!camera || !controls) return
  // OrbitControls (patrz node_modules/three/.../OrbitControls.js#update) NIE liczy
  // pozycji kamery prosto z camera.position — trzyma WŁASNY wewnętrzny stan
  // (_sphericalDelta, _panOffset), zebrany z niedawnego przeciągania, i co klatkę
  // DOLICZA go do sferycznych współrzędnych wyliczonych z aktualnej pozycji.
  // Pierwsza próba (samo camera.position.copy() + update()) zostawiała ten stan
  // nietknięty, więc kolejny update() odciągał kamerę z powrotem w stronę gestu
  // sprzed resetu. Wyłączenie enableDamping na czas resetu też nie wystarczało:
  // w gałęzi bez tłumienia update() dolicza CAŁY zalegający delta jednorazowo
  // (zamiast tylko dampingFactor ≈ 8% na klatkę) — w teście dało to WIĘKSZE
  // odchylenie niż poprzednio, nie mniejsze. Właściwe rozwiązanie: wyzerować same
  // te wewnętrzne akumulatory przed update(), tak jak robi to OrbitControls.reset()
  // przy starcie (kiedy są naturalnie zerowe) — patrz też controls._panOffset.
  controls._sphericalDelta.set(0, 0, 0)
  controls._panOffset.set(0, 0, 0)
  camera.position.copy(DEFAULT_CAMERA_POS)
  controls.target.copy(DEFAULT_TARGET)
  controls.update()
}

export function resizeScene3D() {
  if (!renderer || !container) return
  const w = container.clientWidth
  const h = container.clientHeight
  if (w === 0 || h === 0) return
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
