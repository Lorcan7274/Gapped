import {
  IS_PRODUCTION, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM,
} from '../config.js'

/**
 * Delivery for verification codes. With TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 * and TWILIO_FROM set, codes go out as real texts; without them nothing is
 * sent — the code is logged, and (when AUTH_CODE_ECHO is on, the default
 * outside production) also returned in the request-code response so the flow
 * works end to end with no provider.
 */
export const SMS_CONFIGURED = Boolean(
  TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM
)

/** True when the text was handed to Twilio; false means nothing was sent. */
export async function sendCode(phone, code, log) {
  if (!SMS_CONFIGURED) {
    if (IS_PRODUCTION) {
      log?.warn?.({ phone }, 'no SMS provider configured; the code below reaches nobody by itself')
    }
    // The log line is the delivery mechanism here, so the code belongs in it.
    log?.info?.({ phone, code }, 'verification code issued')
    return false
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phone,
          From: TWILIO_FROM,
          Body: `Your Gap code is ${code}.`,
        }),
      }
    )
    if (!res.ok) {
      const detail = await res.json().catch(() => null)
      log?.error?.(
        { phone, status: res.status, twilio: detail?.message ?? null },
        'sms send failed'
      )
      return false
    }
    log?.info?.({ phone }, 'verification code texted')
    return true
  } catch (error) {
    log?.error?.({ error, phone }, 'sms send failed')
    return false
  }
}
