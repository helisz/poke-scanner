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

/** Minimal 16-bit mono silence, so the cloud TTS route returns a real WAV. */
function silentWav(samples = 800) {
  const data = Buffer.alloc(samples * 2)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(24000, 24)
  header.writeUInt32LE(24000 * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

const SILENT_WAV = silentWav()

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

// Headless Chromium has no audio device and no installed voices, so both
// engines are stubbed to settle deterministically. Without this the announcement
// promise could hang forever and the assertions below would never run.
await page.addInitScript(() => {
  HTMLMediaElement.prototype.play = function () {
    setTimeout(() => this.dispatchEvent(new Event('ended')), 20)
    return Promise.resolve()
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.speak = (utterance) => {
      setTimeout(() => utterance.onend?.(new Event('end')), 20)
    }
    window.speechSynthesis.cancel = () => {}
    window.speechSynthesis.getVoices = () => []
  }
})

const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    // Keep the source URL so intentional failures below can be excluded by
    // request, not by broadly ignoring every 404/401.
    consoleErrors.push({ text: msg.text(), url: msg.location()?.url ?? '' })
  }
})
page.on('pageerror', (err) => consoleErrors.push({ text: `pageerror: ${err.message}`, url: '' }))

// ---- mock the user's proxy -------------------------------------------------
let describeCalls = 0
let rerankCalls = 0
let ttsCalls = 0
let lastTtsBody = null
await page.route('**/mock-proxy/**', async (route) => {
  const body = route.request().postDataJSON()
  const url = route.request().url()

  // Must be checked before the describe branch: a TTS request has no
  // "候选列表" marker and would otherwise be counted as a vision call.
  if (/\/audio\/speech$/.test(url)) {
    ttsCalls++
    lastTtsBody = body
    return route.fulfill({ status: 200, contentType: 'audio/wav', body: SILENT_WAV })
  }

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

  // ---- voice announcement --------------------------------------------------
  // The live region carries the exact sentence that gets spoken, so it is the
  // reliable, audio-free way to assert the announcement.
  const liveRegion = page.locator('[role="status"][aria-live="polite"]')
  await page.waitForFunction(
    () => /首选/.test(document.querySelector('[role="status"][aria-live="polite"]')?.textContent ?? ''),
    { timeout: 15000 },
  )
  const announcement = (await liveRegion.textContent())?.trim() ?? ''
  check('announcement names the preferred result', announcement.includes('首选皮卡丘'), announcement)
  check('announcement names two alternates', /备选.+、.+。/.test(announcement), announcement)
  check('announcement omits scores and percentages', !/\d+%|相似度/.test(announcement), announcement)

  // The default engine is cloud, so the proxy must have received a TTS call
  // carrying the same sentence and the configured voice. The request is issued
  // asynchronously, so poll Node-side state rather than asserting immediately.
  for (let i = 0; i < 50 && ttsCalls === 0; i++) await page.waitForTimeout(100)
  check('cloud TTS endpoint was called once', ttsCalls === 1, `calls=${ttsCalls}`)
  check(
    'TTS request carries the announcement text',
    typeof lastTtsBody?.input === 'string' && lastTtsBody.input.includes('首选皮卡丘'),
    JSON.stringify(lastTtsBody)?.slice(0, 160),
  )
  check(
    'TTS request uses the configured model and voice',
    lastTtsBody?.model === 'tts-1' && lastTtsBody?.voice === 'alloy',
    JSON.stringify({ model: lastTtsBody?.model, voice: lastTtsBody?.voice }),
  )
  const speakerButton = page.getByRole('button', { name: /播报结果/ })
  check('replay button is offered on the results header', (await speakerButton.count()) === 1)

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
  await page.waitForTimeout(1500) // let the card finish rendering

  // The card is exposed as an <img> with a data: source so mobile gets the
  // native long-press "save image" action. Assert on the image, not a canvas.
  const cardImg = page.locator('img[alt$="图鉴卡片"]').first()
  const cardBox = await cardImg.boundingBox()
  check('card image is present and sized', !!cardBox && cardBox.width > 100, JSON.stringify(cardBox))

  const cardInfo = await page.evaluate(() => {
    const img = document.querySelector('img[alt$="图鉴卡片"]')
    if (!img) return 'no card image'
    if (!img.src.startsWith('data:image/png')) return { src: img.src.slice(0, 40) }
    return { w: img.naturalWidth, h: img.naturalHeight, bytes: img.src.length }
  })
  check(
    'card image is a 1080x1350 PNG data URL',
    typeof cardInfo === 'object' && cardInfo.w === 1080 && cardInfo.h === 1350,
    JSON.stringify(cardInfo),
  )

  await page.getByRole('heading', { name: '图鉴卡片' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(OUT, '02-card.png'), fullPage: true })

  // ---- full-screen viewer --------------------------------------------------
  // Two entry points exist (an icon overlay labelled 全屏查看 and a text button
  // labelled 全屏), so match the text button exactly.
  await page.getByRole('button', { name: '全屏', exact: true }).click()
  await page.getByRole('dialog', { name: '图鉴卡片全屏预览' }).waitFor({ timeout: 5000 })
  check('full-screen viewer opens', (await page.getByRole('dialog', { name: '图鉴卡片全屏预览' }).count()) === 1)
  await page.getByRole('dialog', { name: '图鉴卡片全屏预览' }).getByRole('button', { name: '关闭' }).click()
  await page.getByRole('dialog', { name: '图鉴卡片全屏预览' }).waitFor({ state: 'detached', timeout: 5000 })
  check('full-screen viewer closes', (await page.getByRole('dialog', { name: '图鉴卡片全屏预览' }).count()) === 0)

  // ---- mobile viewport: no horizontal overflow ----------------------------
  // This is the regression guard for "step 2 is wider than the phone screen".
  for (const vp of [
    { label: 'iPhone SE', width: 320, height: 568 },
    { label: 'iPhone 15', width: 393, height: 852 },
    { label: 'Pixel 7', width: 412, height: 915 },
  ]) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.waitForTimeout(400)
    const overflow = await page.evaluate(() => {
      const de = document.documentElement
      const widest = [...document.querySelectorAll('body *')]
        .map((el) => ({ w: el.getBoundingClientRect().right, tag: el.tagName }))
        .reduce((a, b) => (b.w > a.w ? b : a), { w: 0, tag: '' })
      return {
        scrollWidth: de.scrollWidth,
        clientWidth: de.clientWidth,
        widestRight: Math.round(widest.w),
        widestTag: widest.tag,
      }
    })
    check(
      `no horizontal overflow at ${vp.label} (${vp.width}px)`,
      overflow.scrollWidth <= overflow.clientWidth + 1,
      JSON.stringify(overflow),
    )

    // The card must remain long-pressable: iOS needs a real <img> with a data:
    // source and no -webkit-touch-callout:none for the native save sheet.
    const longPressReady = await page.evaluate(() => {
      const img = document.querySelector('img[alt$="图鉴卡片"]')
      if (!img) return 'no card image'
      const cs = getComputedStyle(img)
      return {
        isImg: img.tagName === 'IMG',
        dataUrl: img.src.startsWith('data:image/png'),
        touchCallout: cs.webkitTouchCallout || 'default',
        pointerEvents: cs.pointerEvents,
      }
    })
    check(
      `card is long-press saveable at ${vp.width}px`,
      typeof longPressReady === 'object' &&
        longPressReady.isImg &&
        longPressReady.dataUrl &&
        longPressReady.touchCallout !== 'none' &&
        longPressReady.pointerEvents !== 'none',
      JSON.stringify(longPressReady),
    )

    // The long-press instruction must actually reach phone users.
    const hintVisible = await page.getByText(/长按上方卡片图片/).first().isVisible().catch(() => false)
    check(`long-press hint is visible at ${vp.width}px`, hintVisible)

    await page.screenshot({
      path: path.join(OUT, `04-mobile-${vp.width}.png`),
      fullPage: true,
    })
  }

  // ---- mobile settings dialog renders as a bottom sheet --------------------
  await page.setViewportSize({ width: 393, height: 852 })
  await page.getByRole('button', { name: /设置/ }).click()
  await page.getByRole('dialog').waitFor({ timeout: 5000 })
  // the sheet enters with a translate-y transition; measuring mid-flight yields
  // a false overflow, so wait for it to settle
  await page.waitForTimeout(500)
  const sheet = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]')
    if (!d) return 'no dialog'
    const r = d.getBoundingClientRect()
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      height: Math.round(r.height),
      vh: window.innerHeight,
      width: Math.round(r.width),
    }
  })
  check(
    'mobile dialog fits the viewport without scrolling the page',
    typeof sheet === 'object' && sheet.height <= sheet.vh && sheet.bottom <= sheet.vh + 1,
    JSON.stringify(sheet),
  )
  await page.screenshot({ path: path.join(OUT, '05-mobile-settings.png') })

  // ---- voice controls live in settings and survive a save/reopen -----------
  const dialog = page.getByRole('dialog')
  check('voice engine options are present', (await dialog.getByRole('button', { name: '云端语音' }).count()) === 1)
  check('voice preview button is present', (await dialog.getByRole('button', { name: '试听' }).count()) === 1)
  check('cloud voice fields are shown by default', (await dialog.getByLabel('语音模型').count()) === 1)

  // Switching to the system voice must reveal the rate slider and hide the
  // cloud-only fields, then persist through save.
  await dialog.getByRole('button', { name: '系统语音' }).click()
  check('system voice reveals the rate slider', (await dialog.getByLabel(/语速/).count()) === 1)
  check('system voice hides cloud fields', (await dialog.getByLabel('语音模型').count()) === 0)

  // Restore the original choice so the "cancelled edits are discarded" check
  // below compares against the pre-existing saved value, not the draft.
  await dialog.getByRole('button', { name: '云端语音' }).click()
  check('switching back restores the cloud fields', (await dialog.getByLabel('语音模型').count()) === 1)
  await dialog.getByRole('button', { name: '取消' }).click()
  await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 })

  const persisted = await page.evaluate(() => {
    const raw = localStorage.getItem('poke-scanner.ai-config')
    return raw ? JSON.parse(raw).voice : null
  })
  check(
    'cancelled edits do not mutate the saved voice config',
    persisted?.engine === 'cloud',
    JSON.stringify(persisted),
  )

  // ---- type pills are drawn into the card ----------------------------------
  // Text inside a canvas cannot be queried, so probe the pixel block where the
  // pill sits: it must be strongly saturated in the type colour (electric yellow).
  const pill = await page.evaluate(async () => {
    const img = document.querySelector('img[alt$="图鉴卡片"]')
    if (!img) return 'no card image'
    const blob = await (await fetch(img.src)).blob()
    const bmp = await createImageBitmap(blob)
    const c = document.createElement('canvas')
    c.width = bmp.width
    c.height = bmp.height
    const ctx = c.getContext('2d')
    ctx.drawImage(bmp, 0, 0)
    // Pills are right-aligned on the name row: y = 700..750, x near the right edge.
    const box = ctx.getImageData(880, 700, 116, 50).data
    let saturated = 0
    for (let i = 0; i < box.length; i += 4) {
      const r = box[i]
      const g = box[i + 1]
      const b = box[i + 2]
      // electric yellow: high red+green, low blue
      if (r > 170 && g > 140 && b < 120) saturated++
    }
    return { saturated, total: box.length / 4 }
  })
  check(
    'card renders type pills next to the name',
    typeof pill === 'object' && pill.saturated > 200,
    JSON.stringify(pill),
  )

  await page.setViewportSize({ width: 1440, height: 1200 })
  await page.waitForTimeout(400)

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

  // ---- cloud TTS unavailable -> browser fallback ----------------------------
  // Many proxies whitelist only /chat/completions. The announcement must still
  // be heard, and the degradation must be visible rather than silent.
  await page.route('**/audio/speech', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not found"}' }),
  )
  await page.getByRole('button', { name: /播报结果/ }).click()
  const fallbackText = await page
    .getByText(/语音播报降级/)
    .first()
    .textContent({ timeout: 15000 })
    .catch(() => '')
  check(
    'TTS 404 falls back to the system voice and says so',
    /语音播报降级/.test(fallbackText ?? '') && /404/.test(fallbackText ?? ''),
    (fallbackText ?? '').slice(0, 120),
  )
  await page.unroute('**/audio/speech')

  // ---- transient 503: retried once, then falls back with the real reason ----
  // A 503 is a gateway problem, so the client retries before giving up; the
  // server's own explanation must reach the user instead of a bare status code.
  let gatewayAttempts = 0
  await page.route('**/audio/speech', (route) => {
    gatewayAttempts++
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'upstream tts pool exhausted' } }),
    })
  })
  await page.getByRole('button', { name: /播报结果/ }).click()
  const gatewayText = await page
    .getByText(/语音播报降级/)
    .first()
    .textContent({ timeout: 20000 })
    .catch(() => '')
  check('503 is retried once before falling back', gatewayAttempts === 2, `attempts=${gatewayAttempts}`)
  check(
    '503 message explains the status and relays the server reason',
    /503/.test(gatewayText ?? '') &&
      /暂时不可用/.test(gatewayText ?? '') &&
      /upstream tts pool exhausted/.test(gatewayText ?? ''),
    (gatewayText ?? '').slice(0, 200),
  )
  await page.unroute('**/audio/speech')

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

  // The failures injected above are deliberate and the browser logs them as
  // network errors: the 401 from the bad-key probe, plus the 404 and 503 from
  // the two TTS degradation probes. Anything else is a genuine regression.
  const unexpected = consoleErrors.filter((entry) => {
    if (/401|Unauthorized/.test(entry.text)) return false
    if (/(404|503)/.test(entry.text) && /\/audio\/speech/.test(entry.url)) return false
    return true
  })
  check(
    'no uncaught console errors',
    unexpected.length === 0,
    unexpected.slice(0, 3).map((e) => `${e.text} @ ${e.url}`).join(' | '),
  )
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
