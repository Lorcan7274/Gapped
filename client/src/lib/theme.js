import { useCallback, useSyncExternalStore } from 'react'

/**
 * Light is the default; dark is a choice that sticks. The choice lives on
 * <html data-theme> — index.html applies the stored value before the first
 * paint, so a reload never flashes the wrong theme — and every colour in
 * the app is a token that reads that attribute, so switching is one write.
 */
const STORAGE_KEY = 'gapped.theme'
const TRANSITION_MS = 480
const THEME_COLOR = { light: '#fafaf7', dark: '#121211' }

const listeners = new Set()
let settle = null

export function getTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function setTheme(next) {
  const root = document.documentElement
  if (getTheme() === next) return

  // Every colour on the page eases over together, then the blanket
  // transition comes off again so it cannot slow down ordinary interaction.
  root.classList.add('theme-transition')
  clearTimeout(settle)
  settle = setTimeout(() => root.classList.remove('theme-transition'), TRANSITION_MS)

  root.dataset.theme = next
  root.style.colorScheme = next
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[next])
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* storage blocked: the choice lasts for this visit */
  }
  listeners.forEach((fn) => fn())
}

const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => 'light')
  const toggle = useCallback(() => setTheme(getTheme() === 'dark' ? 'light' : 'dark'), [])
  return { theme, dark: theme === 'dark', setTheme, toggle }
}
