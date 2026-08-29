/**
 * A thin auto-reconnecting wrapper around the browser WebSocket.
 * Same origin as the page, so the URL is derived from location.
 */
export function createSocket({ token, onMessage, onStatus }) {
  let ws = null
  let attempt = 0
  let heartbeat = null
  let reconnectTimer = null
  let closedByUs = false

  const url = () => {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    return `${scheme}://${location.host}/ws?token=${encodeURIComponent(token)}`
  }

  function connect() {
    closedByUs = false
    onStatus(attempt === 0 ? 'connecting' : 'reconnecting')
    ws = new WebSocket(url())

    ws.onopen = () => {
      attempt = 0
      onStatus('open')
      clearInterval(heartbeat)
      // Keeps presence fresh and stops idle proxies closing the socket.
      heartbeat = setInterval(() => send('ping'), 25_000)
    }

    ws.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data))
      } catch {
        /* ignore frames we cannot parse */
      }
    }

    ws.onclose = () => {
      clearInterval(heartbeat)
      if (closedByUs) return onStatus('closed')
      onStatus('offline')
      // Exponential backoff, capped, with jitter so reconnects do not sync up.
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
