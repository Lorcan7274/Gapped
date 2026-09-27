import { useEffect, useRef } from 'react'
import { DuelRig } from '../lib/duelRig.js'

/**
 * What the Duel button opens: the screen floods black from below, then
 * splits into two liquid halves. The black top half is a random lobby for
 * the selected format; the white bottom half hands off to the Lobby to pick
 * a rival. A red glow bleeds up from the bottom edge — drag it up (or tap
 * it) to wash the whole thing away. All motion lives in DuelRig.
 *
 * `open` is owned by the parent; the rig reports back through `onClose`
 * whenever the sheet has left the screen.
 */
export default function DuelSheet({ open, caption, onRandom, onFriend, onClose }) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const rigRef = useRef(null)
  if (!rigRef.current) rigRef.current = new DuelRig(() => onCloseRef.current())
  const rig = rigRef.current

  useEffect(() => () => rig.destroy(), [rig])

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
        aria-label="Start a duel"
        aria-hidden={!open}
      >
        <div ref={rig.ref('sheet')} className="duel-sheet__body">
          <button
            ref={rig.ref('bottom')}
            onClick={() => {
              rig.dismiss()
              onFriend()
            }}
            className="duel-sheet__friend"
          >
            <span className="label text-muted">Or pick your rival</span>
            <span className="duel-sheet__title">Challenge a friend</span>
          </button>

          <button
            ref={rig.ref('black')}
            onClick={() => {
              onRandom()
              rig.wipe()
            }}
            className="duel-sheet__random"
          >
            <span className="label opacity-55">Find an opponent</span>
            <span className="duel-sheet__title">Random lobby</span>
            <span className="text-[13px] opacity-55">{caption}</span>
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
