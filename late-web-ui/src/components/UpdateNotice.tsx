import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { APP_VERSION } from '@/lib/version'

type Source = 'shell' | 'radio' | 'chat'

interface OutdatedInfo {
  sources: Set<Source>
}

const POLL_MS = 30_000
const AUTO_RELOAD_MS = 5_000

function isUserBusy(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return false
}

function readSeen(): Record<Source, string> {
  try {
    const raw = localStorage.getItem('late.seen')
    if (raw) return JSON.parse(raw) as Record<Source, string>
  } catch { /* ignore */ }
  return { shell: APP_VERSION, radio: '', chat: '' }
}

function writeSeen(seen: Record<Source, string>) {
  try { localStorage.setItem('late.seen', JSON.stringify(seen)) } catch { /* ignore */ }
}

function clearContentCache(): Promise<void> {
  return new Promise((resolve) => {
    // Never touch auth tokens — only remove content caches (Cache API + our
    // own version marker) so the next load fetches the newest shell/MF files.
    const dropSeen = () => {
      try { localStorage.removeItem('late.seen') } catch { /* ignore */ }
    }

    const cachesApi = (typeof window !== 'undefined' && 'caches' in window)
      ? (window as unknown as { caches: CacheStorage }).caches
      : undefined

    if (!cachesApi?.keys) {
      dropSeen()
      resolve()
      return
    }

    cachesApi.keys().then((names) => {
      return Promise.all(names.map((name) => cachesApi.delete(name)))
    }).catch(() => {
      // ignore — some private modes block CacheStorage
    }).finally(() => {
      dropSeen()
      resolve()
    })
  })
}

async function applyUpdate() {
  await clearContentCache()
  // Safari (especially iOS) keeps immutable HTTP-cache entries even after
  // CacheStorage is wiped. A plain location.reload() can still serve the
  // cached index.html / MF files. We force a hard navigation with a unique
  // query string so the browser treats it as a brand-new request. The query
  // param is consumed by nginx and never read by the app.
  const url = new URL(location.href)
  url.searchParams.set('late_cb', Date.now().toString())
  location.href = url.toString()
}

async function fetchManifest(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { version?: string }
    return data.version ?? null
  } catch {
    return null
  }
}

export function UpdateNotice() {
  const [info, setInfo] = useState<OutdatedInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const loc = useLocation()

  useEffect(() => {
    if (!info || dismissed) return
    // ponytail: auto-reload after AUTO_RELOAD_MS so the user doesn't
    // have to click the button. We delay if they're typing into an
    // input/textarea/contenteditable, and re-check periodically while
    // the toast is up. Cancel button in the toast stops the timer.
    let cancelled = false
    let timer: number | null = null
    const arm = () => {
      if (cancelled) return
      if (isUserBusy()) {
        timer = window.setTimeout(arm, 1_500)
        return
      }
      timer = window.setTimeout(() => {
        if (!cancelled && !isUserBusy()) applyUpdate()
      }, AUTO_RELOAD_MS)
    }
    arm()
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [info, dismissed])

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      const [shellV, radioV, chatV] = await Promise.all([
        fetchManifest('/version.json'),
        fetchManifest('/micro/radio/latest.json'),
        fetchManifest('/micro/chat/latest.json'),
      ])
      if (cancelled) return
      const current = readSeen()

      // On first run (or after clearing storage/caches), seed with the
      // versions the server is currently reporting. Do NOT fire the toast
      // for the version the user just loaded — that would cause a reload
      // loop on every fresh session/cache clear.
      if (current.radio === '' || current.chat === '') {
        writeSeen({
          shell: shellV || APP_VERSION,
          radio: radioV || current.radio,
          chat: chatV || current.chat,
        })
        return
      }

      const outdated = new Set<Source>()
      if (shellV && shellV !== APP_VERSION && shellV !== current.shell) outdated.add('shell')
      if (radioV && radioV !== current.radio) outdated.add('radio')
      if (chatV && chatV !== current.chat) outdated.add('chat')
      if (outdated.size > 0) {
        // Mark as seen so the next tick doesn't double-fire. The user
        // either reloads (which updates APP_VERSION on next mount) or
        // they don't, and we stop pestering them.
        writeSeen({
          shell: outdated.has('shell') ? shellV! : current.shell,
          radio: outdated.has('radio') ? radioV! : current.radio,
          chat:  outdated.has('chat')  ? chatV!  : current.chat,
        })
        setInfo({ sources: outdated })
      }
    }

    tick()
    const t = setInterval(tick, POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!info || info.sources.size === 0 || dismissed) return null

  // Only show the toast for the source the user is actually looking at.
  // The shell update is global; the micro updates only matter on their
  // route. Showing a chat-upgrade toast while the user is on /icecast
  // is the kind of noise that gets the notice ignored forever.
  const visible: Source[] = []
  for (const s of info.sources) {
    if (s === 'shell') visible.push('shell')
    else if (s === 'radio' && loc.pathname === '/icecast') visible.push('radio')
    else if (s === 'chat' && loc.pathname === '/irc') visible.push('chat')
  }
  if (visible.length === 0) return null

  const label = visible.length === 1
    ? `Nueva versión de ${visible[0]} disponible`
    : 'Nueva versión disponible'

  return (
    <div
      role="status"
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 sm:gap-3 bg-accent text-white text-xs sm:text-sm font-medium px-3 sm:px-4 py-2 sm:py-2.5 rounded-full shadow-lg shadow-accent/40 max-w-[calc(100vw-1.5rem)]"
    >
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">Actualización</span>
      <button
        onClick={() => applyUpdate()}
        className="bg-white text-accent px-2.5 py-1 rounded-full font-bold hover:bg-accent/10"
      >
        Actualizar
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="bg-accent/40 text-white/90 hover:text-white hover:bg-accent/70 px-2 py-1 rounded-full font-medium"
        aria-label="Cancelar actualización"
        title="Cancelar"
      >
        ✕
      </button>
    </div>
  )
}
