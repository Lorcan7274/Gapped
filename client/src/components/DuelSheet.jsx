import { useEffect, useRef } from 'react'
import { DuelRig } from '../lib/duelRig.js'
import { holdPage } from '../lib/pageCover.js'

/**
 * What the Run tab's start button opens: the screen floods black from below,
 * then splits into two liquid halves — the black top and the white bottom,
 * each a choice the caller names ({ label, title, caption, onPick }). A red
 * glow bleeds up from the bottom edge — drag it up (or tap it) to wash the
 * whole thing away. All motion lives in DuelRig.
 *
 * Either pick flings the sheet off the top. The top's choice acts at once,
 * so what it opens is revealed underneath as the sheet flies; the bottom's
 * acts once the sheet is gone, so nothing heavy (the running screen and its
 * map) mounts mid-flight and costs the animation a frame.
 * `open` is owned by the parent; the rig reports back through `onClose`
 * whenever the sheet has left the screen.
 */
export default function DuelSheet({ open, top, bottom, onClose }) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const afterRef = useRef(null) // a pick waiting for the sheet to leave
  // What the sheet covers stops painting (lib/pageCover.js). A top pick
  // keeps the hold until the sheet is gone: the screen it opened is taking
  // over the cover underneath, and the background must not come back between.
  const holdRef = useRef(null)
  const keepHoldRef = useRef(false)
  const cover = (state) => {
    if (state) {
      if (holdRef.current) holdRef.current(state === 'covered' ? 'full' : 'dim')
      else holdRef.current = holdPage(state === 'covered' ? 'full' : 'dim')
    } else if (!keepHoldRef.current) {
      holdRef.current?.()
      holdRef.current = null
    }
  }
  const rigRef = useRef(null)
  if (!rigRef.current) {
    rigRef.current = new DuelRig(() => {
      onCloseRef.current()
      keepHoldRef.current = false
      cover(false)
      const after = afterRef.current
      afterRef.current = null
      after?.()
    }, (state) => cover(state))
  }
  const rig = rigRef.current

  useEffect(
    () => () => {
      rig.destroy()
      keepHoldRef.current = false
      holdRef.current?.()
      holdRef.current = null
    },
    [rig]
  )

  useEffect(() => {
    if (open && !rig.active) rig.open()
  }, [open, rig])

  // Escape is the keyboard's swipe up.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && rig.washFlood()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, rig])

  return (
    <>
      <div
        className={`duel-sheet fixed inset-y-0 left-0 right-0 z-[60] mx-auto max-w-[430px] overflow-hidden ${
          open ? '' : 'invisible pointer-events-none'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Solo or duel"
        aria-hidden={!open}
      >
        <div ref={rig.ref('sheet')} className="duel-sheet__body">
          <button
            ref={rig.ref('bottom')}
            onClick={() => {
              afterRef.current = bottom.onPick
              rig.wipe()
            }}
            className="duel-sheet__friend"
          >
            <span className="label text-muted">{bottom.label}</span>
            <span className="duel-sheet__title">{bottom.title}</span>
            {bottom.caption && <span className="text-[13px] text-muted">{bottom.caption}</span>}
          </button>

          <button
            ref={rig.ref('black')}
            onClick={() => {
              keepHoldRef.current = true
              top.onPick()
              rig.wipe()
            }}
            className="duel-sheet__random"
          >
            <span className="label opacity-55">{top.label}</span>
            <span className="duel-sheet__title">{top.title}</span>
            {top.caption && <span className="text-[13px] opacity-55">{top.caption}</span>}
            <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="duel-sheet__wave" aria-hidden="true">
              <path ref={rig.ref('wave')} d="M0,0 H100 V2 C 83,2 67,2 50,2 C 33,2 17,2 0,2 Z" />
            </svg>
          </button>

          <span className="duel-sheet__bleed" aria-hidden="true" />

          <button
            ref={rig.ref('cancel')}
            onPointerDown={(e) => rig.washStart(e)}
            onPointerMove={(e) => rig.washMove(e)}
            onPointerUp={() => rig.washEnd()}
            onPointerCancel={() => rig.washEnd()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && rig.washFlood()}
            className="duel-sheet__cancel label"
          >
            <svg viewBox="0 0 24 24" className="duel-sheet__chevron" aria-hidden="true">
              <path d="M6 15 L12 9 L18 15" />
            </svg>
            Swipe up to cancel
          </button>
        </div>
      </div>
      <div
        ref={rig.ref('wash')}
        className="pointer-events-none fixed inset-y-0 left-0 right-0 z-[61] mx-auto max-w-[430px]"
        aria-hidden="true"
      >
        <div className="absolute inset-0 mix-blend-screen" />
      </div>
    </>
  )
}
