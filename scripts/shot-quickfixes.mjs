import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getBrowserLaunchOptions } from './harness-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const PORT = 8951

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
await page.goto(`http://localhost:${PORT}/sekwencer/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.screenshot({ path: 'scripts/shot-quickfixes-scene.png' })

// zbliz kamere lekko, zeby marker sluchacza (korpus+nos) byl czytelny
await page.mouse.move(720, 500)
await page.mouse.down()
await page.mouse.move(760, 460, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(300)
await page.screenshot({ path: 'scripts/shot-quickfixes-listener-closeup.png' })

await browser.close()
server.close()
console.log('done')
