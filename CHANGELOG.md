# Changelog

All notable changes to this project are documented in this file.

## [1.0.0] - 2026-08-25

First stable release.

### Added
- **Settings → Plugins → Tray Manager** tab (official `settings.plugins.tab` slot): desktop shortcut management, tray icon show/hide, **startup/stop balloon switches**, autostart (registry `Run` key), WER suppression switch, tray status/start/stop, log tail + open-in-Explorer.
- Automatic desktop-shortcut creation and tray bring-up on every `dsh web` boot (silent).
- Triple probe chain for the tray path: config / `DSH_TRAY_SCRIPT` env → settings-file self-report → desktop-shortcut reverse-lookup.
- Lightweight C# tray (`DeepSeek Harness Tray.exe`, ~10-30 MB RAM; single maintained implementation — the PowerShell version was dropped).
- Tray features: right-click menu (open/start/stop/restart/status/dsh version/docs/exit), icon states (running=blue, stopped=black/white by system theme, starting=dark-blue→blue flash), double-click to open web (60 s debounce for auto/double triggers; the menu "open web" always responds), async start/restart with retry ≤3 and 90 s timeout, `-NoService` autostart mode (tray only, no service/web page), two balloon notifications only (start/stop, each toggleable), theme-aware stopped icon (black on light / white on dark), background port probing (no UI freeze when stopped).
- Audit log (`[tray-manager]` lines in `dsh-tray.log`).
- Unit tests (probe chain, settings merge, escaping, exe preference) — 12 tests.

### Fixed
- Stop service no-op when adopting an existing server (`taskkill /PID 0` → port-owner lookup via `netstat`).
- Right-click menu freeze when the service is stopped (connect to an idle port took ~2 s; now background probing + 500 ms timeout).
- WER toggle appearing to save but reverting after ~10 s (the `Disabled` registry key was never created; now auto-created before write, and the UI reflects the real persisted state).
- Tray self-report corrupting the settings JSON (trailing-comma merge bug).
- Flash starting on the bright frame instead of the dim frame.

### Removed
- PowerShell tray implementation (`DeepSeek Harness Tray.ps1`, ~110 MB RAM) — frozen/legacy, no longer shipped; C# version is the only maintained implementation.
- All tray balloons except startup and stop (debounce hints, "already running", "starting…", adopt notices).
