import { useCallback, useEffect, useState } from 'react'
import { useSession } from '../state/session.jsx'

const RESEND_COOLDOWN_S = 30

/**
 * The two-step phone flow — enter a number, then the texted code — shared by
 * the join screen and the profile's attach-a-number form. Owns the stage,
 * the resend cooldown, and the dev code the server echoes when it has no
 * SMS provider to send through.
 */
export function usePhoneAuth() {
  const { requestPhoneCode, verifyPhone } = useSession()
  const [stage, setStage] = useState('number') // 'number' | 'code'
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [devCode, setDevCode] = useState(null)
  const [resendAt, setResendAt] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (stage !== 'code') return
    const timer = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [stage])
  const resendIn = Math.max(0, Math.ceil((resendAt - nowMs) / 1000))

  /** Ask for a code and move to the code stage. */
  const request = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await requestPhoneCode(phone)
      setDevCode(res.devCode ?? null)
      setCode('')
      setStage('code')
      setResendAt(Date.now() + RESEND_COOLDOWN_S * 1000)
      setNowMs(Date.now())
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }, [phone, requestPhoneCode])

  /**
   * Submit the code. On success the session adopts the player and this
   * screen unmounts on its own. Returns null on success, or the ApiError —
   * the caller checks `.code === 'name_required'` to know a fresh number
   * needs a display name (the same code stays valid for the retry).
   */
  const verify = useCallback(async (extra = {}) => {
    setBusy(true)
    setError(null)
    try {
      await verifyPhone({ phone, code, ...extra })
      return null
    } catch (err) {
      if (err.code !== 'name_required') setError(err.message)
      setBusy(false)
      return err
    }
  }, [phone, code, verifyPhone])

  const back = useCallback(() => {
    setStage('number')
    setCode('')
    setError(null)
    setDevCode(null)
  }, [])

  return {
    stage, phone, setPhone, code, setCode,
    busy, error, devCode, resendIn, request, verify, back,
  }
}
