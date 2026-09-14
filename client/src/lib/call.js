/**
 * The in-duel video call: one RTCPeerConnection, signalled over the duel
 * socket. Uses the "perfect negotiation" pattern so either phone can
 * renegotiate (a camera turning up late, say) without the two offers
 * colliding — the caller is impolite, the callee polite and yields.
 */

/** Camera and mic, or mic alone when there is no usable camera. */
export async function getCallMedia() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: 'user' },
    })
  } catch {
    // A voice call still beats no call.
    return navigator.mediaDevices.getUserMedia({ audio: true })
  }
}

export function createCall({ iceServers, polite, localStream, sendSignal, onRemoteStream, onState }) {
  const pc = new RTCPeerConnection({ iceServers })
  let makingOffer = false
  let ignoreOffer = false
  let tracksAdded = false

  const addTracks = () => {
    if (tracksAdded) return
    tracksAdded = true
    for (const track of localStream.getTracks()) pc.addTrack(track, localStream)
  }

  pc.onnegotiationneeded = async () => {
    try {
      makingOffer = true
      await pc.setLocalDescription()
      sendSignal({ description: pc.localDescription })
    } catch {
      /* the connection closed mid-offer */
    } finally {
      makingOffer = false
    }
  }
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) sendSignal({ candidate })
  }
  pc.ontrack = ({ streams }) => {
    if (streams[0]) onRemoteStream(streams[0])
  }
  pc.onconnectionstatechange = () => onState(pc.connectionState)

  // The caller offers straight away. The callee holds its tracks until the
  // offer lands, so they ride in the answer instead of a competing offer the
  // caller could not yet receive.
  if (!polite) addTracks()

  async function handleSignal({ description, candidate }) {
    try {
      if (description) {
        const collision =
          description.type === 'offer' && (makingOffer || pc.signalingState !== 'stable')
        ignoreOffer = !polite && collision
        if (ignoreOffer) return
        await pc.setRemoteDescription(description)
        if (description.type === 'offer') {
          addTracks()
          await pc.setLocalDescription()
          sendSignal({ description: pc.localDescription })
        }
      } else if (candidate) {
        try {
          await pc.addIceCandidate(candidate)
        } catch (err) {
          if (!ignoreOffer) throw err
        }
      }
    } catch (err) {
      console.warn('[Gapped] call signalling failed', err)
    }
  }

  function stop() {
    pc.onnegotiationneeded = pc.onicecandidate = pc.ontrack = pc.onconnectionstatechange = null
    pc.close()
  }

  return { handleSignal, stop }
}
