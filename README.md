# dsh-tray-manager

DeepSeek Harness 托盘与启动器管理器（dsh web 插件）。**v1.0.0**

在 **dsh web 界面**（设置 → 插件 → 托盘管理）中管理托盘启动器：桌面快捷方式、图标显示/隐藏、弹窗开关、开机自启、WER 抑制、托盘启停、日志查看；每次 `dsh web` 启动时自动补齐桌面快捷方式并拉起托盘。

> **设计说明**：Node 没有原生托盘 API，托盘图标必须由外部进程承载，因此本插件**操控**一个独立的托盘程序 —— 轻量 C# 版（`DeepSeek Harness Tray.exe`，内存约 10-30 MB）。插件刻意**不**停止 `dsh web` 服务本身 —— 那会杀死正在提供本面板的进程。

---

## 功能

### 管理面板（设置 → 插件 → 托盘管理）

- **桌面快捷方式**：状态显示 + 「生成快捷方式」按钮（缺失时自动重建）
- **托盘图标显示/隐藏** 开关（进程照常运行，仅隐藏图标）
- **启动/重启完成弹窗** 与 **停止完成弹窗** 开关（全流程只保留这两个气泡，其余弹窗已全部移除：防抖提示、已在运行、启动中、重启中、接管提示）
- **开机自启** 开关（注册表 Run 键；`-NoBrowser -NoService`：**只启动托盘，不启动服务、不开网页**；服务由双击托盘或菜单启动）
- **抑制系统错误弹窗** 开关（WER `Disabled\node.exe=1`，可逆；适用于 0xc0000142 类 node 启动失败弹窗）
- **托盘状态** / 启动 / 停止 / 刷新
- **日志尾部** + 「打开日志文件」按钮
- 面板所有写操作均审计记录到 `dsh-tray.log`（`[tray-manager]` 前缀）

### 每次 dsh web 启动时（静默）

- 桌面快捷方式缺失时自动重建
- 托盘未运行时自动拉起（`-NoBrowser`）
- 托盘路径**三重探测链**：配置 / `DSH_TRAY_SCRIPT` 环境变量 → 设置文件自报（托盘写自己的路径）→ 桌面快捷方式目标反推

### 托盘

- 右键菜单：打开网页 / 启动服务 / 停止服务 / 重启服务 / 状态 / **dsh 版本** / 使用说明 / 退出
- **图标三态**：运行 = DeepSeek 蓝；停止 = 按系统主题（浅色主题黑 / 深色主题白，实时跟随 `AppsUseLightTheme`）；启动中 = 暗蓝→蓝 500ms 闪烁
- 双击托盘打开网页（服务未运行则先启动）；60s 防抖仅作用于双击/VBS 触发（防双开），菜单「打开网页」**永远响应**；服务未运行时点「打开网页」会**就绪后再打开**（不显示连接失败页）
- `-NoService` 参数：托盘启动时不启动/接管服务（开机自启用）
- 设置文件 `dsh-tray-settings.json`（UTF-8 无 BOM）：`{ visible, notifyStart, notifyStop, trayScript }` —— 托盘自报路径并每 3s 热读开关，面板修改无需重启托盘即生效
- 单元测试（探测链 / 设置合并 / 转义 / exe 优先）：`npm test`

---

## 安装

```powershell
# 从 git 仓库安装（推荐）
dsh plugin --profile web add github:919huiyi/dsh-tray-manager

# 或从本地目录安装（可修改插件内容）
dsh plugin --profile web add <path-to-this-folder>
```

包声明了 `dsh.bundle.patch`，`dsh plugin add` 会自动把它追加到 `dsh.profile.bundles`；bundle 补丁 `cordis.patch.yml`（插入行）由启动加载器应用。**不要在 profile 补丁中重复添加相同的 `id`**。安装后重启 `dsh web`。卸载：`dsh plugin --profile web remove dsh-tray-manager`。

---

## 托盘实现

唯一实现：轻量 C# 托盘（`DeepSeek Harness Tray.exe`，内存约 10-30 MB，瞬时启动，无编码坑）。

### 构建与部署

```powershell
node scripts\compile-tray.mjs   
```

exe 是**随仓库提交的构建产物**。**部署** = 把 `tray\DeepSeek Harness Tray.exe` 复制到启动器组件（`launcher\启动 DeepSeek Harness.vbs` + `launcher\DeepSeek Harness.ico`）所在目录 —— 插件的探测链和启动器 VBS 都期望这个目录布局。输出目录可用参数或 `DSH_TRAY_EXE_OUT` 覆盖。

---

## 启动器组件（launcher/）

`launcher/` 目录提供桌面入口组件（与托盘 exe 放在同一目录）：

| 文件 | 用途 |
|---|---|
| `启动 DeepSeek Harness.vbs` | 隐藏启动托盘（优先 exe）；托盘已在运行时仅打开网页 |
| `DeepSeek Harness.ico` | 托盘与快捷方式图标 |
| `使用说明.md` | 托盘菜单「使用说明」打开的文档 |

目标机器上的启动器目录布局：`DeepSeek Harness Tray.exe` + `启动 DeepSeek Harness.vbs` + `DeepSeek Harness.ico` + `dsh-tray.log`（运行时）+ `dsh-tray-settings.json`（运行时）。

---

## 配置

```yaml
# profile cordis.patch.yml
- id: dsh-tray-manager
  config:
    trayScript: "C:\\path\\to\\DeepSeek Harness Tray.exe"
    shortcutName: "DeepSeek Harness"
    autoCreateShortcut: true
    autoSpawnTray: true
    # trayScriptProbe: [...]           # 候选路径（默认读取 $DSH_TRAY_SCRIPT）
    # logFile / timeoutMs / logLines
```

---

## 开发

```powershell
npm install            # esbuild (devDependency)
node scripts\build.mjs # 构建 src/client → lib/client.js（随仓库提交；安装前必需）
node scripts\compile-tray.mjs  # 可选：编译 C# 托盘 exe
npm test               # 单元测试（探测链 / 设置合并 / 转义 / exe 优先）
```

- `lib/client.js` 是随仓库提交的构建产物（线格式 `window.__ModuleLoader__.load({ id, factory })`，平台模块 external）。
- 服务端零运行时依赖（node 内置模块 + 进程外 PowerShell）。
- 托盘部分仅 Windows；插件本身跨平台。

---

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/tray-manager/api/status` | 托盘与脚本状态 |
| GET | `/tray-manager/api/settings` | 图标显隐 + 弹窗开关（`visible` / `notifyStart` / `notifyStop`） |
| POST | `/tray-manager/api/settings` | 设置任意字段（同源校验，合并写入） |
| GET | `/tray-manager/api/autostart` | 开机自启状态（注册表 Run 键） |
| POST | `/tray-manager/api/autostart` | 设置自启（同源校验） |
| GET | `/tray-manager/api/wer` | WER 抑制状态 |
| POST | `/tray-manager/api/wer` | 设置 WER 抑制（同源校验；自动创建 `Disabled` 键） |
| GET | `/tray-manager/api/shortcut/status` | 快捷方式路径与存在性 |
| POST | `/tray-manager/api/shortcut/create` | 创建/重建快捷方式（`?force=1`） |
| POST | `/tray-manager/api/tray/start` | 启动托盘（重试 3 次） |
| POST | `/tray-manager/api/tray/stop` | 停止托盘（不影响 dsh web） |
| GET | `/tray-manager/api/log?lines=N` | 日志尾部 |
| GET | `/tray-manager/api/log/open` | 在资源管理器中定位日志 |

---

## 许可证

MIT

---

---

# dsh-tray-manager

Tray & launcher manager for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh). **v1.0.0**

Manage the tray launcher **from the dsh web UI**: a "托盘管理 / Tray Manager" tab under **Settings → Plugins**, plus automatic desktop-shortcut and tray bring-up on every `dsh web` boot.

> **Design note**: the tray icon itself must live in an external process (Node has no native tray API), so this plugin **pilots** a tray launcher — the lightweight C# version (`DeepSeek Harness Tray.exe`, ~10-30 MB RAM). The old PowerShell tray (`DeepSeek Harness Tray.ps1`, ~110 MB RAM) was **dropped** — the C# version is the only maintained implementation. The plugin intentionally does **not** stop the `dsh web` service itself — that would kill the very process serving this panel.

---

## Features

### Panel (Settings → Plugins → Tray Manager)

- **Desktop shortcut**: status + **Create shortcut** button (auto-recreated when missing)
- Tray icon **show/hide** switch (process keeps running, icon hidden)
- **Startup/restart balloon** switch and **Stop balloon** switch (the only two tray balloons; all other popups removed — debounce hints, "already running", "starting…", adopt notices)
- **Start tray on boot** switch (registry `Run` key; `-NoBrowser -NoService`: **tray only — no service, no web page**; the service starts on double-click or the menu)
- **Suppress system error dialogs** switch (WER `Disabled\node.exe=1`, reversible — silences 0xc0000142-style node startup failure popups)
- **Tray status** / Start / Stop / Refresh
- **Log tail** + **Open log file** button
- All panel actions are audit-logged to `dsh-tray.log` (`[tray-manager]` prefix)

### On every `dsh web` boot (silent)

- Recreates the desktop shortcut if missing
- Brings up the tray if not running (`-NoBrowser`)
- Triple probe chain for the tray path: config / `DSH_TRAY_SCRIPT` env → settings-file self-report (the tray writes its own path) → desktop-shortcut target reverse-lookup

### Tray (C#)

- Right-click menu: open web / start / stop / restart service / status / **dsh version** / docs / exit
- Icon states: **running** = DeepSeek blue, **stopped** = black on light theme / white on dark theme (auto-detected, follows the system theme live), **starting** = dark-blue→blue 500ms flash
- Double-click opens the web page (starting the service first if needed); a 60 s debounce window applies to double-click/VBS triggers only (prevents duplicate tabs) — the menu "open web" **always responds**; when the service is down it opens **after the service is ready** (no connection-failed page)
- `-NoService` flag: tray boots without starting/adopting the service (used by autostart)
- Settings file (`dsh-tray-settings.json`, UTF-8 no BOM): `{ visible, notifyStart, notifyStop, trayScript }` — the tray self-reports its path and refreshes switches every 3 s, so panel changes apply without restarting the tray
- Unit tests for the probe/merge/escape logic (`npm test`)

---

## Install

```powershell
# from a git repository (recommended)
dsh plugin --profile web add github:919huiyi/dsh-tray-manager

# or from a local checkout (paths with spaces: use a junction or copy to a
# space-free path — `dsh plugin add` splits arguments on spaces)
dsh plugin --profile web add <path-to-this-folder>
```

The package declares `dsh.bundle.patch`, so `dsh plugin add` appends it to `dsh.profile.bundles` automatically; the bundle `cordis.patch.yml` (insert row) is applied by the boot loader. **Do not** add the same `id` again in the profile patch. Restart `dsh web` afterwards. Uninstall: `dsh plugin --profile web remove dsh-tray-manager`.

---

## Tray implementation

Single implementation: the lightweight C# tray (`DeepSeek Harness Tray.exe`, ~10-30 MB RAM, instant startup, no encoding pitfalls). The old PowerShell tray was dropped for its ~110 MB RAM footprint.

### Build & deploy

```powershell
node scripts\compile-tray.mjs   # compiles tray\DeepSeekHarnessTray.cs → tray\DeepSeek Harness Tray.exe (offline .NET Framework 4.8 csc)
```

The exe is a **committed build artifact**. **Deploy** by copying `tray\DeepSeek Harness Tray.exe` next to the launcher components (`launcher\启动 DeepSeek Harness.vbs` + `launcher\DeepSeek Harness.ico`) on the target machine — the plugin's probe chain and the launcher VBS expect that folder layout. Override the output dir with an argument or `DSH_TRAY_EXE_OUT`.

---

## Launcher components (`launcher/`)

The `launcher/` folder ships the desktop entry point (copy them next to the tray exe):

| File | Purpose |
|---|---|
| `启动 DeepSeek Harness.vbs` | Hidden start of the tray (prefers the exe); if the tray is already running it just opens the web page |
| `DeepSeek Harness.ico` | Tray & shortcut icon |
| `使用说明.md` | User docs opened from the tray menu |

Expected launcher folder layout on the target machine: `DeepSeek Harness Tray.exe` + `启动 DeepSeek Harness.vbs` + `DeepSeek Harness.ico` + `dsh-tray.log` (runtime) + `dsh-tray-settings.json` (runtime).

---

## Configure

```yaml
# profile cordis.patch.yml
- id: dsh-tray-manager
  config:
    trayScript: "C:\\path\\to\\DeepSeek Harness Tray.exe"
    shortcutName: "DeepSeek Harness"
    autoCreateShortcut: true
    autoSpawnTray: true
    # trayScriptProbe: [...]           # candidates (default: $DSH_TRAY_SCRIPT)
    # logFile / timeoutMs / logLines
```

---

## Development

```powershell
npm install            # esbuild (devDependency)
node scripts\build.mjs # build src/client → lib/client.js (committed; required before install)
node scripts\compile-tray.mjs  # optional: build the C# tray exe
npm test               # unit tests (probe chain, settings merge, esc, exe preference)
```

- `lib/client.js` is a committed build artifact (wire format `window.__ModuleLoader__.load({ id, factory })`, platform modules external).
- Server half: zero runtime dependencies (node built-ins + out-of-process PowerShell).
- Windows-only for the tray half; the plugin itself is cross-platform.

---

## API

| Method | Path | Description |
|---|---|---|
| GET | `/tray-manager/api/status` | tray / script status |
| GET | `/tray-manager/api/settings` | tray icon visibility + balloon switches (`visible` / `notifyStart` / `notifyStop`) |
| POST | `/tray-manager/api/settings` | set any of `visible` / `notifyStart` / `notifyStop` (same-origin guarded, merge-written) |
| GET | `/tray-manager/api/autostart` | autostart state (registry Run key) |
| POST | `/tray-manager/api/autostart` | set autostart (same-origin guarded) |
| GET | `/tray-manager/api/wer` | WER suppression state |
| POST | `/tray-manager/api/wer` | set WER suppression (same-origin guarded; auto-creates the `Disabled` key) |
| GET | `/tray-manager/api/shortcut/status` | desktop shortcut path & existence |
| POST | `/tray-manager/api/shortcut/create` | create / recreate shortcut (`?force=1`) |
| POST | `/tray-manager/api/tray/start` | start tray (retries ×3) |
| POST | `/tray-manager/api/tray/stop` | stop tray (does not touch `dsh web`) |
| GET | `/tray-manager/api/log?lines=N` | `dsh-tray.log` tail |
| GET | `/tray-manager/api/log/open` | reveal `dsh-tray.log` in Explorer |

---

## License

MIT
