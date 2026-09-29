/**
 * Smoothness: while something opaque covers the Run tab, the page beneath
 * stops painting what nobody can see. Anything that covers it takes a hold:
 *   'dim'  — partly covered (the Solo/Duel sheet rising from the bottom):
 *            the background's drift pauses and the tab bar drops its blur,
 *            both hidden first as the sheet comes up;
 *   'full' — fully covered (the sheet settled, the Duels screen): the
 *            background leaves the page, and the shader tiers stop their
 *            render loops.
 * The page is restored only when no hold is left, so handing over from one
 * cover to the next (the sheet flying off to reveal Duels) never repaints
 * the background in between — that repaint was a half-second stall.
 * Touches only those elements: a class on <html> would restyle everything.
 */
const holds = new Map()
let next = 0

function apply() {
  const levels = [...holds.values()]
  const dim = levels.length > 0
  const full = levels.includes('full')
  const bg = document.querySelector('.rank-bg')
  const nav = document.querySelector('.glass-nav')
  const drift = bg?.querySelector('.rank-bg__ember')
  if (drift) drift.style.animationPlayState = dim ? 'paused' : ''
  if (nav) {
    nav.style.backdropFilter = dim ? 'none' : ''
    nav.style.webkitBackdropFilter = dim ? 'none' : ''
  }
  if (bg) bg.style.display = full ? 'none' : ''
}

/** Take a hold at `level`. Returns update(level) to change it, or update() to let go. */
export function holdPage(level) {
  const id = ++next
  holds.set(id, level)
  apply()
  return (to) => {
    if (to) holds.set(id, to)
    else holds.delete(id)
    apply()
  }
}
