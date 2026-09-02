import { type Env, json, randomToken, requireBot, sha256Hex } from '../_utils'

function validQqId(value: string) {
  return /^\d{5,20}$/.test(value)
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!await requireBot(request, env)) {
    return json({ error: 'bot unauthorized' }, { status: 401 })
  }

  const body = await request.json<{ qqId?: string; nickname?: string }>()
  const qqId = String(body.qqId ?? '').trim()
  const nickname = String(body.nickname ?? '').trim().slice(0, 20)
  if (!validQqId(qqId)) {
    return json({ error: 'valid qqId is required' }, { status: 400 })
  }

  const ticket = randomToken(24)
  const ticketHash = await sha256Hex(ticket)
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM qq_login_tickets
       WHERE expires_at <= datetime('now') OR consumed_at IS NOT NULL`
    ),
    env.DB.prepare(
      `INSERT INTO qq_login_tickets (token_hash, external_user_id, display_name, expires_at)
       VALUES (?, ?, ?, datetime('now', '+5 minutes'))`
    ).bind(ticketHash, qqId, nickname)
  ])

  const identity = await env.DB.prepare(
    `SELECT users.nickname
     FROM qq_identities
     JOIN users ON users.id = qq_identities.user_id
     WHERE qq_identities.platform = 'onebot11' AND qq_identities.external_user_id = ?`
  ).bind(qqId).first<{ nickname: string }>()

  const loginUrl = new URL('/api/auth/qq-login', request.url)
  loginUrl.searchParams.set('ticket', ticket)
  const bindUrl = new URL('/qq-bind', request.url)
  bindUrl.searchParams.set('ticket', ticket)
  return json({
    url: identity ? loginUrl.toString() : bindUrl.toString(),
    loginUrl: loginUrl.toString(),
    bindUrl: bindUrl.toString(),
    expiresIn: 300,
    bound: Boolean(identity),
    nickname: identity?.nickname ?? ''
  })
}
