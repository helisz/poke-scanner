/**
 * End-to-end browser check with a mocked AI endpoint.
 *
 * Verifies the real UI against the real 1025-entry dataset:
 *   upload -> describe -> local match -> rerank -> card render -> PNG download
 *
 * The model is mocked so this runs offline and without any credentials.
 * Usage: node scripts/e2e-check.mjs
 */
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'artifacts')
const PORT = 5199
const BASE = `http://localhost:${PORT}`

// What the fake vision model "sees" in input/images.jpeg
const DESCRIBE = {
  subject: 'a fluffy yellow creature with long ears and red cheeks standing in grass',
  isPokemon: true,
  pokemonGuess: 'Pikachu',
  animalFamily: 'rodent',
  colors: ['yellow', 'black', 'red'],
  bodyFeatures: ['long ears', 'red cheeks', 'lightning bolt tail', 'small body'],
  elements: ['electricity'],
  types: ['electric'],
  shapeKeywords: ['round', 'bipedal'],
  confidence: 0.96,
  note: 'clearly a Pikachu',
}

const RERANK = [
  { id: '0025', reason: '黄毛长耳，脸颊有红斑' },
  { id: '0702', reason: '同为电气鼠类，圆身短肢' },
  { id: '0026', reason: '黄色电气鼠，体型更大' },
]

function chatResponse(content) {
  return {
    choices: [{ message: { role: 'assistant', content: JSON.stringify(content) }, finish_reason: 'stop' }],
  }
}

const server = await createServer({
  server: { port: PORT, strictPort: true },
  logLevel: 'error',
})

await server.listen()
await mkdir(OUT, { recursive: true })

const failures = []
function check(label, ok, detail = '') {
  if (ok) console.log(`✓ ${label}`)
  else {
    failures.push(label)
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 1200 },
  deviceScaleFactor: 1,
  acceptDownloads: true,
})
const page = await context.newPage()

const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))

// ---- mock the user's proxy -------------------------------------------------
let describeCalls = 0
let rerankCalls = 0
await page.route('**/mock-proxy/**', async (route) => {
  const body = route.request().postDataJSON()
  const isRerank = JSON.stringify(body).includes('候选列表')
  if (isRerank) {
    rerankCalls++
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chatResponse(RERANK)) })
  }
  describeCalls++
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chatResponse(DESCRIBE)) })
})

try {
  await page.goto(BASE, { waitUntil: 'networkidle' })

  // ---- landing -------------------------------------------------------------
  check('landing page renders heading', await page.getByText('上传图片，看看它像哪只宝可梦').isVisible())
  const countText = await page.getByText(/1025 条图鉴/).first().textContent()
  check('dataset count is 1025', /1025/.test(countText ?? ''), countText ?? '')

  // ---- configure the endpoint ---------------------------------------------
  await page.getByRole('button', { name: /设置/ }).click()
  await page.getByLabel('Base URL').fill(`${BASE}/mock-proxy/v1`)
  await page.getByLabel('模型名称').fill('mock-vision')
  await page.getByLabel('API Key').fill('test-key')
  await page.getByRole('button', { name: '保存' }).click()
  // the dialog leaves with a 150ms transition, so wait for detachment
  await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 })
  check('settings dialog closes on save', (await page.getByRole('dialog').count()) === 0)

  // ---- upload --------------------------------------------------------------
  await page.setInputFiles('input[type="file"]', path.join(ROOT, 'input/images.jpeg'))
  await page.waitForSelector('img[alt="已上传的图片"]', { timeout: 15000 })
  check('uploaded image preview appears', await page.getByAltText('已上传的图片').isVisible())

  // ---- run the scan --------------------------------------------------------
  await page.getByRole('button', { name: /开始识别/ }).click()
  await page.waitForSelector('text=最相似的候选', { timeout: 40000 })

  check('describe endpoint was called once', describeCalls === 1, `calls=${describeCalls}`)
  check('rerank endpoint was called once', rerankCalls === 1, `calls=${rerankCalls}`)

  const topName = await page.locator('button:has-text("相似度")').first().innerText()
  check('top candidate is Pikachu', topName.includes('皮卡丘'), topName.replace(/\s+/g, ' '))

  const bodyText = await page.locator('body').innerText()
  check('rerank reason is displayed', bodyText.includes('黄毛长耳'))
  check('rerank badge shows', bodyText.includes('大模型已精排'))
  check('confidence indicator shown', /% 置信度/.test(bodyText))

  // three ranked candidates present
  const candidateCount = await page.locator('button:has-text("相似度")').count()
  check('at least 3 candidates listed', candidateCount >= 3, `count=${candidateCount}`)

  await page.screenshot({ path: path.join(OUT, '01-results.png'), fullPage: true })

  // ---- select -> card ------------------------------------------------------
  await page.locator('button:has-text("相似度")').first().click()
  await page.waitForSelector('text=图鉴卡片', { timeout: 15000 })
  await page.waitForTimeout(1200) // let the canvas finish rendering

  const canvasBox = await page.locator('canvas').boundingBox()
  check('card canvas is present and sized', !!canvasBox && canvasBox.width > 100, JSON.stringify(canvasBox))

  const canvasBlank = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (!c) return 'no canvas'
    const ctx = c.getContext('2d')
    const data = ctx.getImageData(0, 0, c.width, c.height).data
    // sample pixels: a blank/black card would have almost no variance
    let min = 255
    let max = 0
    for (let i = 0; i < data.length; i += 4 * 977) {
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3
      if (lum < min) min = lum
      if (lum > max) max = lum
    }
    return { min, max, w: c.width, h: c.height }
  })
  check(
    'card canvas has real pixel variance',
    typeof canvasBlank === 'object' && canvasBlank.max - canvasBlank.min > 40 && canvasBlank.w === 1080 && canvasBlank.h === 1350,
    JSON.stringify(canvasBlank),
  )

  await page.getByRole('heading', { name: '图鉴卡片' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(OUT, '02-card.png'), fullPage: true })

  // ---- download ------------------------------------------------------------
  const downloadPromise = page.waitForEvent('download', { timeout: 20000 })
  await page.getByRole('button', { name: /下载图鉴卡片/ }).click()
  const download = await downloadPromise
  const suggested = download.suggestedFilename()
  check('download filename is correct', /^pokedex-0025-皮卡丘\.png$/.test(suggested), suggested)

  const saved = path.join(OUT, 'downloaded-card.png')
  await download.saveAs(saved)
  const { readFile } = await import('node:fs/promises')
  const buf = await readFile(saved)
  const isPng = buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG'
  check('downloaded file is a valid PNG', isPng, `header=${buf.toString('hex', 0, 8)}`)
  check('downloaded PNG is non-trivial in size', buf.length > 30000, `${(buf.length / 1024).toFixed(0)} KB`)

  // ---- error handling: bad endpoint ----------------------------------------
  await page.unroute('**/mock-proxy/**')
  await page.route('**/mock-proxy/**', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'bad key' }) }),
  )
  await page.getByRole('button', { name: /重新识别/ }).click()
  await page.waitForSelector('text=识别失败', { timeout: 20000 })
  const errText = await page.locator('body').innerText()
  check('401 surfaces a readable error', errText.includes('API Key 可能无效'), 'expected key hint')

  await page.screenshot({ path: path.join(OUT, '03-error.png'), fullPage: true })

  // The 401 above is intentional; the browser logs it as a network error.
  const unexpected = consoleErrors.filter((e) => !/401|Unauthorized/.test(e))
  check('no uncaught console errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '))
} catch (err) {
  failures.push('exception')
  console.log(`✗ exception: ${err.message}`)
  await page.screenshot({ path: path.join(OUT, 'failure.png'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  await server.close()
}

console.log(failures.length === 0 ? '\nAll e2e checks passed.' : `\n${failures.length} e2e check(s) failed.`)
process.exitCode = failures.length === 0 ? 0 : 1
