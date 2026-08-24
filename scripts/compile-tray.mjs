// Compile the lightweight C# tray (DeepSeek Harness Tray.exe) with the
// offline .NET Framework 4.8 compiler. Usage:
//   node scripts/compile-tray.mjs [output-dir]
// Default output: ./tray (the committed build artifact; deploy by copying
// the exe next to the launcher VBS). Override with argv[2] or DSH_TRAY_EXE_OUT.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'tray', 'DeepSeekHarnessTray.cs')
const ICO = process.env.DSH_TRAY_ICO || join(ROOT, 'tray', 'DeepSeek Harness.ico')
const OUT_DIR = process.env.DSH_TRAY_EXE_OUT || resolve(process.argv[2] ?? join(ROOT, 'tray'))
const OUT = join(OUT_DIR, 'DeepSeek Harness Tray.exe')

const CANDIDATES = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
]
const csc = CANDIDATES.find((p) => existsSync(p))
if (!csc) {
  console.error('csc.exe ( .NET Framework 4.x ) not found')
  process.exit(1)
}
if (!existsSync(SRC)) {
  console.error('source not found:', SRC)
  process.exit(1)
}
mkdirSync(OUT_DIR, { recursive: true })

const args = [
  '/nologo', '/target:winexe', `/out:${OUT}`,
  '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll',
]
if (existsSync(ICO)) args.push(`/win32icon:${ICO}`)
args.push(SRC)

const r = spawnSync(csc, args, { encoding: 'utf8' })
if (r.status !== 0) {
  console.error(r.stdout || r.stderr || 'compile failed')
  process.exit(r.status ?? 1)
}
console.log('compiled:', OUT)
