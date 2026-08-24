/**
 * 托盘管理面板（设置 → 插件 → 托盘管理）：
 * 快捷方式管理 + 托盘状态 + 启动/停止 + 日志尾部。
 * 纯 React（无第三方依赖），样式内联，遵循 DSH 客户端平台模块约定。
 */
import { useEffect, useState, type CSSProperties } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'

interface Props {
  t: Translate
}

interface TrayState {
  running: boolean
  pid: number | null
  startedAt: string | null
}

interface Status {
  ok: boolean
  tray: TrayState
  script: { path: string | null; exists: boolean }
  logFile: string | null
}

interface ShortcutStatus {
  ok: boolean
  path: string | null
  exists: boolean
}

interface ShortcutResult {
  ok: boolean
  path?: string
  created?: boolean
  error?: string
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/tray-manager${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function TrayManagerView(props: Props): JSX.Element {
  const { t } = props
  const [status, setStatus] = useState<Status | null>(null)
  const [shortcut, setShortcut] = useState<ShortcutStatus | null>(null)
  const [shortcutMsg, setShortcutMsg] = useState<string | null>(null)
  const [shortcutBusy, setShortcutBusy] = useState(false)
  const [visible, setVisible] = useState<boolean | null>(null)
  const [notifyStart, setNotifyStart] = useState<boolean | null>(null)
  const [notifyStop, setNotifyStop] = useState<boolean | null>(null)
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null)
  const [autoStart, setAutoStart] = useState<boolean | null>(null)
  const [autoStartMsg, setAutoStartMsg] = useState<string | null>(null)
  const [wer, setWer] = useState<boolean | null>(null)
  const [werMsg, setWerMsg] = useState<string | null>(null)
  const [logMsg, setLogMsg] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    try {
      const s = await api<Status>('/api/status')
      setStatus(s)
      setError(null)
      const sc = await api<ShortcutStatus>('/api/shortcut/status')
      setShortcut(sc)
      const st = await api<{ visible: boolean; notifyStart: boolean; notifyStop: boolean }>('/api/settings')
      setVisible(st.visible)
      setNotifyStart(st.notifyStart)
      setNotifyStop(st.notifyStop)
      const as = await api<{ enabled: boolean }>('/api/autostart')
      setAutoStart(as.enabled)
      const wr = await api<{ enabled: boolean }>('/api/wer')
      setWer(wr.enabled)
      const l = await api<{ lines: string[] }>('/api/log?lines=100')
      setLog(l.lines)
    } catch (err) {
      setError(String((err as Error)?.message ?? err))
    }
  }

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 10000)
    return () => clearInterval(timer)
  }, [])

  const run = async (action: 'start' | 'stop'): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const r = await api<{ ok: boolean }>(`/api/tray/${action}`, { method: 'POST' })
      if (!r.ok) setError(t('op.error', { message: String(action) }))
    } catch (err) {
      setError(String((err as Error)?.message ?? err))
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  const createShortcut = async (force: boolean): Promise<void> => {
    setShortcutBusy(true)
    setShortcutMsg(null)
    try {
      const r = await api<ShortcutResult>(`/api/shortcut/create${force ? '?force=1' : ''}`, { method: 'POST' })
      if (!r.ok || !r.path) {
        setShortcutMsg(t('shortcut.failed', { message: r.error ?? 'unknown' }))
      } else if (force || r.created) {
        setShortcutMsg(r.created ? t('shortcut.created', { path: r.path }) : t('shortcut.recreated', { path: r.path }))
      } else {
        setShortcutMsg(t('shortcut.exists', { path: r.path }))
      }
    } catch (err) {
      setShortcutMsg(t('shortcut.failed', { message: String((err as Error)?.message ?? err) }))
    } finally {
      setShortcutBusy(false)
      void refresh()
    }
  }

  const toggleVisible = async (next: boolean): Promise<void> => {
    setSettingsMsg(null)
    try {
      const r = await api<{ ok: boolean }>('/api/settings', { method: 'POST', body: JSON.stringify({ visible: next }) })
      if (!r.ok) {
        setSettingsMsg(t('settings.failed', { message: 'server' }))
        return
      }
      setVisible(next)
      setSettingsMsg(t('settings.saved'))
    } catch (err) {
      setSettingsMsg(t('settings.failed', { message: String((err as Error)?.message ?? err) }))
    }
  }

  const toggleNotify = async (key: 'notifyStart' | 'notifyStop', next: boolean): Promise<void> => {
    setSettingsMsg(null)
    try {
      const r = await api<{ ok: boolean }>('/api/settings', { method: 'POST', body: JSON.stringify({ [key]: next }) })
      if (!r.ok) {
        setSettingsMsg(t('settings.failed', { message: 'server' }))
        return
      }
      if (key === 'notifyStart') setNotifyStart(next)
      else setNotifyStop(next)
      setSettingsMsg(t('settings.saved'))
    } catch (err) {
      setSettingsMsg(t('settings.failed', { message: String((err as Error)?.message ?? err) }))
    }
  }

  const toggleAutoStart = async (next: boolean): Promise<void> => {
    setAutoStartMsg(null)
    try {
      const r = await api<{ ok: boolean }>('/api/autostart', { method: 'POST', body: JSON.stringify({ enabled: next }) })
      if (!r.ok) {
        setAutoStartMsg(t('autostart.failed', { message: 'server' }))
        return
      }
      setAutoStart(next)
      setAutoStartMsg(t('autostart.saved'))
    } catch (err) {
      setAutoStartMsg(t('autostart.failed', { message: String((err as Error)?.message ?? err) }))
    }
  }

  const toggleWer = async (next: boolean): Promise<void> => {
    setWerMsg(null)
    try {
      const r = await api<{ ok: boolean; enabled: boolean }>('/api/wer', { method: 'POST', body: JSON.stringify({ enabled: next }) })
      if (!r.ok) {
        setWerMsg(t('settings.failed', { message: 'server' }))
        return
      }
      // 以服务端实际状态为准：写入失败时立即回退，避免"勾选过一会儿消失"
      setWer(r.enabled)
      setWerMsg(r.enabled === next ? t('settings.saved') : t('settings.failed', { message: 'write' }))
    } catch (err) {
      setWerMsg(t('settings.failed', { message: String((err as Error)?.message ?? err) }))
    }
  }

  const openLog = async (): Promise<void> => {
    setLogMsg(null)
    try {
      await api<{ ok: boolean }>('/api/log/open')
      setLogMsg(t('log.opened'))
    } catch (err) {
      setLogMsg(t('log.openfailed', { message: String((err as Error)?.message ?? err) }))
    }
  }

  const box: CSSProperties = { border: '1px solid var(--dsh-border, #444)', borderRadius: 8, padding: 12, marginBottom: 12, maxWidth: 720 }
  const row: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0', flexWrap: 'wrap' }
  const btn: CSSProperties = { padding: '6px 14px', borderRadius: 6, border: '1px solid #888', cursor: 'pointer' }
  const pre: CSSProperties = { background: 'rgba(0,0,0,0.35)', padding: 10, borderRadius: 6, fontSize: 12, maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap', margin: 0 }

  return (
    <div style={{ padding: 16 }}>
      {error !== null && <div style={{ color: '#ff6b6b', marginBottom: 8 }}>{error}</div>}

      <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('shortcut.title')}</div>
        <div style={row}>
          <span>{shortcut?.exists === true ? '●' : '○'} {shortcut?.path ?? t('shortcut.missing')}</span>
        </div>
        <div style={{ color: '#999', fontSize: 12, margin: '4px 0 8px' }}>{t('shortcut.hint')}</div>
        <div style={row}>
          <button style={btn} disabled={shortcutBusy} onClick={() => void createShortcut(false)}>{t('shortcut.create')}</button>
        </div>
        {shortcutMsg !== null && <div style={{ color: '#999', fontSize: 12, marginTop: 6 }}>{shortcutMsg}</div>}
      </div>

      <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('settings.title')}</div>
        <label style={{ ...row, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={visible === true}
            disabled={visible === null}
            onChange={(e) => void toggleVisible(e.target.checked)}
          />
          <span>{t('settings.visible')}</span>
        </label>
        <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>{t('settings.visible.hint')}</div>
        <label style={{ ...row, cursor: 'pointer', marginTop: 10 }}>
          <input
            type="checkbox"
            checked={notifyStart === true}
            disabled={notifyStart === null}
            onChange={(e) => void toggleNotify('notifyStart', e.target.checked)}
          />
          <span>{t('settings.notifyStart')}</span>
        </label>
        <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>{t('settings.notifyStart.hint')}</div>
        <label style={{ ...row, cursor: 'pointer', marginTop: 10 }}>
          <input
            type="checkbox"
            checked={notifyStop === true}
            disabled={notifyStop === null}
            onChange={(e) => void toggleNotify('notifyStop', e.target.checked)}
          />
          <span>{t('settings.notifyStop')}</span>
        </label>
        <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>{t('settings.notifyStop.hint')}</div>
        {settingsMsg !== null && <div style={{ color: '#999', fontSize: 12, marginTop: 6 }}>{settingsMsg}</div>}
        <label style={{ ...row, cursor: 'pointer', marginTop: 10 }}>
          <input
            type="checkbox"
            checked={autoStart === true}
            disabled={autoStart === null}
            onChange={(e) => void toggleAutoStart(e.target.checked)}
          />
          <span>{t('autostart.enable')}</span>
        </label>
        <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>{t('autostart.hint')}</div>
        {autoStartMsg !== null && <div style={{ color: '#999', fontSize: 12, marginTop: 6 }}>{autoStartMsg}</div>}
        <label style={{ ...row, cursor: 'pointer', marginTop: 10 }}>
          <input
            type="checkbox"
            checked={wer === true}
            disabled={wer === null}
            onChange={(e) => void toggleWer(e.target.checked)}
          />
          <span>{t('wer.enable')}</span>
        </label>
        <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>{t('wer.hint')}</div>
        {werMsg !== null && <div style={{ color: '#999', fontSize: 12, marginTop: 6 }}>{werMsg}</div>}
      </div>

      <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('status.title')}</div>
        <div style={row}>
          <span>{status?.tray.running ? '● ' + t('status.running') : '○ ' + t('status.stopped')}</span>
          {status?.tray.running && status.tray.pid != null && (
            <span style={{ color: '#999' }}>{t('status.pid')}: {status.tray.pid}</span>
          )}
          {status?.tray.running && status.tray.startedAt != null && (
            <span style={{ color: '#999' }}>{t('status.started')}: {status.tray.startedAt}</span>
          )}
        </div>
        <div style={row}>
          <button style={btn} disabled={busy || status?.tray.running === true} onClick={() => void run('start')}>{t('btn.start')}</button>
          <button style={btn} disabled={busy || status?.tray.running !== true} onClick={() => void run('stop')}>{t('btn.stop')}</button>
          <button style={btn} disabled={busy} onClick={() => void refresh()}>{t('btn.refresh')}</button>
        </div>
      </div>

      <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('script.title')}</div>
        {status?.script.exists === true ? (
          <div style={row}><span style={{ color: '#999' }}>{t('script.path')}:</span><code>{status.script.path}</code></div>
        ) : (
          <div style={{ color: '#ffa94d' }}>{t('script.missing')}</div>
        )}
        <div style={{ fontWeight: 600, margin: '10px 0 6px' }}>{t('server.title')}</div>
        <div style={row}><code>{typeof window !== 'undefined' ? window.location.origin : ''}</code></div>
        <div style={{ color: '#999', fontSize: 12 }}>{t('server.hint')}</div>
      </div>

      <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{t('log.title')}</span>
          <button style={btn} onClick={() => void openLog()}>{t('log.open')}</button>
        </div>
        {logMsg !== null && <div style={{ color: '#999', fontSize: 12, marginBottom: 6 }}>{logMsg}</div>}
        {log.length > 0 ? <pre style={pre}>{log.join('\n')}</pre> : <div style={{ color: '#999' }}>{t('log.empty')}</div>}
      </div>
    </div>
  )
}
