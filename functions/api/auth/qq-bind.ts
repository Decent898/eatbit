import { type Env, json, requireUser, sha256Hex } from '../_utils'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env)
  if (!user) return json({ error: 'login required' }, { status: 401 })

  const body = await request.json<{ ticket?: string }>()
  const ticket = String(body.ticket ?? '').trim()
  if (!ticket) return json({ error: 'ticket is required' }, { status: 400 })

  const tokenHash = await sha256Hex(ticket)
  const ticketRow = await env.DB.prepare(
    `SELECT external_user_id AS qqId, display_name AS displayName
     FROM qq_login_tickets
     WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > datetime('now')`
  ).bind(tokenHash).first<{ qqId: string; displayName: string }>()
  if (!ticketRow) return json({ error: 'ticket expired' }, { status: 410 })

  const otherQq = await env.DB.prepare(
    `SELECT external_user_id AS qqId FROM qq_identities
     WHERE platform = 'onebot11' AND user_id = ? AND external_user_id <> ?`
  ).bind(user.id, ticketRow.qqId).first<{ qqId: string }>()
  if (otherQq) {
    return json({ error: 'this EatBit account is already bound to another QQ' }, { status: 409 })
  }

  const consumed = await env.DB.prepare(
    `UPDATE qq_login_tickets SET consumed_at = CURRENT_TIMESTAMP
     WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > datetime('now')`
  ).bind(tokenHash).run()
  if (Number(consumed.meta.changes ?? 0) !== 1) {
    return json({ error: 'ticket expired' }, { status: 410 })
  }

  await env.DB.prepare(
    `INSERT INTO qq_identities (platform, external_user_id, user_id, display_name)
     VALUES ('onebot11', ?, ?, ?)
     ON CONFLICT(platform, external_user_id) DO UPDATE SET
       user_id = excluded.user_id,
       display_name = excluded.display_name,
       last_login_at = CURRENT_TIMESTAMP`
  ).bind(ticketRow.qqId, user.id, ticketRow.displayName).run()

  return json({ ok: true, user })
}
