import { type Env, hashPassword, json, randomToken, sessionCookie } from '../_utils'

interface AdminLoginUser {
  id: number
  email: string
  nickname: string
  role: 'user' | 'admin'
  defaultCampus?: string
  passwordHash: string
  passwordSalt: string
}

async function findAdmin(env: Env, account: string) {
  const normalized = account.trim().toLowerCase()
  return env.DB.prepare(
    `SELECT id, email, nickname, role, default_campus AS defaultCampus,
            password_hash AS passwordHash, password_salt AS passwordSalt
     FROM users
     WHERE role = 'admin' AND (lower(email) = ? OR nickname = ?)
     ORDER BY id ASC
     LIMIT 1`
  ).bind(normalized, account.trim()).first<AdminLoginUser>()
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await request.json<{ account?: string; password?: string }>()
  const account = body.account?.trim()
  const password = body.password ?? ''

  if (!account || !password) return json({ error: 'account and password are required' }, { status: 400 })

  const user = await findAdmin(env, account)
  if (!user) return json({ error: 'invalid admin account or password' }, { status: 401 })

  let ok = false
  if (env.ADMIN_PASSWORD) {
    ok = password === env.ADMIN_PASSWORD
  } else if (user.passwordHash && user.passwordSalt) {
    ok = await hashPassword(password, user.passwordSalt) === user.passwordHash
  } else {
    return json({ error: 'admin password is not configured' }, { status: 500 })
  }

  if (!ok) return json({ error: 'invalid admin account or password' }, { status: 401 })

  const token = randomToken()
  await env.DB.prepare(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES (?, ?, datetime('now', '+12 hours'))`
  ).bind(token, user.id).run()

  return json({
    user: {
      id: Number(user.id),
      email: user.email,
      nickname: user.nickname,
      role: user.role,
      defaultCampus: user.defaultCampus
    },
    token
  }, {
    headers: { 'set-cookie': sessionCookie(token, 60 * 60 * 12) }
  })
}
