import { useEffect, useRef } from 'react'
import { useSession } from '../state/session.jsx'

/*
 * The in-duel video call, in three pieces that sit where the battle screen
 * has room: a header action, a strip for ringing, and controls above the
 * hold-to-end bar. The gap stays the hero throughout.
 */

const inCall = (call) => call?.status === 'connecting' || call?.status === 'live'

/** Header action: start a call when there is none. */
export function CallButton() {
  const { call, startCall } = useSession()
  if (call) return null
  return (
    <button onClick={startCall} className="label -my-5 min-h-[56px] pl-4 text-indigo">
      Video call
    </button>
  )
}

/** Ringing, in either direction. Inline rather than modal: the gap stays up. */
export function CallStrip() {
  const { call, match, acceptCall, declineCall, endCall } = useSession()

  if (call?.status === 'outgoing') {
    return (
      <div className="flex items-center justify-between border-b border-rule py-1">
        <span className="label text-muted">
          Calling {match?.opponent?.displayName ?? 'opponent'}…
        </span>
        <button onClick={endCall} className="label min-h-[56px] pl-4 text-garnet">
          Cancel
        </button>
      </div>
    )
  }

  if (call?.status === 'incoming') {
    return (
      <div className="border-b border-rule py-4">
        <p className="label text-indigo">
          {call.from?.displayName ?? 'Your opponent'} is calling
        </p>
        <div className="mt-3 flex gap-2">
          <button onClick={declineCall} className="btn btn-outline flex-1">Decline</button>
          <button onClick={acceptCall} className="btn btn-primary flex-1">Accept</button>
        </div>
      </div>
    )
  }

  return null
}

/** The opponent's picture, tucked into the corner above the gap. */
export function CallVideo() {
  const { call, match } = useSession()
  const videoRef = useRef(null)
  const visible = inCall(call)
  const stream = call?.remoteStream ?? null

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.srcObject = stream
    if (stream) el.play().catch(() => {})
  }, [stream, visible])

  if (!visible) return null

  const initial = (match?.opponent?.displayName ?? '?').trim().charAt(0).toUpperCase()
  return (
    <div className="absolute right-0 top-4 h-[128px] w-[96px] overflow-hidden border border-rule bg-paper">
      {/* Always mounted, so their voice plays even with their camera off. */}
      <video ref={videoRef} autoPlay playsInline className="size-full object-cover" />
      {(!stream || !call.remoteCamera) && (
        <div className="absolute inset-0 flex items-center justify-center bg-paper">
          <span className="display text-[48px] text-ink">{initial}</span>
        </div>
      )}
    </div>
  )
}

/** Camera, mute and hang up while a call is up. */
export function CallControls() {
  const { call, toggleCamera, toggleMute, endCall } = useSession()
  if (!inCall(call)) return null

  const control = 'label flex min-h-[56px] flex-1 items-center justify-center rounded-full border'
  return (
    <div className="pb-4">
      <p className="label pb-2 text-muted">{call.status === 'live' ? 'On call' : 'Connecting…'}</p>
      <div className="flex gap-2">
        <button
          onClick={toggleCamera}
          disabled={!call.hasCamera}
          className={`${control} border-ink text-ink disabled:opacity-30`}
        >
          {call.camera ? 'Camera off' : 'Camera on'}
        </button>
        <button onClick={toggleMute} className={`${control} border-ink text-ink`}>
          {call.muted ? 'Unmute' : 'Mute'}
        </button>
        <button onClick={endCall} className={`${control} border-garnet text-garnet`}>
          End
        </button>
      </div>
    </div>
  )
}
