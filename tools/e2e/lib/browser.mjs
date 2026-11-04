// 浏览器与截图：本机 Edge + 有头模式 + 截图竞速超时。
//
// 既有 60+ 走查脚本里反复验证过的稳定做法，全部收在这里，新用例只 import 不再手抄：
//   1. 驱动本机 Edge（不下载 Chromium）；
//   2. headless:false —— headless 帧饥饿会让 uni-app 转场卡死、截图挂起；
//   3. protocolTimeout 180s —— CDP 单次协议调用超时兜底（比默认 10s 宽）；
//   4. 截图前 bringToFront + 9s 竞速超时 —— 窗口被遮挡/最小化时 captureScreenshot 会卡在 CDP，
//      puppeteer 自带的 timeout 兜不住（实测挂 150s），必须外层 Promise.race；
//   5. 原生 dialog 一律 accept —— 页面挂起 window.confirm/alert 会把后续操作拖到 protocolTimeout。
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

// 8090 = API + H5 构建产物；8080 = API + 管理端构建产物（同一份 mock-server 数据）。
// H5_BASE 可指向 dev server（5173）做开发期调试，但判据默认打构建产物。
export const H5 = process.env.H5_BASE || 'http://localhost:8090'
export const ADMIN = process.env.ADMIN_BASE || 'http://localhost:8080'
// API 默认与 H5 同源（mock-server 同端口同时提供 API 与静态产物）
export const API = process.env.API_BASE || H5

const E2E_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const SHOTS_DIR = path.join(E2E_DIR, 'shots')
export const REPORTS_DIR = path.join(E2E_DIR, 'reports')

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 启动一个共享浏览器。整个套件只起一次，避免每条用例 2-3s 的冷启动开销。 */
export async function launchBrowser(opts = {}) {
  if (!fs.existsSync(EDGE)) {
    throw new Error(`未找到本机 Edge：${EDGE}（可用 EDGE_PATH 环境变量覆盖）`)
  }
  return puppeteer.launch({
    executablePath: EDGE,
    headless: false,
    protocolTimeout: 180000,
    slowMo: 30,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--force-device-scale-factor=1',
      '--window-size=1520,1000',
      '--window-position=0,0',
      ...(opts.args || [])
    ]
  })
}

/** 新开 H5 页面（窄屏 480x900，贴近手机）。pageerror/dialog 统一接管。 */
export async function newH5Page(browser, opts = {}) {
  const page = await browser.newPage()
  await page.setViewport({ width: 480, height: 900 })
  page.on('pageerror', (e) => {
    if (opts.onPageError) opts.onPageError(e)
    else console.log('  [h5 pageerror]', String(e.message || e).slice(0, 180))
  })
  // 原生对话框自动 accept：否则 window.confirm 会把后续 CDP 调用拖到 protocolTimeout。
  page.on('dialog', (d) => d.accept().catch(() => {}))
  return page
}

/** 新开管理端页面（1440x900 宽屏）。 */
export async function newAdminPage(browser, opts = {}) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  page.on('pageerror', (e) => {
    if (opts.onPageError) opts.onPageError(e)
    else console.log('  [admin pageerror]', String(e.message || e).slice(0, 180))
  })
  page.on('dialog', (d) => d.accept().catch(() => {}))
  return page
}

/**
 * 安全截图：先 bringToFront，再给「截图 + 9s 竞速」兜底。
 * @returns {Promise<string>} 截图绝对路径（失败返回 ''，绝不让一张截图拖垮整条用例）
 */
export async function shot(page, name, opts = {}) {
  const dir = opts.dir || path.join(SHOTS_DIR, 'suite')
  fs.mkdirSync(dir, { recursive: true })
  const safe = String(name).replace(/[^\w.\-]+/g, '_').slice(0, 80)
  const file = path.join(dir, `${safe}.png`)
  try {
    await sleep(opts.settle ?? 300)
    await page.bringToFront().catch(() => {})
    await Promise.race([
      page.screenshot({ path: file, timeout: 8000 }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('screenshot 卡住（9s）')), 9000))
    ])
    return file
  } catch (e) {
    if (opts.verbose !== false) console.log(`  (截图跳过 ${safe}: ${String(e.message).slice(0, 48)})`)
    return ''
  }
}

/** 关页面也加超时：转场卡死时 page.close() 本身可能挂住。 */
export async function closePageSafe(page, timeoutMs = 8000) {
  if (!page) return
  await Promise.race([
    page.close().catch(() => {}),
    sleep(timeoutMs)
  ])
}

/** 关整个浏览器（带超时兜底，避免套件结束卡住不退）。 */
export async function closeBrowserSafe(browser, timeoutMs = 12000) {
  if (!browser) return
  await Promise.race([
    browser.close().catch(() => {}),
    sleep(timeoutMs)
  ])
}
