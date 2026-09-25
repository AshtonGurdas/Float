import type { Entry } from './books.ts'

export function todayISO() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

export function prettyDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

export function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function money(amount: number) {
  const formatted = Math.abs(amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  return amount < 0 ? `−${formatted}` : formatted
}

export function signedMoney(amount: number) {
  const formatted = Math.abs(amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  if (amount > 0) return `+${formatted}`
  if (amount < 0) return `−${formatted}`
  return formatted
}

export function signedPct(amount: number | null) {
  if (amount == null || !Number.isFinite(amount)) return null
  const body = `${Math.abs(amount).toFixed(1)}%`
  if (amount > 0) return `+${body}`
  if (amount < 0) return `−${body}`
  return body
}

export function tone(amount: number) {
  if (amount > 0) return 'up'
  if (amount < 0) return 'down'
  return 'flat'
}

export function parseMoney(value: string) {
  const cleaned = value.replace(/[$,\s]/g, '')
  if (!cleaned) return null
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '.') return Number.NaN
  const number = Number(cleaned)
  if (!Number.isFinite(number)) return Number.NaN
  return Math.round(number * 100) / 100
}

export function parseQty(value: string) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return null
  return Math.round(number * 1000) / 1000
}

export function movementLabel(entry: Entry) {
  if (entry.itemKind === 'fee') return 'Fee'
  if (entry.itemKind === 'other') return entry.direction === 'in' ? 'Income' : 'Expense'
  return entry.direction === 'in' ? 'Sold' : 'Bought'
}

export function kindLabel(entry: Entry) {
  if (entry.itemKind === 'case' && entry.boxesPerCase) return `Case of ${entry.boxesPerCase}`
  if (entry.itemKind === 'box') return 'Booster box'
  if (entry.itemKind === 'card') return 'Card'
  if (entry.itemKind === 'sealed') return 'Sealed'
  if (entry.itemKind === 'fee') return 'Fee'
  return 'Other'
}

export function friendlyAuth(message: string) {
  if (/invalid login|invalid credentials/i.test(message)) return 'That email or password is not right.'
  if (/already registered|already been registered/i.test(message)) return 'That email already has an account. Sign in instead.'
  if (/password/i.test(message) && /least|short|weak/i.test(message)) return 'Use at least 8 characters.'
  if (/email/i.test(message) && /invalid/i.test(message)) return 'That email does not look right.'
  if (/rate limit/i.test(message)) return 'The confirmation email was blocked. Refresh the page and create the account again. No email is required.'
  if (/not confirmed/i.test(message)) return 'That account is not confirmed yet. Create it again with the same email and it will sign you in.'
  return message
}
