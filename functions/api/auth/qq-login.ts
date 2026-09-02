import { type Env, randomToken, sessionCookie, sha256Hex } from '../_utils'

function redirect(request: Request, status: string, cookie?: string) {
  const url = new URL('/home', request.url)
  url.searchParams.set('qq_login', status)
  const headers = new Headers({ location: url.toString(), 'cache-control': 'no-store' })
  if (cookie) headers.set('set-cookie', `${cookie}; Secure`)
  return new Response(null, { status: 302, headers })
}

function redirectToBind(request: Request, ticket: string) {
  const url = new URL('/qq-bind', request.url)
  url.searchParams.set('ticket', ticket)
  return Response.redirect(url.toString(), 302)
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

  const identity = await env.DB.prepare(
    `SELECT user_id AS userId FROM qq_identities
     WHERE platform = 'onebot11' AND external_user_id = ?`
  ).bind(ticketRow.qqId).first<{ userId: number }>()
  if (!identity) return redirectToBind(request, ticket)

  const consumed = await env.DB.prepare(
    `UPDATE qq_login_tickets SET consumed_at = CURRENT_TIMESTAMP
     WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > datetime('now')`
  ).bind(ticketHash).run()
  if (Number(consumed.meta.changes ?? 0) !== 1) return redirect(request, 'expired')

  await env.DB.prepare(
    `UPDATE qq_identities
     SET display_name = ?, last_login_at = CURRENT_TIMESTAMP
     WHERE platform = 'onebot11' AND external_user_id = ?`
  ).bind(ticketRow.displayName, ticketRow.qqId).run()

  const session = randomToken()
  await env.DB.prepare(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES (?, ?, datetime('now', '+30 days'))`
  ).bind(session, identity.userId).run()
  return redirect(request, 'success', sessionCookie(session))
}
