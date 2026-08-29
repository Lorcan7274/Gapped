/**
 * Auto-reconnecting WebSocket keyed on the stored player id.
 * Mobile data drops constantly, so reconnection is the normal case, not an
 * error path: we back off, jitter, and resume with the same id.
 */
export function createSocket({ playerId, token, onMessage, onStatus, onDeadPlayer }) {
  let ws = null
  let attempt = 0
  let heartbeat = null
  let reconnectTimer = null
  let closedByUs = false

  const url = () => {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    const credential = token
      ? `token=${encodeURIComponent(token)}`
      : `playerId=${encodeURIComponent(playerId)}`
    return `${scheme}://${location.host}/ws?${credential}`
  }

  function connect() {
    closedByUs = false
    onStatus(attempt === 0 ? 'connecting' : 'reconnecting')
    ws = new WebSocket(url())

    ws.onopen = () => {
      attempt = 0
      onStatus('open')
      clearInterval(heartbeat)
      heartbeat = setInterval(() => send('ping'), 25_000)
    }

    ws.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data))
      } catch {
        /* ignore frames we cannot parse */
      }
    }

    ws.onclose = (event) => {
      clearInterval(heartbeat)
      if (closedByUs) return onStatus('closed')

      // 1008 is what the server sends when it does not know this player —
      // reconnecting forever with a dead id would spin.
      if (event.code === 1008) {
        onStatus('rejected')
        onDeadPlayer?.()
        return
      }

      onStatus('offline')
      const delay = Math.min(1000 * 2 ** attempt, 15_000)
      attempt += 1
      reconnectTimer = setTimeout(connect, delay + Math.random() * 500)
    }

    ws.onerror = () => ws?.close()
  }

  function send(type, payload = {}) {
    if (ws?.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify({ type, ...payload }))
    return true
  }

  function close() {
    closedByUs = true
    clearInterval(heartbeat)
    clearTimeout(reconnectTimer)
    ws?.close()
  }

  connect()
  return { send, close }
}
