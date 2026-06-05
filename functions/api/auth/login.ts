import { type Env, hashPassword, json, randomToken, sessionCookie } from '../_utils'

async function findUser(env: Env, email: string) {
  try {
    return await env.DB.prepare(
      'SELECT id, email, nickname, role, default_campus AS defaultCampus FROM users WHERE email = ?'
    ).bind(email).first<{ id: number; email: string; nickname: string; role: 'user' | 'admin'; defaultCampus?: string }>()
  } catch {
    const user = await env.DB.prepare(
      'SELECT id, email, role FROM users WHERE email = ?'
    ).bind(email).first<{ id: number; email: string; role: 'user' | 'admin' }>()
    return user ? { ...user, nickname: user.email.split('@')[0] } : null
  }
}

async function findUsersByNickname(env: Env, nickname: string) {
  try {
    const rows = await env.DB.prepare(
      'SELECT id, email, nickname, role, default_campus AS defaultCampus FROM users WHERE nickname = ? ORDER BY id ASC'
    ).bind(nickname).all<{ id: number; email: string; nickname: string; role: 'user' | 'admin'; defaultCampus?: string }>()
    return rows.results ?? []
  } catch {
    return []
  }
}

async function createUser(env: Env, email: string, nickname: string) {
  const salt = randomToken(16)
  const passwordHash = await hashPassword(randomToken(16), salt)
  const countRow = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>()
  const role = Number(countRow?.count ?? 0) === 0 ? 'admin' : 'user'

  let result: D1Result
  try {
    result = await env.DB.prepare(
      'INSERT INTO users (email, nickname, password_hash, password_salt, role) VALUES (?, ?, ?, ?, ?)'
    ).bind(email, nickname, passwordHash, salt, role).run()
  } catch {
    result = await env.DB.prepare(
      'INSERT INTO users (email, password_hash, password_salt, role) VALUES (?, ?, ?, ?)'
    ).bind(email, passwordHash, salt, role).run()
  }

  return { id: Number(result.meta.last_row_id), email, nickname, role, defaultCampus: '良乡校区' }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await request.json<{ email?: string; nickname?: string }>()
  const email = body.email?.trim().toLowerCase()
  const nickname = body.nickname?.trim()

  if (!email && !nickname) {
    return json({ error: 'email or nickname is required' }, { status: 400 })
  }
  if (email && !email.includes('@')) {
    return json({ error: 'valid email is required' }, { status: 400 })
  }
  if (nickname && nickname.length > 20) {
    return json({ error: 'nickname length must be 1-20' }, { status: 400 })
  }

  let user = email ? await findUser(env, email) : null
  if (!user && !email && nickname) {
    const matches = await findUsersByNickname(env, nickname)
    if (matches.length > 1) {
      return json({ error: 'nickname duplicated, email required' }, { status: 409 })
    }
    user = matches[0] ?? null
  }

  if (!user) {
    if (!email) return json({ error: 'email is required for new account' }, { status: 400 })
    user = await createUser(env, email, nickname || email.split('@')[0])
  } else if (email && nickname && user.nickname !== nickname) {
    try {
      await env.DB.prepare('UPDATE users SET nickname = ? WHERE id = ?').bind(nickname, user.id).run()
      user.nickname = nickname
    } catch {
      user.nickname = nickname
    }
  }

  const token = randomToken()
  await env.DB.prepare(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES (?, ?, datetime('now', '+30 days'))`
  ).bind(token, user.id).run()

  return json({ user, token }, {
    headers: { 'set-cookie': sessionCookie(token) }
  })
}
