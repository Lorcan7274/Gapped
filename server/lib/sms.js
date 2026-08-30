import {
  IS_PRODUCTION, TEXTBEE_API_KEY, TEXTBEE_DEVICE_ID,
} from '../config.js'

const TEXTBEE_SEND_URL = 'https://api.textbee.dev/api/v1/gateway/send-sms'

/**
 * Delivery for verification codes, through textbee (textbee.dev): an Android
 * phone paired with the account sends the text over its own SIM.
 *
 * With no TEXTBEE_API_KEY set, the code is only logged — and, when
 * AUTH_CODE_ECHO is on (the default outside production), returned in the
 * request-code response so the flow works end to end without a provider.
 *
 * Throws when a configured send is refused or unreachable, so the route can
 * tell the player instead of leaving them waiting for a text that never comes.
 */
export async function sendCode(phone, code, log) {
  if (!TEXTBEE_API_KEY) {
    if (IS_PRODUCTION) {
      log?.warn?.({ phone }, 'no TEXTBEE_API_KEY set; the code below reaches nobody by itself')
    }
    log?.info?.({ phone, code }, 'verification code issued')
    return
  }

  const res = await fetch(TEXTBEE_SEND_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': TEXTBEE_API_KEY,
    },
    body: JSON.stringify({
      recipients: [phone],
      message: `Your Gapped sign-in code is ${code}. Please do not reply.`,
      ...(TEXTBEE_DEVICE_ID ? { deviceId: TEXTBEE_DEVICE_ID } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`textbee refused the send (${res.status}): ${body.slice(0, 200)}`)
  }
  log?.info?.({ phone }, 'verification code sent via textbee')
}
