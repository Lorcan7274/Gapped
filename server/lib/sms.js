import { IS_PRODUCTION } from '../config.js'

/**
 * Delivery for verification codes. No SMS provider is wired yet, so this is
 * the seam where one goes: replace the body with a Twilio/Vonage/etc call
 * and the rest of the app never notices.
 *
 * Until then the code is logged, and — when AUTH_CODE_ECHO is on, which is
 * the default outside production — also returned in the request-code
 * response so the flow works end to end without a provider.
 */
export function sendCode(phone, code, log) {
  if (IS_PRODUCTION) {
    log?.warn?.({ phone }, 'no SMS provider wired; the code below reaches nobody by itself')
  }
  log?.info?.({ phone, code }, 'verification code issued')
}
