// Zrzuty wizualne z lokalnym Tailwind (bez CDN — sandbox go blokuje) — patrz
// claude/harness-weryfikacji-playwright.md. Serwuje scripts/render/ pod /sekwencer/.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const DIST = path.resolve('scripts/render')
const PORT = 4174
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
}
const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0]
  if (!urlPath.startsWith('/sekwencer/')) { res.writeHead(404); res.end(); return }
  let rel = urlPath.replace(/^\/sekwencer\//, '') || 'index.html'
  fs.readFile(path.join(DIST, rel), (err, data) => {
    if (err) { res.writeHead(404); res.end('404 ' + rel); return }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(rel)] || 'application/octet-stream' })
    res.end(data)
  })
})
await new Promise((r) => server.listen(PORT, r))

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('fonts.googleapis')) errors.push(m.text()) })
await page.goto(`http://localhost:${PORT}/sekwencer/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(300)
await fs.promises.mkdir('scripts/out', { recursive: true })
await page.screenshot({ path: 'scripts/out/render-01-full.png' })
await page.click('#btnToggleAudio')
await page.waitForTimeout(200)
await page.screenshot({ path: 'scripts/out/render-02-playing.png' })
console.log('errors:', JSON.stringify(errors))
await browser.close()
server.close()
