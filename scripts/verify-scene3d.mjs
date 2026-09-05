// Weryfikacja Etapu 2 (Three.js) — harness ad-hoc, osobny od scripts/verify.mjs (Etap 1).
// Serwuje docs/ pod /sekwencer/ (układ jak GitHub Pages), sprawdza:
// - brak pageerror / błędów konsoli (poza znaną blokadą Google Fonts w sandboksie),
// - canvas WebGL rysuje (niezerowe wymiary, obecność <canvas> stworzonego przez renderer),
// - synchronizacja pozycji: state.pos (audio) === pozycja sourceMesh w scenie 3D,
// - OrbitControls: przeciągnięcie zmienia macierz kamery (kamera faktycznie się rusza),
// - zmiana kształtu trajektorii przebudowuje geometrię linii (liczba punktów > 0).
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getBrowserLaunchOptions } from './harness-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const PORT = 8934

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' }

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0])
  // Layout GitHub Pages: root = "portal", apka pod /sekwencer/ (tu: docs/ repo)
  if (urlPath.startsWith('/sekwencer/')) urlPath = urlPath.slice('/sekwencer'.length)
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html'
  const filePath = path.join(root, 'docs', urlPath)
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return }
    const ext = path.extname(filePath)
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' })
    res.end(data)
  })
})

await new Promise((r) => server.listen(PORT, r))

const browser = await chromium.launch(getBrowserLaunchOptions())
const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 })

const consoleErrors = []
const pageErrors = []
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
page.on('pageerror', (err) => pageErrors.push(String(err)))

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`OK   ${name}`) }
  else { fail++; console.log(`FAIL ${name} ${extra}`) }
}

await page.goto(`http://localhost:${PORT}/sekwencer/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)

// 1. Canvas WebGL obecny i ma niezerowe wymiary
const canvasBox = await page.evaluate(() => {
  const c = document.querySelector('#scene3dContainer canvas')
  if (!c) return null
  return { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight }
})
check('canvas WebGL obecny w #scene3dContainer', !!canvasBox, JSON.stringify(canvasBox))
check('canvas ma niezerowe wymiary', canvasBox && canvasBox.w > 0 && canvasBox.h > 0, JSON.stringify(canvasBox))

// 2. Zrzut ekranu — sprawdzenie że coś faktycznie narysowano (nie czarny/pusty kadr)
await page.screenshot({ path: path.join(__dirname, 'shot-scene3d-initial.png') })
const pixelStats = await page.evaluate(() => {
  const c = document.querySelector('#scene3dContainer canvas')
  const gl = c.getContext('webgl2') || c.getContext('webgl')
  // Nie da się łatwo odczytać pikseli z realnego kontekstu WebGL po fakcie bez specjalnych
  // flag — zamiast tego porównujemy zrzut ekranu (poza harnessem, wizualnie).
  return { hasContext: !!gl }
})
check('kontekst WebGL aktywny', pixelStats.hasContext)

// 3. Synchronizacja pozycji audio <-> wizualizacja: state.pos karmi JEDNOCZEŚNIE panner
//    audio (ui.js#update) i sourceMesh.position (scene3d.js#renderScene3D) — porównanie
//    liczbowe wprost z tekstu debugCoords vs. rzeczywista pozycja mesha w scenie Three.js.
await page.waitForTimeout(300)
const sync = await page.evaluate(() => {
  const txt = document.getElementById('debugCoords').textContent
  const m = txt.match(/XYZ: \[(-?[\d.]+), (-?[\d.]+), (-?[\d.]+)\]/)
  const hud = m ? { x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]) } : null
  const mesh = window.__orbita3d.sourceMesh.position
  return { hud, mesh: { x: mesh.x, y: mesh.y, z: mesh.z } }
})
const posMatches =
  sync.hud &&
  Math.abs(sync.hud.x - sync.mesh.x) < 0.02 &&
  Math.abs(sync.hud.y - sync.mesh.y) < 0.02 &&
  Math.abs(sync.hud.z - sync.mesh.z) < 0.02
check('pozycja sfery 3D === pozycja karmiąca panner audio (HUD)', posMatches, JSON.stringify(sync))

// 4. Zmiana kształtu trajektorii przebudowuje linię (sprawdzone przez event + brak błędu)
await page.selectOption('#shapeSelect', 'lissajous')
await page.waitForTimeout(200)
const realErrorsSoFar = pageErrors.filter((t) => !/tailwind is not defined/.test(t))
check('zmiana kształtu (lissajous) nie generuje pageerror aplikacji', realErrorsSoFar.length === 0, realErrorsSoFar.join(' | '))

// 5. Zmiana skali/obrotu też nie generuje błędów
await page.evaluate(() => {
  const el = document.getElementById('sizeRange')
  el.value = 40
  el.dispatchEvent(new Event('input', { bubbles: true }))
  const rx = document.getElementById('rotXRange')
  rx.value = 45
  rx.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.waitForTimeout(200)

// 6. OrbitControls: przeciągnięcie po canvasie faktycznie rusza kamerą (nie tylko event)
const beforeDrag = await page.evaluate(() => {
  const c = window.__orbita3d.camera
  return { x: c.position.x, y: c.position.y, z: c.position.z }
})
const box = await page.locator('#scene3dContainer canvas').boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + box.width / 2 + 220, box.y + box.height / 2 - 80, { steps: 12 })
await page.mouse.up()
await page.waitForTimeout(400)
const afterDrag = await page.evaluate(() => {
  const c = window.__orbita3d.camera
  return { x: c.position.x, y: c.position.y, z: c.position.z }
})
const camMoved =
  Math.abs(beforeDrag.x - afterDrag.x) > 0.5 ||
  Math.abs(beforeDrag.y - afterDrag.y) > 0.5 ||
  Math.abs(beforeDrag.z - afterDrag.z) > 0.5
check('OrbitControls: przeciągnięcie realnie zmienia pozycję kamery', camMoved, `${JSON.stringify(beforeDrag)} -> ${JSON.stringify(afterDrag)}`)
await page.screenshot({ path: path.join(__dirname, 'shot-scene3d-after-orbit.png') })

// 6b. Trajektoria ma faktyczną geometrię (linia nie jest pusta)
const lineInfo = await page.evaluate(() => {
  const g = window.__orbita3d.trajectoryLine.geometry
  const pos = g.getAttribute('position')
  return { count: pos ? pos.count : 0 }
})
check('geometria trajektorii ma punkty (linia rysuje się)', lineInfo.count > 0, JSON.stringify(lineInfo))

// 7. Resize: zwężenie okna nie psuje layoutu (canvas dalej wypełnia kontener)
await page.setViewportSize({ width: 900, height: 700 })
await page.waitForTimeout(300)
const canvasBoxAfterResize = await page.evaluate(() => {
  const c = document.querySelector('#scene3dContainer canvas')
  return { cw: c.clientWidth, ch: c.clientHeight }
})
check('canvas dopasowuje się po resize (niezerowy)', canvasBoxAfterResize.cw > 0 && canvasBoxAfterResize.ch > 0, JSON.stringify(canvasBoxAfterResize))
await page.screenshot({ path: path.join(__dirname, 'shot-scene3d-narrow.png') })

// 8. Konsola / pageerror — filtrować znane błędy środowiskowe cloud-sandboksu:
//    blokada Tailwind CDN i Google Fonts poza allowlistą sieciową (patrz
//    claude/etap4-sekwencer-generator-trajektorii-plan.md i punkt-startu-nastepnej-sesji.md,
//    ten sam wzorzec co przy weryfikacji Etapu 1). Na żywo (GitHub Pages) oba CDN działają.
const ENV_NOISE = /fonts\.googleapis|fonts\.gstatic|ERR_TUNNEL_CONNECTION_FAILED|tailwind is not defined/
const realConsoleErrors = consoleErrors.filter((t) => !ENV_NOISE.test(t))
const realPageErrors = pageErrors.filter((t) => !ENV_NOISE.test(t))
check('0 pageerror', realPageErrors.length === 0, realPageErrors.join(' | '))
check('0 nieoczekiwanych błędów konsoli', realConsoleErrors.length === 0, realConsoleErrors.join(' | '))

// 9. Modale Pomoc / O projekcie — otwieranie, tresc, zamykanie (Escape), powrot fokusu,
//    logo KPO faktycznie zaladowane (naturalWidth, nie tylko obecnosc src).
const pomocTab = page.locator('#salTabs [data-tab="pomoc"]')
await pomocTab.focus()
await pomocTab.click()
await page.waitForTimeout(150)
check('modal Pomoc otwiera sie po kliknieciu', await page.locator('#modalPomoc').evaluate((el) => el.classList.contains('is-open')))
check('modal Pomoc ma tresc (naglowek widoczny)', (await page.locator('#modalPomocTitle').textContent()).includes('Pomoc'))
await page.keyboard.press('Escape')
await page.waitForTimeout(150)
check('modal Pomoc zamyka sie na Escape', !(await page.locator('#modalPomoc').evaluate((el) => el.classList.contains('is-open'))))
const focusAfterCloseId = await page.evaluate(() => document.activeElement.getAttribute('data-tab'))
check('fokus wraca na przycisk po zamknieciu modala', focusAfterCloseId === 'pomoc', focusAfterCloseId)

const oProjekcieTab = page.locator('#salTabs [data-tab="o-projekcie"]')
await oProjekcieTab.click()
await page.waitForTimeout(150)
check('modal O projekcie otwiera sie po kliknieciu', await page.locator('#modalOProjekcie').evaluate((el) => el.classList.contains('is-open')))
const kpoLoaded = await page.locator('#modalOProjekcie .sal-kpo-strip img').evaluate((img) => img.naturalWidth > 0)
check('logo KPO faktycznie zaladowane (naturalWidth > 0)', kpoLoaded)
const metaOk = await page.locator('#modalOProjekcie').evaluate((el) => el.textContent.includes('143/KPO.STYPENDIA/NIMIT/2025'))
check('numer umowy KPO obecny w modalu O projekcie', metaOk)
await page.locator('#modalOProjekcie [data-close-modal]').click()
await page.waitForTimeout(150)
check('modal O projekcie zamyka sie przyciskiem X', !(await page.locator('#modalOProjekcie').evaluate((el) => el.classList.contains('is-open'))))

console.log(`\n${pass}/${pass + fail} sprawdzeń zielonych`)

await browser.close()
server.close()
process.exit(fail === 0 ? 0 : 1)
