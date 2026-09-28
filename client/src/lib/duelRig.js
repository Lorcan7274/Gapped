/**
 * Physics for the Duel sheet, driven straight on the DOM every frame so
 * React never re-renders mid-motion. Three bodies, each a damped spring:
 *
 * - the sheet: rises from below as one solid black liquid, and is flung off
 *   the top when a choice is made;
 * - the seam between the black and white halves: pours down from the top
 *   once the sheet lands and sloshes around the midline until it finds its
 *   level, its edge drawn as superposed travelling waves whose amplitude
 *   follows the seam's velocity;
 * - the red wash: dragged up from "Swipe up to cancel". Let go early and it
 *   springs back with a wiggle sized to the pull; pull far or flick and it
 *   floods the whole screen and carries the sheet away with it.
 *
 * `onHidden` fires once the sheet is gone, however it left.
 */
const WAVE_MODES = [[0.055, 1.0], [0.11, 0.52], [0.19, 0.3], [0.31, 0.16]]

const frameDt = (now, last) => Math.min(0.032, Math.max(0.001, (now - last) / 1000))

export class DuelRig {
  constructor(onHidden) {
    this.onHidden = onHidden
    this.el = { sheet: null, black: null, wave: null, bottom: null, cancel: null, wash: null }
    this.active = false
    this._y = 0; this._v = 0; this._raf = null
    this._sy = 0; this._sv = 0; this._sraf = null; this._seamT = null; this._amp = 0
    this._wy = 0; this._wv = 0; this._wraf = null; this._wdrag = null; this._washHid = false
    this._winUp = () => this.washEnd()
  }

  ref = (name) => (node) => { this.el[name] = node }

  sheetH() { return this.el.sheet ? this.el.sheet.offsetHeight : window.innerHeight }

  open() {
    this.active = true
    // A flood from the last cancel may still be travelling off the top on a
    // slow device; left running, it would cross the line again and close
    // this sheet the moment it opened.
    this.stopSpring(); this.stopWash()
    if (this._sraf) cancelAnimationFrame(this._sraf)
    this._sraf = null
    this._wdrag = null
    const h = this.sheetH()
    this._y = h * 1.18; this._v = 0; this.applyY()
    // Rise fully black; the seam pours in afterwards.
    this._sy = h * 1.02; this._sv = 0; this.applySeam()
    this._wy = 0; this._wv = 0; this._washHid = false; this.applyWash()
    this.springTo(0, 110, 12)
    clearTimeout(this._seamT)
    this._seamT = setTimeout(() => this.seamSpring(), 120)
  }

  hide() {
    if (!this.active) return
    this.active = false
    this.onHidden?.()
  }

  /** Pull the sheet down at once, with no exit motion (a choice elsewhere). */
  dismiss() {
    this.stopSpring()
    this.hide()
  }

  destroy() {
    this.stopSpring(); this.stopWash()
    if (this._sraf) cancelAnimationFrame(this._sraf)
    clearTimeout(this._seamT)
    window.removeEventListener('pointerup', this._winUp)
    window.removeEventListener('pointercancel', this._winUp)
  }

  // --- sheet -------------------------------------------------------------

  applyY() {
    if (this.el.sheet) this.el.sheet.style.transform = `translateY(${this._y}px)`
  }

  stopSpring() {
    if (this._raf) cancelAnimationFrame(this._raf)
    this._raf = null
  }

  /** Every sheet motion runs through one integrator so momentum carries over. */
  springTo(target, k, c, onSettle) {
    this.stopSpring()
    let last = performance.now()
    const step = (now) => {
      const dt = frameDt(now, last); last = now
      this._v += (-k * (this._y - target) - c * this._v) * dt
      this._y += this._v * dt
      if (Math.abs(this._y - target) < 0.4 && Math.abs(this._v) < 8) {
        this._y = target; this._v = 0; this.applyY(); this._raf = null
        onSettle?.()
        return
      }
      this.applyY()
      this._raf = requestAnimationFrame(step)
    }
    this._raf = requestAnimationFrame(step)
  }

  /** Fling the whole sheet off the top, back to Home. */
  wipe() {
    this.springTo(-this.sheetH() * 1.2, 60, 16, () => this.hide())
  }

  // --- seam --------------------------------------------------------------

  applySeam() {
    if (this.el.black) this.el.black.style.height = `${this._sy}px`
    const wave = this.el.wave
    if (!wave) return
    const t = performance.now() / 1000
    const a = this._amp || 0
    // Deep-water modes: phase speed ~ sqrt(k), so the components travel at
    // different rates and the crests never repeat. 48 samples reads as fluid
    // rather than as a drawn curve.
    const y = (x) => {
      let v = 2
      for (let m = 0; m < WAVE_MODES.length; m++) {
        const k = WAVE_MODES[m][0]
        v += a * WAVE_MODES[m][1] * Math.sin(x * k - t * 34 * Math.sqrt(k) + m * 1.7)
      }
      return v.toFixed(2)
    }
    let d = `M0,0 H100 V${y(100)}`
    for (let i = 47; i >= 0; i--) {
      const x = (i / 47) * 100
      d += ` L${x.toFixed(2)},${y(x)}`
    }
    wave.setAttribute('d', `${d} Z`)
  }

  seamSpring() {
    if (this._sraf) cancelAnimationFrame(this._sraf)
    const target = this.sheetH() * 0.5
    let last = performance.now()
    const step = (now) => {
      const dt = frameDt(now, last); last = now
      this._sv += (-85 * (this._sy - target) - 3.2 * this._sv) * dt
      this._sy += this._sv * dt
      this._amp = Math.max(-30, Math.min(30, this._sv * 0.055))
      if (Math.abs(this._sy - target) < 0.4 && Math.abs(this._sv) < 3) {
        this._sy = target; this._sv = 0; this.applySeam(); this._sraf = null
        this.rippleDecay()
        return
      }
      this.applySeam()
      this._sraf = requestAnimationFrame(step)
    }
    this._sraf = requestAnimationFrame(step)
  }

  /** The surface keeps rippling briefly after the level settles, then goes glassy. */
  rippleDecay() {
    if (this._sraf) cancelAnimationFrame(this._sraf)
    if (!this._amp) this._amp = 6
    let last = performance.now()
    const step = (now) => {
      const dt = frameDt(now, last); last = now
      this._amp *= Math.exp(-dt * 1.6)
      this.applySeam()
      if (Math.abs(this._amp) < 0.12) {
        this._amp = 0; this.applySeam(); this._sraf = null
        return
      }
      this._sraf = requestAnimationFrame(step)
    }
    this._sraf = requestAnimationFrame(step)
  }

  // --- red wash ----------------------------------------------------------

  applyWash() {
    const h = this.sheetH()
    const wash = this.el.wash
    if (wash) {
      const wy = this._wy
      const p = Math.max(-30, ((h - wy) / h) * 100) // glow edge, % from top
      const s = Math.min(1, Math.max(0, wy / 140)) // strength ramps with pull
      const grad = `linear-gradient(180deg, rgba(164,63,94,0) 0%, rgba(164,63,94,0) ${Math.max(-40, p - 7)}%, rgba(207,95,130,${(0.9 * s).toFixed(3)}) ${p}%, rgba(164,63,94,${(0.55 * s).toFixed(3)}) ${Math.min(100, p + 22)}%, rgba(164,63,94,${(0.3 * s).toFixed(3)}) 100%)`
      wash.style.background = grad
      // A screen-blended copy so the tint reads over the black half too.
      if (wash.firstElementChild) wash.firstElementChild.style.background = grad
      wash.style.opacity = wy > h + 80 ? Math.max(0, 1 - (wy - h - 80) / 280) : 1
    }
    const bottom = this.el.bottom
    if (bottom) bottom.style.opacity = Math.max(0, Math.min(1, 1 - (this._wy - 40) / 200))
    // The black half dissolves only once the red is near it: stops are in px
    // from the sheet top, so nothing fades while the wash is parked below.
    const black = this.el.black
    if (black) {
      const edge = h - this._wy
      const bh = black.offsetHeight || h * 0.5
      // Any mask clips the wave hanging below the box, so only mask while the
      // red is actually pulled up near it.
      if (this._wy < 60 || edge >= bh + 264) {
        for (const pre of ['-webkit-mask', 'mask']) black.style.removeProperty(`${pre}-image`)
      } else {
        const grad = `linear-gradient(180deg, #000 ${Math.max(0, edge - 220).toFixed(0)}px, transparent ${Math.max(0, edge).toFixed(0)}px)`
        for (const pre of ['-webkit-mask', 'mask']) {
          black.style.setProperty(`${pre}-image`, grad)
          black.style.setProperty(`${pre}-repeat`, 'no-repeat')
          black.style.setProperty(`${pre}-size`, '100% 100%')
          black.style.setProperty(`${pre}-position`, '0 0')
        }
      }
    }
    const cancel = this.el.cancel
    if (cancel) cancel.style.opacity = Math.max(0, Math.min(1, 1 - (this._wy - 20) / 120))
  }

  stopWash() {
    if (this._wraf) cancelAnimationFrame(this._wraf)
    this._wraf = null
  }

  washSpring(target, k, c, onSettle) {
    this.stopWash()
    let last = performance.now()
    const step = (now) => {
      const dt = frameDt(now, last); last = now
      this._wv += (-k * (this._wy - target) - c * this._wv) * dt
      this._wy += this._wv * dt
      // Once the wash covers the screen, drop the sheet behind it.
      if (!this._washHid && this._wy > this.sheetH() + 80) {
        this._washHid = true
        this.stopSpring()
        this.hide()
      }
      if (Math.abs(this._wy - target) < 0.4 && Math.abs(this._wv) < 8) {
        this._wy = target; this._wv = 0; this.applyWash(); this._wraf = null
        onSettle?.()
        return
      }
      this.applyWash()
      this._wraf = requestAnimationFrame(step)
    }
    this._wraf = requestAnimationFrame(step)
  }

  /** Red floods up over everything, then keeps travelling off the top. */
  washFlood() {
    this._washHid = false
    this.washSpring(this.sheetH() + 420, 65, 14, () => {
      this._wy = 0; this._wv = 0; this._washHid = false; this.applyWash()
    })
  }

  washStart(e) {
    if (!this.active) return
    this.stopWash()
    const now = performance.now()
    this._wdrag = { start: e.clientY, base: this._wy, lastY: e.clientY, lastT: now, t0: now, v: 0, moved: 0 }
    try {
      e.currentTarget?.setPointerCapture?.(e.pointerId)
    } catch {
      /* capture is a nicety; the window listeners below are the safety net */
    }
    // Never leave the wash stranded if the release lands somewhere else.
    window.addEventListener('pointerup', this._winUp)
    window.addEventListener('pointercancel', this._winUp)
  }

  washMove(e) {
    const d = this._wdrag
    if (!d) return
    if (e.buttons === 0) { this.washEnd(); return }
    const now = performance.now()
    const dt = Math.max(1, now - d.lastT)
    d.v = ((d.lastY - e.clientY) / dt) * 1000
    d.lastY = e.clientY; d.lastT = now
    let wy = d.base + (d.start - e.clientY) // pull up → red rises
    d.moved = Math.max(d.moved, Math.abs(d.start - e.clientY))
    if (wy < 0) wy *= 0.3 // rubber-band when pushed down
    this._wy = wy
    this.applyWash()
  }

  washEnd() {
    const d = this._wdrag
    if (!d) return
    this._wdrag = null
    window.removeEventListener('pointerup', this._winUp)
    window.removeEventListener('pointercancel', this._winUp)
    const tap = d.moved < 10 && performance.now() - d.t0 < 350
    this._wv = d.v
    // Flood only when it will clearly clear the page; otherwise always slide
    // back, underdamped, so the red edge wiggles in proportion to the pull.
    if (tap || this._wy > this.sheetH() * 0.62 || d.v > 750) this.washFlood()
    else this.washSpring(0, 170, 8)
  }
}
