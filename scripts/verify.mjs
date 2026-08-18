// Harness weryfikacyjny (claude/harness-weryfikacji-playwright.md): serwuje docs/
// (output builda — patrz vite.config.js) pod /sekwencer/ (układ GitHub Pages), sprawdza
// konsolę, obrazy, radar, przełącznik audio i eksport WAV (binaural + AmbiX) przez
// przechwycenie URL.createObjectURL.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const DIST = path.resolve('docs')
const PORT = 4173

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.json': 'application/json',
}

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0]
  if (!urlPath.startsWith('/sekwencer/')) {
    res.writeHead(404); res.end('not found (outside /sekwencer/ — jak na realnym Hubie)'); return
  }
  let rel = urlPath.replace(/^\/sekwencer\//, '')
  if (rel === '' ) rel = 'index.html'
  const filePath = path.join(DIST, rel)
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('404 ' + rel); return }
    const ext = path.extname(filePath)
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    res.end(data)
  })
})

await new Promise((r) => server.listen(PORT, r))
console.log('server up on', PORT)

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 })

const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message))

await page.goto(`http://localhost:${PORT}/sekwencer/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(300)

const results = {}

// 1) Obrazy paska — sprawdzić naturalWidth, nie sam atrybut src
results.pillMarkLoaded = await page.$eval('.sal-pill-mark', (img) => img.naturalWidth > 0)
results.faviconOk = (await page.evaluate(() => document.querySelector('link[rel="icon"]').href)).includes('/sekwencer/favicon.svg')

// 2) Radar — canvas ma niezerowe wymiary i coś narysował (nie jest pusty)
results.canvasSized = await page.$eval('#scene3dContainer canvas', (c) => c.width > 0 && c.height > 0)

// 3) Zrzut PRZED (cisza)
await fs.promises.mkdir('scripts/out', { recursive: true })
await page.screenshot({ path: 'scripts/out/01-idle.png' })
results.statusDotIdleClass = await page.$eval('#salStatusDot', (el) => el.className)

// 4) Kliknij ODTWÓRZ — sprawdź toggle przycisku, kropki paska (v3.1) i barKlasy
await page.click('#btnToggleAudio')
await page.waitForTimeout(200)
results.btnAfterClick = await page.$eval('#btnToggleAudio', (b) => b.textContent.trim())
results.statusDotPlayingClass = await page.$eval('#salStatusDot', (el) => el.className)
results.barPlayingClass = await page.$eval('#salBar', (el) => el.className)
await page.screenshot({ path: 'scripts/out/02-playing.png' })

// getComputedStyle zamiast tylko obecności klasy (pułapka z punkt-startu, sekcja 10)
results.dotComputedBg = await page.$eval('#salStatusDot', (el) => getComputedStyle(el).backgroundColor)

// 5) Suwak prędkości — sprawdź że wartość UI się zmienia
await page.fill('#speedRange', '2.5')
await page.dispatchEvent('#speedRange', 'input')
await page.waitForTimeout(50)
results.speedValText = await page.$eval('#speedVal', (el) => el.textContent)

// 6) Zmiana kształtu trajektorii
await page.selectOption('#shapeSelect', 'lissajous')
await page.waitForTimeout(50)

// 7) Eksport WAV — przechwycić URL.createObjectURL + rozmiar blobu przez nasłuch w page context
async function captureRecording(format) {
  await page.selectOption('#recFormat', format)
  const blobInfoPromise = page.evaluate(() => {
    return new Promise((resolve) => {
      const origCreate = URL.createObjectURL
      URL.createObjectURL = (blob) => {
        blob.arrayBuffer().then((buf) => {
          const dv = new DataView(buf)
          resolve({
            byteLength: buf.byteLength,
            numChannels: dv.getUint16(22, true),
            sampleRate: dv.getUint32(24, true),
            bitsPerSample: dv.getUint16(34, true),
          })
        })
        URL.createObjectURL = origCreate
        return origCreate(blob)
      }
    })
  })
  await page.click('#btnRecord')
  const info = await blobInfoPromise
  await page.waitForTimeout(100)
  const statusText = await page.$eval('#recStatus', (el) => el.textContent)
  return { info, statusText }
}

results.binaural = await captureRecording('binaural')
results.ambix = await captureRecording('ambix')

results.consoleErrors = consoleErrors

// 8) Mobile — hamburger widoczny/aktywny <=380px
const mobilePage = await browser.newPage({ viewport: { width: 375, height: 700 } })
await mobilePage.goto(`http://localhost:${PORT}/sekwencer/`, { waitUntil: 'networkidle' })
await mobilePage.waitForTimeout(200)
results.mobile = {
  tabsHidden: await mobilePage.$eval('#salTabs', (el) => getComputedStyle(el).display === 'none'),
  burgerVisible: await mobilePage.$eval('#salBurger', (el) => getComputedStyle(el).display !== 'none'),
}
await mobilePage.click('#salBurger')
await mobilePage.waitForTimeout(150)
results.mobile.menuOpenAfterClick = await mobilePage.$eval('#salMobileMenu', (el) => el.classList.contains('is-open'))
await mobilePage.screenshot({ path: 'scripts/out/03-mobile-menu.png' })

console.log(JSON.stringify(results, null, 2))

await browser.close()
server.close()
