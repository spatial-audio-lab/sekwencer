// Weryfikacja poprawek z tury 18.08 (druga runda, po Etapie 2): distance model panner,
// predkosc arc-length, bug syntezy przy zmianie ksztaltu fali, reset kamery, marker
// sluchacza. Serwuje scripts/render/ (lokalny Tailwind, jak verify-scene3d.mjs).
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getBrowserLaunchOptions } from './harness-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const PORT = 8950

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' }

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0])
  if (urlPath.startsWith('/sekwencer/')) urlPath = urlPath.slice('/sekwencer'.length)
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html'
  const filePath = path.join(root, 'docs', urlPath)
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return }
    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' })
    res.end(data)
  })
})
await new Promise((r) => server.listen(PORT, r))

const browser = await chromium.launch(getBrowserLaunchOptions())
const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 })
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`OK   ${name}`) }
  else { fail++; console.log(`FAIL ${name} ${extra}`) }
}

await page.goto(`http://localhost:${PORT}/sekwencer/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)

// 1. Distance model panneraktora zywego — refDistance/maxDistance/rolloffFactor
await page.click('#btnToggleAudio')
await page.waitForTimeout(200)
const distModel = await page.evaluate(() => {
  const p = window.__orbitaAudio.panner
  return { refDistance: p.refDistance, maxDistance: p.maxDistance, rolloffFactor: p.rolloffFactor }
})
check('panner na zywo: refDistance=5', distModel.refDistance === 5, JSON.stringify(distModel))
check('panner na zywo: maxDistance=100', distModel.maxDistance === 100, JSON.stringify(distModel))
check('panner na zywo: rolloffFactor=0.35', Math.abs(distModel.rolloffFactor - 0.35) < 1e-9, JSON.stringify(distModel))

// 2. BUG SYNTEZY: przelaczanie ksztaltu fali w trakcie odtwarzania nie moze wyciszac dzwieku.
//    Mierzymy realny poziom sygnalu za pannerem (AnalyserNode), nie tylko brak wyjatku.
//    Pomiar czeka na SYGNAL, nie na staly czas. Kontekst audio jest tuz po resume(),
//    wiec pierwszy odczyt analizatora potrafi zwrocic same zera — zmierzone: 1 na 5
//    przebiegow dawalo RMS dokladnie 0 i FAIL, mimo ze aplikacja gra poprawnie.
const levelBefore = await page.evaluate(async () => {
  const st = window.__orbitaAudio
  if (st.ctx.state === 'suspended') await st.ctx.resume()
  const analyser = st.ctx.createAnalyser()
  analyser.fftSize = 2048
  st.gain.connect(analyser)
  window.__testAnalyser = analyser
  const data = new Float32Array(analyser.fftSize)
  const zmierzRms = () => {
    analyser.getFloatTimeDomainData(data)
    return Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length)
  }
  const start = performance.now()
  let rms = 0
  while (performance.now() - start < 2000) {
    await new Promise((r) => setTimeout(r, 50))
    rms = zmierzRms()
    if (rms > 0.001) break
  }
  return { rms, ms: Math.round(performance.now() - start) }
})
check('sygnal obecny PRZED zmiana ksztaltu fali (RMS > 0.001)', levelBefore.rms > 0.001, `RMS=${levelBefore.rms} po ${levelBefore.ms} ms`)
if (levelBefore.ms > 60) console.log(`     sygnal pojawil sie dopiero po ${levelBefore.ms} ms — staly odczyt po 250 ms bywal za wczesny`)

// Zmien ksztalt fali 4x pod rzad (stres-test), poczekaj DLUZEJ niz okno fade-out+cleanup (~45ms)
for (const wf of ['sine', 'square', 'sawtooth', 'triangle']) {
  await page.selectOption('#waveformSelect', wf)
  await page.waitForTimeout(120)
}
await page.waitForTimeout(300)
const levelAfter = await page.evaluate(() => {
  const analyser = window.__testAnalyser
  const data = new Float32Array(analyser.fftSize)
  analyser.getFloatTimeDomainData(data)
  return Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length)
})
check('sygnal WCIAZ obecny PO 4x zmianie ksztaltu fali (RMS > 0.001, nie wyciszony)', levelAfter > 0.001, levelAfter)

// 3. Etykieta predkosci pokazuje m/s
await page.evaluate(() => {
  const el = document.getElementById('speedRange')
  el.value = 2.5
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
const speedText = await page.locator('#speedVal').textContent()
check('etykieta predkosci pokazuje m/s', speedText.includes('m/s'), speedText)

// 4. advanceTrajectory: state.time faktycznie sie zmienia i nie jest NaN po paru klatkach
//    na ksztalcie o nierownej krzywiznie (lemniskata)
await page.selectOption('#shapeSelect', 'eight')
await page.waitForTimeout(500)
const timeCheck = await page.evaluate(() => {
  const txt = document.getElementById('debugCoords').textContent
  return txt
})
check('debugCoords nie zawiera NaN po advanceTrajectory (lemniskata)', !timeCheck.includes('NaN'), timeCheck)

// 5. Marker sluchacza jest grupa (kierunkowy: korpus + nos), nie pojedyncza bryla symetryczna
const listenerInfo = await page.evaluate(() => {
  const l = window.__orbita3d.listenerMesh
  return { isGroup: l.type === 'Group', childCount: l.children.length }
})
check('marker sluchacza to grupa (korpus+nos), nie symetryczna bryla', listenerInfo.isGroup && listenerInfo.childCount === 2, JSON.stringify(listenerInfo))

// 6. Reset kamery: obroc, potem kliknij reset, kamera wraca do pozycji startowej
const camStart = await page.evaluate(() => {
  const c = window.__orbita3d.camera
  return { x: c.position.x, y: c.position.y, z: c.position.z }
})
const box = await page.locator('#scene3dContainer canvas').boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + box.width / 2 + 300, box.y + box.height / 2 + 150, { steps: 15 })
await page.mouse.up()
await page.waitForTimeout(300)
const camAfterDrag = await page.evaluate(() => {
  const c = window.__orbita3d.camera
  return { x: c.position.x, y: c.position.y, z: c.position.z }
})
const dragMoved = Math.hypot(camAfterDrag.x - camStart.x, camAfterDrag.y - camStart.y, camAfterDrag.z - camStart.z) > 1
check('kamera faktycznie zmienila pozycje po przeciagnieciu', dragMoved, JSON.stringify({ camStart, camAfterDrag }))

await page.click('#btnResetCamera')
await page.waitForTimeout(200)
const camAfterReset = await page.evaluate(() => {
  const c = window.__orbita3d.camera
  return { x: c.position.x, y: c.position.y, z: c.position.z }
})
const resetOk = Math.hypot(camAfterReset.x - camStart.x, camAfterReset.y - camStart.y, camAfterReset.z - camStart.z) < 0.01
check('przycisk RESET WIDOKU przywraca dokladnie startowa pozycje kamery', resetOk, JSON.stringify({ camStart, camAfterReset }))

// 7. SYNC EKSPORTU: renderBinaural/renderAmbix musza liczyc czas TA SAMA funkcja
//    (stepTrajectory) co podglad na zywo, nie stara stala predkoscia katowa (omega()).
//    Sprawdzian numeryczny na okregu: dlugosc luku dla `reps` okrazen = reps*2*PI*size,
//    wiec oczekiwany czas eksportu = reps*2*PI*size/speed (dokladny wzor zamkniety,
//    niezalezny od implementacji — dobry test regresji na "czy to naprawde arc-length").
// Sterujemy stanem przez UI (shapeSelect/speedRange/sizeRange), tak jak w pozostalych
// checkach, i wywolujemy eksport przez hak diagnostyczny window.__orbitaExport —
// bez zgadywania nazw zmiennych w zminifikowanym bundlu.
await page.selectOption('#shapeSelect', 'circle')
await page.evaluate(() => {
  const size = document.getElementById('sizeRange')
  size.value = 25
  size.dispatchEvent(new Event('input', { bubbles: true }))
  const speed = document.getElementById('speedRange')
  speed.value = 2 // speedRange max="4" — 5 byloby przycinane przez przegladarke do 4
  speed.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.waitForTimeout(150)
const binauralSync = await page.evaluate(async () => {
  const sr = 8000 // niski sr — szybszy render offline, dlugosc w sekundach i tak sie zgadza
  const reps = 2
  const [L] = await window.__orbitaExport.renderBinaural(reps, sr)
  const actualDur = L.length / sr
  const size = 25, speed = 2
  const expectedDur = (reps * 2 * Math.PI * size) / speed
  return { actualDur, expectedDur, N: L.length, hasNaN: L.some((v) => !Number.isFinite(v)) }
})
check(
  'eksport binaural: czas trwania = reps*2*PI*size/speed (arc-length, nie omega())',
  Math.abs(binauralSync.actualDur - binauralSync.expectedDur) < 0.5 && !binauralSync.hasNaN,
  JSON.stringify(binauralSync),
)

const ambixSync = await page.evaluate(async () => {
  const sr = 8000
  const reps = 2
  const [W] = await window.__orbitaExport.renderAmbix(reps, sr)
  const actualDur = W.length / sr
  const size = 25, speed = 2
  const expectedDur = (reps * 2 * Math.PI * size) / speed
  return { actualDur, expectedDur, N: W.length, hasNaN: W.some((v) => !Number.isFinite(v)) }
})
check(
  'eksport ambix: czas trwania = reps*2*PI*size/speed (arc-length, nie omega())',
  Math.abs(ambixSync.actualDur - ambixSync.expectedDur) < 0.5 && !ambixSync.hasNaN,
  JSON.stringify(ambixSync),
)

// 8. NIEZMIENNIK ODLEGŁOŚCI: Stosunek RMS AmbiX do Binaural musi być taki sam
//    dla źródła bliskiego (R=5) i dalekiego (R=35) — sprawdza, że oba tory dzielą
//    tę samą krzywą tłumienia (DISTANCE_CONFIG, inverse).
const distRatioCheck = await page.evaluate(async () => {
  function rms(arr) {
    let s = 0
    for (let i = 0; i < arr.length; i++) s += arr[i] * arr[i]
    return Math.sqrt(s / arr.length)
  }

  const sr = 8000
  const sizeInput = document.getElementById('sizeRange')
  const shapeInput = document.getElementById('shapeSelect')
  shapeInput.value = 'circle'
  shapeInput.dispatchEvent(new Event('change', { bubbles: true }))

  // Blisko (R=5 m)
  sizeInput.value = 5
  sizeInput.dispatchEvent(new Event('input', { bubbles: true }))
  const [L5, R5] = await window.__orbitaExport.renderBinaural(1, sr)
  const [W5] = await window.__orbitaExport.renderAmbix(1, sr)
  const rmsBin5 = Math.sqrt((rms(L5) ** 2 + rms(R5) ** 2) / 2)
  const rmsAmbi5 = rms(W5)
  const ratio5 = rmsAmbi5 / rmsBin5

  // Daleko (R=35 m)
  sizeInput.value = 35
  sizeInput.dispatchEvent(new Event('input', { bubbles: true }))
  const [L35, R35] = await window.__orbitaExport.renderBinaural(1, sr)
  const [W35] = await window.__orbitaExport.renderAmbix(1, sr)
  const rmsBin35 = Math.sqrt((rms(L35) ** 2 + rms(R35) ** 2) / 2)
  const rmsAmbi35 = rms(W35)
  const ratio35 = rmsAmbi35 / rmsBin35

  // Spadek głośności w AmbiX (teoretycznie: 5 / (5 + 0.35 * 30) = 0.3225)
  const ambiDrop = rmsAmbi35 / rmsAmbi5
  const binDrop = rmsBin35 / rmsBin5

  return { ratio5, ratio35, diffRatio: Math.abs(ratio35 - ratio5) / ratio5, ambiDrop, binDrop }
})

check(
  'niezmiennik odległości: stosunek RMS AmbiX/Binaural zgodny przy R=5 i R=35 (błąd < 12%)',
  distRatioCheck.diffRatio < 0.12 && distRatioCheck.ambiDrop < 0.4,
  JSON.stringify(distRatioCheck),
)

// 9. FILTR BARWY: W eksporcie syntezy (sawtooth) fala w AmbiX przechodzi przez
//    filtr dolnoprzepustowy (SYNTH_FILTER_CONFIG, 1000 Hz) — brak ostrych uskoków (max delta < 0.25)
const filterCheck = await page.evaluate(async () => {
  const wf = document.getElementById('waveformSelect')
  wf.value = 'sawtooth'
  wf.dispatchEvent(new Event('change', { bubbles: true }))
  const [W] = await window.__orbitaExport.renderAmbix(1, 8000)
  let maxDelta = 0
  for (let i = 1; i < W.length; i++) {
    const d = Math.abs(W[i] - W[i - 1])
    if (d > maxDelta) maxDelta = d
  }
  // Reset do domyślnego triangle
  wf.value = 'triangle'
  wf.dispatchEvent(new Event('change', { bubbles: true }))
  return { maxDelta }
})

check(
  'filtr dolnoprzepustowy 1000 Hz aktywny w AmbiX (sawtooth ma wygładzone zbocza: max delta < 0.25)',
  filterCheck.maxDelta < 0.25,
  JSON.stringify(filterCheck),
)

check('0 pageerror w calym scenariuszu', pageErrors.length === 0, pageErrors.join(' | '))

console.log(`\n${pass}/${pass + fail} sprawdzen zielonych`)

await browser.close()
server.close()
process.exit(fail === 0 ? 0 : 1)
