// 星穹 SkyShow · 无人机派单系统 —— 桌面演示壳（免环境：不依赖 Node / 浏览器）
// 主进程职责：
//   ① 启动内置 Mock Server（默认 8090 = API + 用户端，8080 = API + 管理端）
//   ② 单窗口 + 顶部切换「用户端 / 管理后台」
//   ③ 数据落 %APPDATA%\SkyShowDemo（重启保留），启动日志落 desktop.log（排障用）
//   ④ 端口被别的软件占用时自动换端口（不弹错误、不改配置）
'use strict'

const { app, BrowserWindow, Menu, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const net = require('net')
const http = require('http')

// ---------------- 目录与日志 ----------------
// 便携版 exe 每次运行都会解包到临时目录，所以数据与日志一律放 %APPDATA%，不放程序目录
app.setPath('userData', path.join(app.getPath('appData'), 'SkyShowDemo'))
const DATA_DIR = path.join(app.getPath('userData'), 'data')
const LOG_FILE = path.join(app.getPath('userData'), 'desktop.log')

function log(...args) {
  const line = `[${new Date().toISOString()}] ` + args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
  try { console.log(line) } catch (e) { /* 无控制台时忽略 */ }
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true })
    const st = fs.existsSync(LOG_FILE) ? fs.statSync(LOG_FILE) : null
    if (st && st.size > 512 * 1024) fs.writeFileSync(LOG_FILE, '') // 超过 512KB 清一次
    fs.appendFileSync(LOG_FILE, line + '\r\n')
  } catch (e) { /* 日志写不了不影响演示 */ }
}

// ---------------- 端口 ----------------
// 默认与开发环境一致（8090 用户端 / 8080 管理端）；客户机端口冲突时自动换
const WANT_H5_PORT = Number(process.env.SKYSHOW_H5_PORT) || 8090
const WANT_ADMIN_PORT = Number(process.env.SKYSHOW_ADMIN_PORT) || 8080
const MAX_PORT_TRIES = 20

// 打包后资源在 resources/app-resources；开发时直接指向 prototype/ 下的源码目录
function resourcePaths() {
  if (app.isPackaged) {
    const r = path.join(process.resourcesPath, 'app-resources')
    return {
      server: path.join(r, 'mock-server', 'server.js'),
      h5: path.join(r, 'h5'),
      admin: path.join(r, 'admin')
    }
  }
  const base = path.resolve(__dirname, '..', '..') // prototype/
  return {
    server: path.join(base, 'mock-server', 'server.js'),
    h5: path.join(base, 'h5', 'dist', 'build', 'h5'),
    admin: path.join(base, 'admin', 'dist')
  }
}

function portBusy(port) {
  return new Promise(resolve => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    let settled = false
    const done = v => { if (settled) return; settled = true; try { socket.destroy() } catch (e) { /* noop */ } resolve(v) }
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    socket.setTimeout(900, () => done(false))
  })
}

// 某端口上跑的是不是「我们这套 Mock Server」：GET /api 回 JSON，name 里带 Mock Server
function probeOurs(port) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api', timeout: 1200 }, res => {
      let buf = ''
      res.setEncoding('utf8')
      res.on('data', d => { if (buf.length < 4096) buf += d })
      res.on('end', () => {
        try {
          const j = JSON.parse(buf)
          const name = String((j && j.data && j.data.name) || '')
          resolve(/Mock Server/i.test(name) || Array.isArray(j && j.data && j.data.routes))
        } catch (e) { resolve(false) }
      })
    })
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.on('error', () => resolve(false))
  })
}

async function findFree(startPort) {
  for (let i = 1; i <= MAX_PORT_TRIES; i++) {
    const p = startPort + i
    if (p > 65535) break
    if (!(await portBusy(p))) return p
  }
  return startPort // 实在找不到就退回原端口（下面 listen 会报错，但有日志）
}

// 返回 { h5: {port, external}, admin: {port, external} }
async function resolvePorts() {
  let h5
  if (!(await portBusy(WANT_H5_PORT))) {
    h5 = { port: WANT_H5_PORT, external: false }
  } else if (await probeOurs(WANT_H5_PORT)) {
    h5 = { port: WANT_H5_PORT, external: true }
  } else {
    const p = await findFree(WANT_H5_PORT)
    log('[desktop] 端口', WANT_H5_PORT, '被其它程序占用，用户端改用', p)
    h5 = { port: p, external: false }
  }

  let admin
  if (h5.external) {
    // 复用已在运行的实例：管理端端口沿用它的（通常就是 8080）
    admin = { port: WANT_ADMIN_PORT, external: true }
  } else if (!(await portBusy(WANT_ADMIN_PORT))) {
    admin = { port: WANT_ADMIN_PORT, external: false }
  } else if (await probeOurs(WANT_ADMIN_PORT)) {
    admin = { port: WANT_ADMIN_PORT, external: true }
  } else {
    const p = await findFree(WANT_ADMIN_PORT)
    log('[desktop] 端口', WANT_ADMIN_PORT, '被其它程序占用，管理端改用', p)
    admin = { port: p, external: false }
  }
  return { h5, admin }
}

let resolved = null

async function bootServer() {
  const paths = resourcePaths()
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const ports = await resolvePorts()
  resolved = ports

  process.env.MOCK_DATA_DIR = DATA_DIR
  process.env.H5_DIST_DIR = paths.h5
  process.env.ADMIN_DIST_DIR = paths.admin
  process.env.PORT = String(ports.h5.port)
  process.env.ADMIN_PORT = String(ports.admin.port)

  if (ports.h5.external) {
    log('[desktop] 用户端端口已有本系统在运行，直接复用（数据目录以那个进程为准）')
    return { external: true, h5: ports.h5.port, admin: ports.admin.port }
  }
  log('[desktop] 内置服务启动：数据目录', DATA_DIR, '用户端', ports.h5.port, '管理端', ports.admin.port)
  require(paths.server)
  return { external: false, h5: ports.h5.port, admin: ports.admin.port, dataDir: DATA_DIR }
}

function createWindow() {
  const h5Url = `http://127.0.0.1:${resolved.h5.port}/`
  const adminUrl = `http://127.0.0.1:${resolved.admin.port}/`
  const startPane = process.env.SKYSHOW_START_PANE === 'admin' ? 'admin' : 'h5'

  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: '星穹 SkyShow · 无人机派单系统（演示）',
    backgroundColor: '#0b1220',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.loadFile(path.join(__dirname, 'shell.html'), {
    query: { h5: h5Url, admin: adminUrl, pane: startPane }
  })

  win.once('ready-to-show', () => win.show())

  // 调试/自动化钩子：SKYSHOW_SCREENSHOT=<png 路径> 时，等页面稳定后截整窗；
  // 配合 SKYSHOW_EXIT_AFTER_SHOT=1 用于验收脚本与无人值守回归。
  // SKYSHOW_SHOT_DELAY_MS 控制等待时间（默认 4000，H5 首屏渲染需要时间）
  if (process.env.SKYSHOW_SCREENSHOT) {
    const delay = Number(process.env.SKYSHOW_SHOT_DELAY_MS) || 4000
    setTimeout(async () => {
      try {
        const pane = process.env.SKYSHOW_SHOT_PANE
        if (pane) {
          await win.webContents.executeJavaScript(`document.querySelector('#seg button[data-pane="${pane}"]').click()`, true)
          await new Promise(r => setTimeout(r, 3500))
        }
        const img = await win.webContents.capturePage()
        fs.writeFileSync(process.env.SKYSHOW_SCREENSHOT, img.toPNG())
        log('[desktop] screenshot ->', process.env.SKYSHOW_SCREENSHOT)
      } catch (e) {
        log('[desktop] screenshot failed', e && e.message)
      }
      if (process.env.SKYSHOW_EXIT_AFTER_SHOT === '1') app.quit()
    }, delay)
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^http/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  // F11 全屏；Ctrl+R 刷新当前面板
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F11') win.setFullScreen(!win.isFullScreen())
    if ((input.control || input.meta) && String(input.key).toLowerCase() === 'r') {
      event.preventDefault()
      win.webContents.reload()
    }
  })
  return win
}

process.on('uncaughtException', e => {
  log('[desktop] uncaughtException', e && e.stack ? e.stack : String(e))
  try { dialog.showErrorBox('演示程序出现异常', String(e && e.message ? e.message : e) + '\n\n日志：' + LOG_FILE) } catch (err) { /* noop */ }
})

// 只允许一个实例：客户重复双击不会起两份服务抢端口
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) { if (win.isMinimized()) win.restore(); win.focus() }
  })

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    try {
      const info = await bootServer()
      log('[desktop] mock server', info)
    } catch (e) {
      log('[desktop] 内置服务启动失败', e && e.stack ? e.stack : String(e))
      dialog.showErrorBox('内置服务启动失败', String(e && e.stack ? e.stack : e))
    }
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => app.quit())
}
