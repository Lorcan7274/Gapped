/**
 * Country calling codes for the phone field. Names come from the browser's
 * own locale data (Intl.DisplayNames), so only the ISO code and the dial
 * prefix live here. Every North American Numbering Plan territory is a
 * plain "1": people there type their number with the area code, which is
 * how they already think of it.
 */
const RAW =
  'AF:93 AX:358 AL:355 DZ:213 AS:1 AD:376 AO:244 AI:1 AG:1 AR:54 AM:374 ' +
  'AW:297 AU:61 AT:43 AZ:994 BS:1 BH:973 BD:880 BB:1 BY:375 BE:32 BZ:501 ' +
  'BJ:229 BM:1 BT:975 BO:591 BA:387 BW:267 BR:55 IO:246 VG:1 BN:673 BG:359 ' +
  'BF:226 BI:257 KH:855 CM:237 CA:1 CV:238 KY:1 CF:236 TD:235 CL:56 CN:86 ' +
  'CO:57 KM:269 CG:242 CD:243 CK:682 CR:506 CI:225 HR:385 CU:53 CW:599 ' +
  'CY:357 CZ:420 DK:45 DJ:253 DM:1 DO:1 EC:593 EG:20 SV:503 GQ:240 ER:291 ' +
  'EE:372 SZ:268 ET:251 FK:500 FO:298 FJ:679 FI:358 FR:33 GF:594 PF:689 ' +
  'GA:241 GM:220 GE:995 DE:49 GH:233 GI:350 GR:30 GL:299 GD:1 GP:590 GU:1 ' +
  'GT:502 GG:44 GN:224 GW:245 GY:592 HT:509 HN:504 HK:852 HU:36 IS:354 ' +
  'IN:91 ID:62 IR:98 IQ:964 IE:353 IM:44 IL:972 IT:39 JM:1 JP:81 JE:44 ' +
  'JO:962 KZ:7 KE:254 KI:686 XK:383 KW:965 KG:996 LA:856 LV:371 LB:961 ' +
  'LS:266 LR:231 LY:218 LI:423 LT:370 LU:352 MO:853 MK:389 MG:261 MW:265 ' +
  'MY:60 MV:960 ML:223 MT:356 MH:692 MQ:596 MR:222 MU:230 YT:262 MX:52 ' +
  'FM:691 MD:373 MC:377 MN:976 ME:382 MS:1 MA:212 MZ:258 MM:95 NA:264 ' +
  'NR:674 NP:977 NL:31 NC:687 NZ:64 NI:505 NE:227 NG:234 NU:683 NF:672 ' +
  'KP:850 MP:1 NO:47 OM:968 PK:92 PW:680 PS:970 PA:507 PG:675 PY:595 PE:51 ' +
  'PH:63 PL:48 PT:351 PR:1 QA:974 RE:262 RO:40 RU:7 RW:250 BL:590 SH:290 ' +
  'KN:1 LC:1 MF:590 PM:508 VC:1 WS:685 SM:378 ST:239 SA:966 SN:221 RS:381 ' +
  'SC:248 SL:232 SG:65 SX:1 SK:421 SI:386 SB:677 SO:252 ZA:27 KR:82 SS:211 ' +
  'ES:34 LK:94 SD:249 SR:597 SE:46 CH:41 SY:963 TW:886 TJ:992 TZ:255 TH:66 ' +
  'TL:670 TG:228 TK:690 TO:676 TT:1 TN:216 TR:90 TM:993 TC:1 TV:688 UG:256 ' +
  'UA:380 AE:971 GB:44 US:1 UY:598 UZ:998 VU:678 VA:39 VE:58 VN:84 VI:1 ' +
  'WF:681 EH:212 YE:967 ZM:260 ZW:263'

export const DIAL = Object.fromEntries(
  RAW.split(' ').map((pair) => pair.split(':'))
)

const E164 = /^\+[1-9]\d{7,14}$/
const STORAGE_KEY = 'gapped.country'

let displayNames = null
try {
  displayNames = new Intl.DisplayNames(undefined, { type: 'region' })
} catch {
  /* very old browser: fall back to the bare code */
}

export function countryName(code) {
  try {
    return displayNames?.of(code) ?? code
  } catch {
    return code
  }
}

/** Every country, sorted by its localised name. */
export const COUNTRIES = Object.keys(DIAL)
  .map((code) => ({ code, dial: DIAL[code], name: countryName(code) }))
  .sort((a, b) => a.name.localeCompare(b.name))

export const flagUrl = (code, width = 40) =>
  `https://flagcdn.com/w${width}/${code.toLowerCase()}.png`

/**
 * The best first guess at where someone is: the country they used last
 * time, else the region in the browser's locale, else Ireland.
 */
export function detectCountry() {
  try {
    const remembered = localStorage.getItem(STORAGE_KEY)
    if (remembered && DIAL[remembered]) return remembered
  } catch {
    /* storage blocked */
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const region = tag?.split(/[-_]/)[1]?.toUpperCase()
    if (region && DIAL[region]) return region
  }
  return 'IE'
}

export function rememberCountry(code) {
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    /* storage blocked */
  }
}

/**
 * Compose the E.164 number the server expects. A national number loses any
 * trunk zero (the 0 in 087 or 07911). Something typed with a leading + is
 * taken as already international, whatever country is selected.
 */
export function toE164(code, national) {
  const raw = String(national ?? '').trim()
  const digits = raw.replace(/\D/g, '')
  if (raw.startsWith('+')) return digits ? `+${digits}` : ''
  const trimmed = digits.replace(/^0+/, '')
  return trimmed ? `+${DIAL[code] ?? ''}${trimmed}` : ''
}

export const isCompleteNumber = (e164) => E164.test(e164)

/** Light grouping so a number reads as one while it is typed. */
export function formatNational(code, digits) {
  if (!digits) return ''
  if (digits.startsWith('+')) return digits
  if (DIAL[code] === '1') {
    return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)]
      .filter(Boolean)
      .join(' ')
  }
  const groups = digits.match(/.{1,3}/g) ?? []
  if (groups.length > 1 && groups.at(-1).length === 1) {
    groups.splice(-2, 2, groups.at(-2) + groups.at(-1))
  }
  return groups.join(' ')
}

/** "+1 347 261 5518" — for confirming where the code went. */
export function formatE164(code, e164) {
  const dial = DIAL[code] ?? ''
  if (!e164?.startsWith(`+${dial}`)) return e164 ?? ''
  return `+${dial} ${formatNational(code, e164.slice(dial.length + 1))}`
}
