export interface Env {
  DB: D1Database
  ADMIN_PASSWORD?: string
  AI?: {
    run(model: string, input: unknown): Promise<unknown>
  }
}

export interface SessionUser {
  id: number
  email: string
  nickname: string
  role: 'user' | 'admin'
  defaultCampus?: string
}

export function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...init.headers
    }
  })
}

export function makeId(name: string) {
  return `${Date.now()}-${name}`.replace(/\s+/g, '-')
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

export function toUtc8Text(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
  const date = new Date(hasTimeZone ? normalized : `${normalized}Z`)
  if (Number.isNaN(date.getTime())) return raw

  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return [
    shifted.getUTCFullYear(),
    pad2(shifted.getUTCMonth() + 1),
    pad2(shifted.getUTCDate())
  ].join('-') + ` ${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}:${pad2(shifted.getUTCSeconds())}`
}

export function parseCookie(request: Request, name: string) {
  const cookie = request.headers.get('cookie') ?? ''
  const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`))
  return match ? decodeURIComponent(match[1]) : ''
}

export function getSessionToken(request: Request) {
  const cookieToken = parseCookie(request, 'session')
  if (cookieToken) return cookieToken

  const headerToken = request.headers.get('x-session-token')?.trim()
  if (headerToken) return headerToken

  const authorization = request.headers.get('authorization')?.trim() ?? ''
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)
  return bearer ? bearer[1].trim() : ''
}

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function randomToken(bytes = 32) {
  const array = new Uint8Array(bytes)
  crypto.getRandomValues(array)
  return toHex(array.buffer)
}

export async function hashPassword(password: string, salt: string) {
  const data = new TextEncoder().encode(`${salt}:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest)
}

export async function getCurrentUser(request: Request, env: Env) {
  const token = getSessionToken(request)
  if (!token) return null
  let row: SessionUser | null = null
  try {
    row = await env.DB.prepare(
      `SELECT users.id, users.email, users.nickname, users.role, users.default_campus AS defaultCampus
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ? AND sessions.expires_at > datetime('now')`
    ).bind(token).first<SessionUser>()
  } catch {
    const fallback = await env.DB.prepare(
      `SELECT users.id, users.email, users.role
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ? AND sessions.expires_at > datetime('now')`
    ).bind(token).first<Omit<SessionUser, 'nickname'>>()
    row = fallback ? { ...fallback, nickname: fallback.email.split('@')[0] } : null
  }
  return row ?? null
}

export async function requireUser(request: Request, env: Env) {
  const user = await getCurrentUser(request, env)
  if (!user) return null
  return user
}

export async function requireAdmin(request: Request, env: Env) {
  const user = await requireUser(request, env)
  if (!user || user.role !== 'admin') return null
  return user
}

export function sessionCookie(token: string, maxAge = 60 * 60 * 24 * 30) {
  return `session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
}
