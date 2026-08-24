/**
 * dsh-tray-manager — DeepSeek Harness 托盘管理器（服务端半身）。
 *
 * 功能：
 *   1. Web API：托盘状态 / 启动 / 停止 / 日志尾部 / 桌面快捷方式创建
 *   2. 安装后自动生成桌面快捷方式（指向「启动 DeepSeek Harness.vbs」，
 *      图标用 DeepSeek Harness.ico）；每次 dsh web 启动时检查，缺失自动补回
 *   3. dsh web 启动时自动拉起托盘脚本（未运行时），保证任何入口都有托盘
 *
 * 设计约束：
 *   - 插件运行在 dsh web 进程内部，"停止服务"类操作有意排除（会杀死面板自身）；
 *     停止服务仍由托盘菜单/退出负责。
 *   - Web API 通过动态注入的 webServer 服务注册（ctx.inject），
 *     无 webServer 的 profile（如 TUI）上插件照常加载。
 *   - 零运行时依赖（node: 内置模块 + 进程外 PowerShell）。
 *   - PowerShell 查询输出保持纯 ASCII，避免中文系统控制台编码问题。
 */
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const name = 'dsh-tray-manager'
// webServer 是可选服务：用动态 ctx.inject 而非声明式 inject（见 apply 注释）
export const inject = []

/** 插件配置默认值（可在 profile 的 cordis.patch.yml 覆盖）。 */
const DEFAULTS = {
  /** 托盘脚本绝对路径；null → 按 trayScriptProbe 自动探测 */
  trayScript: null,
  /**
   * 自动探测候选路径（惰性求值，避免模块加载时固化 env）：
   * 默认从环境变量 DSH_TRAY_SCRIPT 读取（分号分隔多个候选），
   * 可在 patch 中覆盖为字符串数组。函数或数组均可。
   */
  trayScriptProbe: () => (process.env.DSH_TRAY_SCRIPT ?? '').split(';').filter(Boolean),
  /** 启动器（VBS）路径；null → 与托盘脚本同目录的「启动 DeepSeek Harness.vbs」 */
  shortcutTarget: null,
  /** 快捷方式图标；null → 与托盘脚本同目录的 DeepSeek Harness.ico */
  iconPath: null,
  /** 快捷方式显示名（不含 .lnk） */
  shortcutName: 'DeepSeek Harness',
  /** 每次 dsh web 启动时：桌面无快捷方式则自动生成 */
  autoCreateShortcut: true,
  /** 每次 dsh web 启动时：托盘未运行则自动拉起（-NoBrowser） */
  autoSpawnTray: true,
  /** 日志文件；null → 与托盘脚本同目录的 dsh-tray.log */
  logFile: null,
  /** 进程查询超时（毫秒） */
  timeoutMs: 15000,
  /** 日志尾部默认行数 */
  logLines: 200,
}

/** 转义 PowerShell 单引号字符串中的单引号（供测试/复用导出）。 */
export function buildEsc(s) {
  return String(s).replace(/'/g, "''")
}

/** 合并设置对象（patch 覆盖 existing；保留托盘自报字段如 trayScript）。 */
export function mergeSettings(existing, patch) {
  return { ...(existing ?? {}), ...(patch ?? {}) }
}

/**
 * 选择托盘实现：脚本同目录存在 C# 轻量版 exe 时优先使用（协议兼容，
 * 内存约 10MB vs PowerShell 版约 110MB），否则回退 PowerShell 脚本。
 * 结果写入 config.trayProgram（.exe 或 .ps1 路径）。
 */
export function resolveTrayProgram(config) {
  let program = config.trayScript ?? null
  if (program && /\.ps1$/i.test(program)) {
    const exe = join(dirname(program), 'DeepSeek Harness Tray.exe')
    if (existsSync(exe)) {
      program = exe
      console.log(`[tray-manager] 使用 C# 轻量托盘: ${exe}`)
    }
  }
  config.trayProgram = program
  return config
}

export function resolveConfig(raw = {}) {
  const cfg = { ...DEFAULTS, ...(raw ?? {}) }
  let script = cfg.trayScript
  if (!script) {
    const probes = typeof cfg.trayScriptProbe === 'function' ? cfg.trayScriptProbe() : (cfg.trayScriptProbe ?? [])
    for (const probe of probes) {
      if (probe && existsSync(probe)) { script = probe; break }
    }
  }
  // 探测链补充：托盘运行过会自报路径到设置文件（trayScript 字段）
  if (!script) {
    const legacySettings = cfg.settingsFile ?? join(homedir(), 'dsh-tray-settings.json')
    for (const sf of [cfg.settingsFile, legacySettings]) {
      if (!sf || !existsSync(sf)) continue
      try {
        const j = JSON.parse(readFileSync(sf, 'utf8'))
        if (typeof j?.trayScript === 'string' && existsSync(j.trayScript)) { script = j.trayScript; break }
      } catch { /* 损坏则跳过 */ }
    }
  }
  cfg.trayScript = script && existsSync(script) ? script : null
  const base = cfg.trayScript ? dirname(cfg.trayScript) : null
  if (!cfg.logFile && base) cfg.logFile = join(base, 'dsh-tray.log')
  if (!cfg.shortcutTarget && base) {
    const vbs = join(base, '启动 DeepSeek Harness.vbs')
    if (existsSync(vbs)) cfg.shortcutTarget = vbs
  }
  if (!cfg.iconPath && base) {
    const ico = join(base, 'DeepSeek Harness.ico')
    if (existsSync(ico)) cfg.iconPath = ico
  }
  // 托盘脚本读取的设置文件（显示/隐藏托盘图标等），与托盘脚本约定同目录
  cfg.settingsFile = cfg.settingsFile ?? (base ? join(base, 'dsh-tray-settings.json') : null)
  return resolveTrayProgram(cfg)
}

/**
 * 异步探测链（resolveConfig 的同步链找不到时调用）：读取桌面快捷方式
 * "DeepSeek Harness.lnk" 的目标（启动器 VBS）反推托盘脚本目录。
 * 返回更新后的 config（找到则补全 trayScript/logFile/shortcutTarget/iconPath/settingsFile）。
 */
async function probeFromDesktopShortcut(config) {
  if (config.trayScript) return config
  try {
    const desktop = await desktopPath(config.timeoutMs)
    if (!desktop) return config
    const lnk = join(desktop, `${config.shortcutName}.lnk`)
    if (!existsSync(lnk)) return config
    const script = `$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('${String(lnk).replace(/'/g, "''")}'); Write-Output ('TARGET=' + $s.TargetPath)`
    const out = await psRun(['-Command', script], config.timeoutMs)
    const m = /^TARGET=(.+)$/m.exec(out)
    const target = m ? m[1].trim() : ''
    // 目标是「启动 DeepSeek Harness.vbs」，反推同目录的托盘程序（C# exe 优先）
    if (target && /\.vbs$/i.test(target) && existsSync(target)) {
      const base = dirname(target)
      const exe = join(base, 'DeepSeek Harness Tray.exe')
      const ps1 = join(base, 'DeepSeek Harness Tray.ps1')
      const tray = existsSync(exe) ? exe : (existsSync(ps1) ? ps1 : null)
      if (tray) {
        console.log(`[tray-manager] 经桌面快捷方式探测到托盘程序: ${tray}`)
        config.trayScript = tray
        if (!config.logFile) config.logFile = join(base, 'dsh-tray.log')
        if (!config.shortcutTarget) config.shortcutTarget = target
        const ico = join(base, 'DeepSeek Harness.ico')
        if (existsSync(ico) && !config.iconPath) config.iconPath = ico
        if (!config.settingsFile) config.settingsFile = join(base, 'dsh-tray-settings.json')
      }
    }
  } catch { /* 探测失败静默 */ }
  return resolveTrayProgram(config)
}

// ---------------- PowerShell 查询助手 ----------------

function psRun(args, timeoutMs) {
  return new Promise((resolve) => {
    let child
    try {
      // PS 5.1 管道输出默认用控制台代码页（中文系统=GBK），强制 UTF-8——
      // 否则解析含中文的输出（如用户目录含中文时的桌面路径）会乱码
      if (args[0] === '-Command' && typeof args[1] === 'string') {
        args = ['-Command', '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;' + args[1], ...args.slice(2)]
      }
      child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', ...args], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    } catch {
      resolve('')
      return
    }
    let out = ''
    const timer = setTimeout(() => { try { child.kill() } catch { /* noop */ } ; resolve(out) }, timeoutMs)
    child.stdout.on('data', (d) => { out += d.toString('utf8') })
    child.on('close', () => { clearTimeout(timer); resolve(out) })
    child.on('error', () => { clearTimeout(timer); resolve('') })
  })
}

/** 查询托盘进程状态（匹配 PS 版或 C# exe 版）。匹配串为 ASCII，避免中文编码问题。 */
async function queryTray(timeoutMs) {
  const script = `$p = Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and (( $_.Name -eq 'powershell.exe' -and $_.CommandLine -like '*DeepSeek Harness Tray.ps1*' ) -or $_.Name -eq 'DeepSeek Harness Tray.exe' ) } | Select-Object -First 1; if ($p) { Write-Output ('PID=' + $p.ProcessId + ';START=' + $p.CreationDate) }`
  const out = await psRun(['-Command', script], timeoutMs)
  const m = /PID=(\d+);START=([^;\r\n]+)/.exec(out)
  if (m) return { running: true, pid: Number(m[1]), startedAt: String(m[2]).trim() }
  return { running: false, pid: null, startedAt: null }
}

/**
 * 隐藏窗口启动托盘（等价双击 VBS；-NoBrowser 不开浏览器）。
 * C# exe 版直接 spawn；PS 版经 powershell -File。
 * ⚠️ 必须 detached:false：实测 node spawn + detached:true 时子进程会立即退出。
 */
function spawnTray(config) {
  const program = config.trayProgram ?? config.trayScript
  if (!program) return
  let child
  if (/\.exe$/i.test(program)) {
    child = spawn(program, ['-NoBrowser'], { windowsHide: true, detached: false, stdio: 'ignore' })
  } else {
    child = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
      '-File', program, '-NoBrowser',
    ], { windowsHide: true, detached: false, stdio: 'ignore' })
  }
  child.on('error', (err) => console.warn('[tray-manager] 托盘进程 spawn 错误:', err?.code ?? err?.message ?? err))
  child.on('exit', (code) => {
    if (code !== 0) console.warn(`[tray-manager] 托盘进程退出 code=${code}`)
  })
  child.unref()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 拉起托盘并验证：查询 → spawn → 等待 → 复查，最多 3 次。 */
async function ensureTray(config) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const before = await queryTray(config.timeoutMs)
    if (before.running) {
      console.log(`[tray-manager] 托盘已在运行 (pid=${before.pid})`)
      return { ok: true, tray: before }
    }
    console.log(`[tray-manager] 拉起托盘（第 ${attempt} 次）: ${config.trayProgram ?? config.trayScript}`)
    spawnTray(config)
    await sleep(2500)
    const after = await queryTray(config.timeoutMs)
    if (after.running) {
      console.log(`[tray-manager] 托盘已就绪 (pid=${after.pid})`)
      return { ok: true, tray: after }
    }
  }
  console.warn('[tray-manager] 托盘拉起失败（已重试 3 次）')
  return { ok: false, tray: { running: false, pid: null, startedAt: null } }
}

/** 停止托盘进程（不触碰 dsh web 服务本身）。 */
async function stopTray(timeoutMs) {
  const script = `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and (( $_.Name -eq 'powershell.exe' -and $_.CommandLine -like '*DeepSeek Harness Tray.ps1*' ) -or $_.Name -eq 'DeepSeek Harness Tray.exe' ) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`
  await psRun(['-Command', script], timeoutMs)
}

// ---------------- 快捷方式（桌面 / 开机自启） ----------------

/** 用户桌面路径（处理 OneDrive 重定向）。 */
async function desktopPath(timeoutMs) {
  const out = await psRun(['-Command', '[Environment]::GetFolderPath("Desktop")'], timeoutMs)
  const p = String(out ?? '').trim().split(/\r?\n/)[0]
  return p && p.length > 2 ? p : null
}

/**
 * 通用 .lnk 创建（WScript.Shell COM）。
 * force=false 时已存在则跳过；返回 { ok, path, created }。
 */
async function createLnk(config, { lnkPath, target, args = '', icon = null, description = 'DeepSeek Harness', force = false }) {
  if (!target) throw new Error('快捷方式目标未指定')
  if (!force && existsSync(lnkPath)) return { ok: true, path: lnkPath, created: false }
  const ico = icon && existsSync(icon) ? icon : null
  const esc = buildEsc
  const parts = [
    `$ws = New-Object -ComObject WScript.Shell`,
    `$s = $ws.CreateShortcut('${esc(lnkPath)}')`,
    `$s.TargetPath = '${esc(target)}'`,
    `$s.WorkingDirectory = '${esc(dirname(target))}'`,
    `$s.Description = '${esc(description)}'`,
  ]
  if (args) parts.push(`$s.Arguments = '${esc(args)}'`)
  if (ico) parts.push(`$s.IconLocation = '${esc(ico)},0'`)
  parts.push(`$s.Save()`)
  await psRun(['-Command', parts.join('; ')], config.timeoutMs)
  if (!existsSync(lnkPath)) throw new Error(`快捷方式创建失败（path=${lnkPath}）`)
  return { ok: true, path: lnkPath, created: true }
}

/**
 * 创建桌面快捷方式（目标=启动器 VBS，图标=DeepSeek Harness.ico）。
 * force=false 时已存在则跳过；返回 { ok, path, created }。
 */
async function createShortcut(config, { force = false } = {}) {
  if (!config.shortcutTarget) throw new Error('启动器（shortcutTarget）未配置')
  const desktop = await desktopPath(config.timeoutMs)
  if (!desktop) throw new Error('无法获取桌面路径')
  const lnk = join(desktop, `${config.shortcutName}.lnk`)
  return createLnk(config, { lnkPath: lnk, target: config.shortcutTarget, icon: config.iconPath, force })
}

/**
 * 查询/设置开机自启：注册表 Run 键（HKCU\...\CurrentVersion\Run）。
 * 用 Run 键而非启动文件夹 .lnk：WScript.Shell 存 Arguments 会剥掉引号，
 * 含空格路径的托盘脚本会被拆坏；Run 值由系统按标准命令行解析（引号有效）。
 * 命令行：<trayProgram> -NoBrowser -NoService
 *  - -NoBrowser：自启不打开网页（网页仅在双击托盘图标时打开）
 *  - -NoService：自启只启动托盘、不启动服务（服务由双击托盘/菜单启动）
 */
const RUN_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const RUN_NAME = 'DeepSeek Harness Tray'

async function autostartCommandLine(config) {
  const program = config.trayProgram ?? config.trayScript
  if (!program) throw new Error('未配置托盘程序（trayScript）')
  // C# exe 版：直接运行（Run 值引号有效）
  if (/\.exe$/i.test(program)) return `"${program}" -NoBrowser -NoService`
  // PS 版（legacy，仅作回退）：powershell -File 包装
  const ps = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32\\WindowsPowerShell\\v1.0\\powershell.exe')
  return `"${ps}" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${program}" -NoBrowser -NoService`
}

async function getAutostart(config) {
  const script = `$v = Get-ItemProperty -Path '${RUN_KEY}' -Name '${RUN_NAME}' -ErrorAction SilentlyContinue; if ($v) { Write-Output ('VALUE=' + $v.'${RUN_NAME}') }`
  const out = await psRun(['-Command', script], config.timeoutMs)
  const m = /^VALUE=(.+)$/m.exec(out)
  if (!m) return { enabled: false, command: null }
  return { enabled: true, command: m[1].trim() }
}

async function setAutostart(config, enabled) {
  if (!config.trayScript) throw new Error('未配置托盘脚本（trayScript）')
  if (enabled) {
    const cmd = await autostartCommandLine(config)
    const script = `Set-ItemProperty -Path '${RUN_KEY}' -Name '${RUN_NAME}' -Value '${cmd}' -Force`
    await psRun(['-Command', script], config.timeoutMs)
  } else {
    const script = `Remove-ItemProperty -Path '${RUN_KEY}' -Name '${RUN_NAME}' -ErrorAction SilentlyContinue`
    await psRun(['-Command', script], config.timeoutMs)
  }
  const state = await getAutostart(config)
  return { ok: true, enabled: state.enabled, command: state.command }
}

// ---------------- WER 抑制弹窗（0xc0000142 根治方案，可逆） ----------------

const WER_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\Windows Error Reporting\\Disabled'
const WER_APP = 'node.exe'

/** 查询是否已为 node.exe 禁用 WER 弹窗。 */
async function getWer(config) {
  const script = `$v = Get-ItemProperty -Path '${WER_KEY}' -Name '${WER_APP}' -ErrorAction SilentlyContinue; if ($v) { Write-Output ('ENABLED=' + $v.'${WER_APP}') }`
  const out = await psRun(['-Command', script], config.timeoutMs)
  const m = /^ENABLED=(.+)$/m.exec(out)
  return { enabled: !!m && String(m[1]).trim() !== '0' }
}

/** 设置/取消 node.exe 的 WER 禁用（写入 HKCU 注册表，可逆）。 */
async function setWer(config, enabled) {
  if (enabled) {
    // Disabled 键可能从未创建（Set-ItemProperty 要求父键存在，否则写入静默失败），
    // 写入前先确保键存在
    const script = `$k = '${WER_KEY}'; if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }; Set-ItemProperty -Path $k -Name '${WER_APP}' -Value 1 -Force`
    await psRun(['-Command', script], config.timeoutMs)
  } else {
    const script = `Remove-ItemProperty -Path '${WER_KEY}' -Name '${WER_APP}' -ErrorAction SilentlyContinue`
    await psRun(['-Command', script], config.timeoutMs)
  }
  return getWer(config)
}

// ---------------- HTTP 工具 ----------------

async function readBody(req, maxBytes = 65536) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > maxBytes) throw new Error('body too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** 写操作同源校验：JSON Content-Type + Origin 与 Host 一致（防跨站触发本地操作）。 */
function sameOriginGuard(req) {
  const contentType = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/json') return '请求必须为 application/json'
  const host = String(req.headers.host ?? '')
  const origin = String(req.headers.origin ?? '')
  if (origin === '') return '缺少 Origin 头，已拒绝'
  try {
    if (new URL(origin).host !== host) return '跨站请求已拒绝'
  } catch {
    return '跨站请求已拒绝'
  }
  return null
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** 审计日志：追加一行到 dsh-tray.log（与托盘脚本同格式，单行追加线程安全）。 */
function auditLog(config, message) {
  try {
    if (!config.logFile) return
    const stamp = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const ts = `${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())} ${pad(stamp.getHours())}:${pad(stamp.getMinutes())}:${pad(stamp.getSeconds())}`
    appendFileSync(config.logFile, `[${ts}] [tray-manager] ${message}\n`, 'utf8')
  } catch { /* 日志失败不影响操作 */ }
}

// ---------------- Web API ----------------

/**
 * 安装 Web API（前缀 /tray-manager）。
 * 路由：
 *   GET  /api/status              → { ok, tray:{running,pid,startedAt}, script:{path,exists}, logFile }
 *   GET  /api/settings            → { ok, visible }
 *   POST /api/settings            → { ok }（同源校验；{ visible: bool } 写 dsh-tray-settings.json）
 *   GET  /api/shortcut/status     → { ok, path, exists }
 *   POST /api/shortcut/create     → { ok, path, created }（同源校验；force=1 强制重建）
 *   POST /api/tray/start          → { ok, tray }（同源校验）
 *   POST /api/tray/stop           → { ok, tray }（同源校验）
 *   GET  /api/log?lines=N         → { ok, path, lines[] }
 */
function installApi(ctx, config) {
  const handler = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname
    try {
      if (req.method === 'GET' && path === '/tray-manager/api/autostart') {
        const state = await getAutostart(config)
        sendJson(res, 200, { ok: true, ...state })
        return
      }
      if (req.method === 'POST' && path === '/tray-manager/api/autostart') {
        const guard = sameOriginGuard(req)
        if (guard) { sendJson(res, 403, { ok: false, error: guard }); return }
        let body
        try { body = JSON.parse(await readBody(req)) } catch { sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' }); return }
        if (typeof body?.enabled !== 'boolean') { sendJson(res, 400, { ok: false, error: 'enabled 必须是布尔值' }); return }
        try {
          const r = await setAutostart(config, body.enabled)
          auditLog(config, `开机自启：${body.enabled ? '开启' : '关闭'}`)
          sendJson(res, 200, r)
        } catch (err) {
          sendJson(res, 500, { ok: false, error: String(err?.message ?? err) })
        }
        return
      }
      if (req.method === 'GET' && path === '/tray-manager/api/wer') {
        const state = await getWer(config)
        sendJson(res, 200, { ok: true, ...state })
        return
      }
      if (req.method === 'POST' && path === '/tray-manager/api/wer') {
        const guard = sameOriginGuard(req)
        if (guard) { sendJson(res, 403, { ok: false, error: guard }); return }
        let body
        try { body = JSON.parse(await readBody(req)) } catch { sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' }); return }
        if (typeof body?.enabled !== 'boolean') { sendJson(res, 400, { ok: false, error: 'enabled 必须是布尔值' }); return }
        try {
          const state = await setWer(config, body.enabled)
          auditLog(config, `WER 抑制弹窗 ${body.enabled ? '开启' : '关闭'} (node.exe)`)
          sendJson(res, 200, { ok: true, ...state })
        } catch (err) {
          sendJson(res, 500, { ok: false, error: String(err?.message ?? err) })
        }
        return
      }
      if (req.method === 'GET' && path === '/tray-manager/api/settings') {
        let settings = { visible: true, notifyStart: true, notifyStop: true }
        if (config.settingsFile && existsSync(config.settingsFile)) {
          try {
            const j = JSON.parse(readFileSync(config.settingsFile, 'utf8'))
            if (typeof j.visible === 'boolean') settings.visible = j.visible
            if (typeof j.notifyStart === 'boolean') settings.notifyStart = j.notifyStart
            if (typeof j.notifyStop === 'boolean') settings.notifyStop = j.notifyStop
          } catch { /* 损坏则用默认 */ }
        }
        sendJson(res, 200, { ok: true, ...settings })
        return
      }
      if (req.method === 'POST' && path === '/tray-manager/api/settings') {
        const guard = sameOriginGuard(req)
        if (guard) { sendJson(res, 403, { ok: false, error: guard }); return }
        let body
        try { body = JSON.parse(await readBody(req)) } catch { sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' }); return }
        // 可选字段：visible / notifyStart / notifyStop（至少一个，均须布尔）
        const patch = {}
        for (const key of ['visible', 'notifyStart', 'notifyStop']) {
          if (body[key] !== undefined) {
            if (typeof body[key] !== 'boolean') { sendJson(res, 400, { ok: false, error: `${key} 必须是布尔值` }); return }
            patch[key] = body[key]
          }
        }
        if (Object.keys(patch).length === 0) { sendJson(res, 400, { ok: false, error: '没有可保存的设置字段' }); return }
        if (!config.settingsFile) { sendJson(res, 400, { ok: false, error: '未配置 settingsFile（托盘脚本路径无效）' }); return }
        // 合并写入：保留托盘自报的 trayScript 等字段
        let merged = {}
        if (existsSync(config.settingsFile)) {
          try { merged = JSON.parse(readFileSync(config.settingsFile, 'utf8')) } catch { /* 损坏则重建 */ }
        }
        const payload = JSON.stringify(mergeSettings(merged, patch), null, 2)
        writeFileSync(config.settingsFile, payload, { encoding: 'utf8' }) // Node 默认 UTF-8 无 BOM ✓
        auditLog(config, `托盘设置更新：${Object.keys(patch).join(', ')}`)
        sendJson(res, 200, { ok: true, ...patch })
        return
      }
      if (req.method === 'GET' && path === '/tray-manager/api/status') {
        const tray = await queryTray(config.timeoutMs)
        sendJson(res, 200, {
          ok: true,
          tray,
          script: { path: config.trayScript, exists: config.trayScript !== null },
          logFile: config.logFile,
        })
        return
      }
      if (req.method === 'GET' && path === '/tray-manager/api/shortcut/status') {
        const desktop = await desktopPath(config.timeoutMs)
        const lnk = desktop ? join(desktop, `${config.shortcutName}.lnk`) : null
        sendJson(res, 200, { ok: true, path: lnk, exists: !!lnk && existsSync(lnk) })
        return
      }
      if (req.method === 'POST' && path === '/tray-manager/api/shortcut/create') {
        const guard = sameOriginGuard(req)
        if (guard) { sendJson(res, 403, { ok: false, error: guard }); return }
        const force = url.searchParams.get('force') === '1'
        const result = await createShortcut(config, { force })
        auditLog(config, `桌面快捷方式：${result.created ? '已生成' : '已存在/已重建'} ${result.path ?? ''}`)
        sendJson(res, 200, result)
        return
      }
      if (req.method === 'POST' && path === '/tray-manager/api/tray/start') {
        const guard = sameOriginGuard(req)
        if (guard) { sendJson(res, 403, { ok: false, error: guard }); return }
        if (!config.trayScript) { sendJson(res, 400, { ok: false, error: '未配置托盘脚本（trayScript）' }); return }
        const result = await ensureTray(config)
        auditLog(config, `启动托盘：${result.ok ? `成功 (pid=${result.tray?.pid})` : '失败'}`)
        sendJson(res, result.ok ? 200 : 500, result)
        return
      }
      if (req.method === 'POST' && path === '/tray-manager/api/tray/stop') {
        const guard = sameOriginGuard(req)
        if (guard) { sendJson(res, 403, { ok: false, error: guard }); return }
        await stopTray(config.timeoutMs)
        await new Promise((r) => setTimeout(r, 800))
        const tray = await queryTray(config.timeoutMs)
        auditLog(config, `停止托盘：${tray.running ? '仍在运行' : '已停止'}`)
        sendJson(res, 200, { ok: !tray.running, tray })
        return
      }
      if (req.method === 'GET' && path === '/tray-manager/api/log/open') {
        if (!config.logFile) { sendJson(res, 400, { ok: false, error: '未配置日志文件' }); return }
        try {
          // explorer /select 选中日志文件；失败则退化为打开所在目录
          const sel = spawn('explorer.exe', [`/select,${config.logFile}`], { stdio: 'ignore', windowsHide: true })
          sel.on('error', () => {
            try { spawn('explorer.exe', [dirname(config.logFile)], { stdio: 'ignore', windowsHide: true }) } catch { /* noop */ }
          })
          sendJson(res, 200, { ok: true })
        } catch {
          sendJson(res, 500, { ok: false, error: '打开失败' })
        }
        return
      }
      if (req.method === 'GET' && path === '/tray-manager/api/log') {
        const lines = Math.min(Number(url.searchParams.get('lines') ?? config.logLines) || config.logLines, 1000)
        if (!config.logFile || !existsSync(config.logFile)) {
          sendJson(res, 200, { ok: true, path: config.logFile, lines: [] })
          return
        }
        const text = readFileSync(config.logFile, 'utf8')
        sendJson(res, 200, { ok: true, path: config.logFile, lines: text.split(/\r?\n/).filter(Boolean).slice(-lines) })
        return
      }
      sendJson(res, 404, { ok: false, error: 'not found' })
    } catch (err) {
      sendJson(res, 500, { ok: false, error: String(err?.message ?? err) })
    }
  }
  return ctx.webServer.register({ kind: 'prefix', path: '/tray-manager', handler })
}

export function apply(ctx, rawConfig = {}) {
  const config = resolveConfig(rawConfig)

  // 1) Web API（可选服务：动态注入，无 webServer 的 profile 上插件照常加载）
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => installApi(webCtx, config))
  })

  // 2) 启动后置任务（不阻塞启动，失败仅告警）：
  //    - 自动补桌面快捷方式（缺失时）
  //    - 自动拉起托盘（未运行时）——保证任何入口启动 dsh web 都有托盘
  if (config.autoCreateShortcut || config.autoSpawnTray) {
    setTimeout(() => {
      void (async () => {
        // 同步探测链没找到托盘脚本时，再经桌面快捷方式反推（异步）
        if (!config.trayScript) await probeFromDesktopShortcut(config)
        if (config.autoCreateShortcut) {
          try {
            const r = await createShortcut(config)
            if (r.created) console.log(`[tray-manager] 桌面快捷方式已生成: ${r.path}`)
          } catch (err) {
            console.warn('[tray-manager] 自动生成快捷方式失败:', err?.message ?? err)
          }
        }
        if (config.autoSpawnTray) {
          try {
            if (config.trayScript) await ensureTray(config)
          } catch (err) {
            console.warn('[tray-manager] 自动拉起托盘失败:', err?.message ?? err)
          }
        }
      })()
    }, 4000)
  }
}
