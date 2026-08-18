// Weryfikacja poprawek z tury 18.08 (druga runda, po Etapie 2): distance model panner,
// predkosc arc-length, bug syntezy przy zmianie ksztaltu fali, reset kamery, marker
// sluchacza. Serwuje scripts/render/ (lokalny Tailwind, jak verify-scene3d.mjs).
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const PORT = 8950

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' }

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0])
  if (urlPath.startsWith('/sekwencer/')) urlPath = urlPath.slice('/sekwencer'.length)
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html'
  const filePath = path.join(root, 'scripts', 'render', urlPath)
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return }
    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' })
    res.end(data)
  })
})
await new Promise((r) => server.listen(PORT, r))

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
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
const levelBefore = await page.evaluate(async () => {
  const st = window.__orbitaAudio
  const analyser = st.ctx.createAnalyser()
  analyser.fftSize = 2048
  st.gain.connect(analyser)
  window.__testAnalyser = analyser
  await new Promise((r) => setTimeout(r, 150))
  const data = new Float32Array(analyser.fftSize)
  analyser.getFloatTimeDomainData(data)
  return Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length)
})
check('sygnal obecny PRZED zmiana ksztaltu fali (RMS > 0.001)', levelBefore > 0.001, levelBefore)

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

check('0 pageerror w calym scenariuszu', pageErrors.length === 0, pageErrors.join(' | '))

console.log(`\n${pass}/${pass + fail} sprawdzen zielonych`)

await browser.close()
server.close()
process.exit(fail === 0 ? 0 : 1)
