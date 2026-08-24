/**
 * dsh-tray-manager — client entry.
 *
 * 在「设置 → 插件」分区注册「托盘管理」标签页（settings.plugins.tab slot，
 * 官方约定：功能插件通过此 slot 贡献页面）：快捷方式管理 + 托盘状态 +
 * 启动/停止 + 日志尾部，数据来自服务端 /tray-manager/api 路由。
 */
import type { Context } from 'cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { TrayManagerView } from './TrayManagerView.tsx'

/** 本插件拥有的 locale 命名空间。 */
const NS = 'tray-manager'

export type TrayManagerKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'tray-manager': TrayManagerKey
  }
}

/** 简体中文词典（键集合的权威来源）。 */
export const zh = {
  'tab.label': '托盘管理',
  'shortcut.title': '桌面快捷方式',
  'shortcut.hint': '安装插件时自动生成；若被误删，点击下方按钮重新生成',
  'shortcut.create': '生成快捷方式',
  'shortcut.created': '已生成：{path}',
  'shortcut.exists': '已存在：{path}',
  'shortcut.recreated': '已重建：{path}',
  'shortcut.failed': '生成失败：{message}',
  'shortcut.missing': '快捷方式当前不存在',
  'settings.title': '托盘图标',
  'settings.visible': '显示托盘图标',
  'settings.visible.hint': '关闭后托盘进程照常运行，但图标隐藏（服务不受影响）；重新开启即可恢复显示。若图标被系统折叠到「^」溢出区，可手动拖回固定。',
  'settings.notifyStart': '启动/重启完成弹窗',
  'settings.notifyStart.hint': '服务启动或重启完成（含失败）时显示气泡通知；关闭后全部静默，仅写入日志。',
  'settings.notifyStop': '停止完成弹窗',
  'settings.notifyStop.hint': '停止服务时显示气泡通知；关闭后静默停止，仅写入日志。',
  'settings.saved': '已保存',
  'settings.failed': '保存失败：{message}',
  'autostart.enable': '开机自启（仅启动托盘，不打开网页）',
  'autostart.hint': '开机时后台启动托盘与服务；网页只在双击托盘图标时打开。',
  'autostart.saved': '已保存',
  'autostart.failed': '设置失败：{message}',
  'status.title': '托盘状态',
  'status.running': '运行中',
  'status.stopped': '未运行',
  'status.pid': '进程 ID',
  'status.started': '启动时间',
  'script.title': '托盘脚本',
  'script.path': '脚本路径',
  'script.missing': '未找到托盘脚本（trayScript 未配置或路径无效）',
  'server.title': '服务地址',
  'server.hint': '当前页面地址即 Harness 服务地址',
  'btn.start': '启动托盘',
  'btn.stop': '停止托盘',
  'btn.refresh': '刷新',
  'wer.enable': '抑制系统错误弹窗（node 启动失败不再弹窗）',
  'wer.hint': '写入注册表 HKCU\\...\\Windows Error Reporting\\Disabled\\node.exe=1，可随时关闭恢复。适用于 0xc0000142 类启动失败弹窗。',
  'log.open': '打开日志文件',
  'log.opened': '已在资源管理器中打开',
  'log.openfailed': '打开失败：{message}',
  'log.title': '运行日志（dsh-tray.log）',
  'log.empty': '暂无日志',
  'op.error': '操作失败：{message}',
  'load.error': '加载失败：{message}',
} as const

/** English dictionary（键与 zh 完全一致）。 */
export const en: Record<TrayManagerKey, string> = {
  'tab.label': 'Tray Manager',
  'shortcut.title': 'Desktop shortcut',
  'shortcut.hint': 'Created automatically on install; click below to recreate if deleted',
  'shortcut.create': 'Create shortcut',
  'shortcut.created': 'Created: {path}',
  'shortcut.exists': 'Already exists: {path}',
  'shortcut.recreated': 'Recreated: {path}',
  'shortcut.failed': 'Failed: {message}',
  'shortcut.missing': 'Shortcut does not exist',
  'settings.title': 'Tray icon',
  'settings.visible': 'Show tray icon',
  'settings.visible.hint': 'When off, the tray process keeps running but the icon is hidden (service unaffected); turn it back on to restore. If the system folds the icon into the "chevron" overflow area, drag it back to pin it.',
  'settings.notifyStart': 'Startup/restart balloon',
  'settings.notifyStart.hint': 'Show a balloon when the service starts or restarts (including failures); when off, all startup notifications are silent and only logged.',
  'settings.notifyStop': 'Stop balloon',
  'settings.notifyStop.hint': 'Show a balloon when the service stops; when off, stopping is silent and only logged.',
  'settings.saved': 'Saved',
  'settings.failed': 'Save failed: {message}',
  'autostart.enable': 'Start tray on boot (no web page)',
  'autostart.hint': 'Starts the tray and service in the background at logon; the web page opens only when you double-click the tray icon.',
  'autostart.saved': 'Saved',
  'autostart.failed': 'Failed: {message}',
  'wer.enable': 'Suppress system error dialogs (no popup on node startup failure)',
  'wer.hint': 'Writes HKCU\\...\\Windows Error Reporting\\Disabled\\node.exe=1; reversible. For 0xc0000142-style startup failure dialogs.',
  'log.open': 'Open log file',
  'log.opened': 'Opened in Explorer',
  'log.openfailed': 'Failed: {message}',
  'status.title': 'Tray status',
  'status.running': 'Running',
  'status.stopped': 'Not running',
  'status.pid': 'PID',
  'status.started': 'Started at',
  'script.title': 'Tray script',
  'script.path': 'Script path',
  'script.missing': 'Tray script not found (trayScript unset or invalid)',
  'server.title': 'Service URL',
  'server.hint': 'The current page URL is the Harness service URL',
  'btn.start': 'Start tray',
  'btn.stop': 'Stop tray',
  'btn.refresh': 'Refresh',
  'log.title': 'Log tail (dsh-tray.log)',
  'log.empty': 'No log yet',
  'op.error': 'Operation failed: {message}',
  'load.error': 'Load failed: {message}',
}

/** 移动端适配声明（协议字段名勿改；空对象 = 不提供额外适配）。 */
export const dshMobile = {}

export const inject = ['slots', 'locale']

export function apply(ctx: Context): void {
  const t = ctx.locale.bind(NS) as unknown as Translate

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'tray-manager: dictionaries')

  ctx.slots.inject('settings.plugins.tab', () =>
    ctx.slots.register({
      name: 'settings.plugins.tab',
      id: 'tray-manager',
      order: 30,
      label: () => t('tab.label'),
      locale: NS,
    }, (props) => TrayManagerView({ ...props, t })))
}
