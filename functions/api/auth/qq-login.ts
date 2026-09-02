import {
  type Env,
  getCurrentUser,
  hashPassword,
  randomToken,
  sessionCookie,
  sha256Hex
} from '../_utils'

function redirect(request: Request, status: string, cookie?: string) {
  const url = new URL('/home', request.url)
  url.searchParams.set('qq_login', status)
  const headers = new Headers({ location: url.toString(), 'cache-control': 'no-store' })
  if (cookie) headers.set('set-cookie', `${cookie}; Secure`)
  return new Response(null, { status: 302, headers })
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const ticket = new URL(request.url).searchParams.get('ticket')?.trim() ?? ''
  if (!ticket) return redirect(request, 'invalid')

  const ticketHash = await sha256Hex(ticket)
  const ticketRow = await env.DB.prepare(
    `SELECT external_user_id AS qqId, display_name AS displayName
     FROM qq_login_tickets
     WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > datetime('now')`
  ).bind(ticketHash).first<{ qqId: string; displayName: string }>()
  if (!ticketRow) return redirect(request, 'expired')

  const consumed = await env.DB.prepare(
    `UPDATE qq_login_tickets SET consumed_at = CURRENT_TIMESTAMP
     WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > datetime('now')`
  ).bind(ticketHash).run()
  if (Number(consumed.meta.changes ?? 0) !== 1) return redirect(request, 'expired')

  const existingIdentity = await env.DB.prepare(
    `SELECT user_id AS userId FROM qq_identities
     WHERE platform = 'onebot11' AND external_user_id = ?`
  ).bind(ticketRow.qqId).first<{ userId: number }>()

  let userId = existingIdentity?.userId
  if (!userId) {
    const browserUser = await getCurrentUser(request, env)
    if (browserUser) {
      const alreadyBound = await env.DB.prepare(
        `SELECT external_user_id AS qqId FROM qq_identities
         WHERE platform = 'onebot11' AND user_id = ?`
      ).bind(browserUser.id).first<{ qqId: string }>()
      if (alreadyBound && alreadyBound.qqId !== ticketRow.qqId) {
        return redirect(request, 'account_already_bound')
      }
      userId = browserUser.id
    } else {
      const email = `qq-${ticketRow.qqId}@qq.eatbit.local`
      const existingUser = await env.DB.prepare(
        'SELECT id FROM users WHERE email = ?'
      ).bind(email).first<{ id: number }>()
      if (existingUser) {
        userId = existingUser.id
      } else {
        const nickname = ticketRow.displayName || `QQ用户${ticketRow.qqId.slice(-4)}`
        const salt = randomToken(16)
        const passwordHash = await hashPassword(randomToken(16), salt)
        const created = await env.DB.prepare(
          `INSERT INTO users (email, nickname, password_hash, password_salt, role)
           VALUES (?, ?, ?, ?, 'user')`
        ).bind(email, nickname, passwordHash, salt).run()
        userId = Number(created.meta.last_row_id)
      }
    }

    await env.DB.prepare(
      `INSERT INTO qq_identities (platform, external_user_id, user_id, display_name)
       VALUES ('onebot11', ?, ?, ?)`
    ).bind(ticketRow.qqId, userId, ticketRow.displayName).run()
  } else {
    await env.DB.prepare(
      `UPDATE qq_identities
       SET display_name = ?, last_login_at = CURRENT_TIMESTAMP
       WHERE platform = 'onebot11' AND external_user_id = ?`
    ).bind(ticketRow.displayName, ticketRow.qqId).run()
  }

  const session = randomToken()
  await env.DB.prepare(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES (?, ?, datetime('now', '+30 days'))`
  ).bind(session, userId).run()
  return redirect(request, 'success', sessionCookie(session))
}
