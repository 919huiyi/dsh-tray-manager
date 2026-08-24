/**
 * Build the dsh-tray-manager client bundle.
 *
 * 与 dsh-memory-evolve 同款线格式：window.__ModuleLoader__.load({ id, factory })，
 * 平台模块经注入的 require（loader 模块表）解析，其余全部内联。
 *
 * esbuild 解析顺序：
 *   1. $DSH_SOURCE 指定的 DSH 源码检出（官方惯例 ~/.dsh/source/current）
 *   2. 插件本地 node_modules（npm install --save-dev esbuild）
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CHECKOUT = process.env.DSH_SOURCE ?? join(homedir(), '.dsh/source/current')
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const PLUGIN_ID = MANIFEST.name

/** 平台模块表（与 packages/client/web/src/platform.ts + 运行时豁免保持一致）。 */
const EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
]

function resolveEsbuild() {
  // 1) DSH 源码检出（pnpm store 或 hoisted）
  const store = join(CHECKOUT, 'node_modules/.pnpm')
  if (existsSync(store)) {
    const entries = readdirSync(store).filter((n) => n.startsWith('esbuild@')).sort()
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const candidate = join(store, entries[i], 'node_modules/esbuild/package.json')
      if (existsSync(candidate)) return candidate
    }
  }
  const hoisted = join(CHECKOUT, 'node_modules/esbuild/package.json')
  if (existsSync(hoisted)) return hoisted
  // 2) 插件本地 devDependency
  const local = join(ROOT, 'node_modules/esbuild/package.json')
  if (existsSync(local)) return local
  throw new Error(`esbuild not found (checked DSH_SOURCE=${CHECKOUT} and local node_modules). Run: npm install --save-dev esbuild`)
}

const require = createRequire(resolveEsbuild())
const esbuild = require('esbuild')

const banner = [
  `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
  'var module = { exports: {} }; var exports = module.exports;',
].join('\n')
const footer = 'return module.exports; } });'

await esbuild.build({
  entryPoints: [join(ROOT, 'src/client/index.ts')],
  outfile: join(ROOT, 'lib/client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external: EXTERNALS,
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.env.MODE': '"production"',
    'import.meta.env': '{"MODE":"production"}',
  },
  loader: { '.css': 'text' },
  banner: { js: banner },
  footer: { js: footer },
})

console.log('lib/client.js built')
