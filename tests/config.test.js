// Unit tests for dsh-tray-manager pure functions (node --test)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildEsc, mergeSettings, resolveConfig, resolveTrayProgram } from '../lib/index.js'

function makeDir() {
  return mkdtempSync(join(tmpdir(), 'dsh-tray-test-'))
}

test('buildEsc escapes single quotes', () => {
  assert.equal(buildEsc("it's"), "it''s")
  assert.equal(buildEsc('plain'), 'plain')
  assert.equal(buildEsc("a'b'c"), "a''b''c")
})

test('mergeSettings keeps existing fields and applies patch', () => {
  const merged = mergeSettings({ visible: true, trayScript: 'D:\\x\\Tray.ps1' }, { visible: false })
  assert.equal(merged.visible, false)
  assert.equal(merged.trayScript, 'D:\\x\\Tray.ps1')
  assert.deepEqual(mergeSettings(null, { a: 1 }), { a: 1 })
})

test('mergeSettings: notify fields merge without dropping others', () => {
  // 插件写单个弹窗开关时，其余设置（含托盘自报 trayScript）必须保留
  const merged = mergeSettings(
    { visible: true, notifyStart: true, notifyStop: true, trayScript: 'D:\\x\\Tray.ps1' },
    { notifyStart: false },
  )
  assert.equal(merged.notifyStart, false)
  assert.equal(merged.notifyStop, true)
  assert.equal(merged.visible, true)
  assert.equal(merged.trayScript, 'D:\\x\\Tray.ps1')
})

test('resolveConfig: explicit config wins', () => {
  const dir = makeDir()
  try {
    const script = join(dir, 'Tray.ps1')
    writeFileSync(script, '')
    const cfg = resolveConfig({ trayScript: script })
    assert.equal(cfg.trayScript, script)
    assert.equal(cfg.logFile, join(dir, 'dsh-tray.log'))
    assert.equal(cfg.settingsFile, join(dir, 'dsh-tray-settings.json'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('resolveConfig: probes DSH_TRAY_SCRIPT env (semicolon separated)', () => {
  const dir = makeDir()
  try {
    const script = join(dir, 'Tray.ps1')
    writeFileSync(script, '')
    const prev = process.env.DSH_TRAY_SCRIPT
    process.env.DSH_TRAY_SCRIPT = `${join(dir, 'missing.ps1')};${script}`
    try {
      const cfg = resolveConfig({})
      assert.equal(cfg.trayScript, script)
    } finally {
      if (prev === undefined) delete process.env.DSH_TRAY_SCRIPT
      else process.env.DSH_TRAY_SCRIPT = prev
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('resolveConfig: falls back to trayScript self-reported in settings file', () => {
  const dir = makeDir()
  try {
    const script = join(dir, 'Tray.ps1')
    writeFileSync(script, '')
    // settings 文件与脚本同目录（托盘自报路径的产物）
    const settingsFile = join(dir, 'dsh-tray-settings.json')
    writeFileSync(settingsFile, JSON.stringify({ visible: true, trayScript: script }), 'utf8')
    const prev = process.env.DSH_TRAY_SCRIPT
    delete process.env.DSH_TRAY_SCRIPT
    try {
      const cfg = resolveConfig({ settingsFile })
      assert.equal(cfg.trayScript, script)
    } finally {
      if (prev === undefined) delete process.env.DSH_TRAY_SCRIPT
      else process.env.DSH_TRAY_SCRIPT = prev
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('resolveConfig: invalid path falls back to null', () => {
  const prev = process.env.DSH_TRAY_SCRIPT
  delete process.env.DSH_TRAY_SCRIPT
  try {
    const cfg = resolveConfig({ trayScript: 'Z:\\definitely\\missing\\Tray.ps1' })
    assert.equal(cfg.trayScript, null)
    assert.equal(cfg.logFile, null)
  } finally {
    if (prev === undefined) delete process.env.DSH_TRAY_SCRIPT
    else process.env.DSH_TRAY_SCRIPT = prev
  }
})

test('resolveConfig: derives vbs/ico next to the tray script', () => {
  const dir = makeDir()
  try {
    const script = join(dir, 'DeepSeek Harness Tray.ps1')
    writeFileSync(script, '')
    const vbs = join(dir, '启动 DeepSeek Harness.vbs')
    writeFileSync(vbs, '')
    const ico = join(dir, 'DeepSeek Harness.ico')
    writeFileSync(ico, '')
    const cfg = resolveConfig({ trayScript: script })
    assert.equal(cfg.shortcutTarget, vbs)
    assert.equal(cfg.iconPath, ico)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('resolveConfig: trayScriptProbe candidates are checked in order', () => {
  const dir = makeDir()
  try {
    const first = join(dir, 'first.ps1')
    mkdirSync(join(dir, 'sub'), { recursive: true })
    const second = join(dir, 'sub', 'second.ps1')
    writeFileSync(second, '')
    const cfg = resolveConfig({ trayScriptProbe: [first, second] })
    assert.equal(cfg.trayScript, second)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('resolveTrayProgram: prefers C# exe next to the ps1 script', () => {
  const dir = makeDir()
  try {
    const script = join(dir, 'DeepSeek Harness Tray.ps1')
    writeFileSync(script, '')
    const exe = join(dir, 'DeepSeek Harness Tray.exe')
    writeFileSync(exe, '')
    const cfg = resolveTrayProgram({ trayScript: script })
    assert.equal(cfg.trayProgram, exe)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('resolveTrayProgram: falls back to ps1 when no exe exists', () => {
  const dir = makeDir()
  try {
    const script = join(dir, 'DeepSeek Harness Tray.ps1')
    writeFileSync(script, '')
    const cfg = resolveTrayProgram({ trayScript: script })
    assert.equal(cfg.trayProgram, script)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('resolveTrayProgram: exe path passed directly stays as is', () => {
  const cfg = resolveTrayProgram({ trayScript: 'C:\\x\\DeepSeek Harness Tray.exe' })
  assert.equal(cfg.trayProgram, 'C:\\x\\DeepSeek Harness Tray.exe')
})
