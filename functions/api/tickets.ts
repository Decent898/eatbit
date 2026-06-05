import { type Env, getCurrentUser, json, requireAdmin, toUtc8Text } from './_utils'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireAdmin(request, env)
  if (!user) return json({ error: 'admin required' }, { status: 403 })

  const rows = await env.DB.prepare(
    `SELECT tickets.id, tickets.title, tickets.content, tickets.status,
            tickets.user_id AS userId, tickets.created_at AS createdAt, tickets.closed_at AS closedAt,
            users.email AS userEmail, users.nickname AS userNickname
     FROM tickets
     LEFT JOIN users ON users.id = tickets.user_id
     ORDER BY tickets.status ASC, tickets.created_at DESC`
  ).all()

  return json({
    tickets: (rows.results ?? []).map((ticket) => ({
      id: Number(ticket.id),
      title: String(ticket.title),
      content: String(ticket.content),
      status: String(ticket.status),
      userId: ticket.userId == null ? undefined : Number(ticket.userId),
      userEmail: ticket.userEmail ? String(ticket.userEmail) : '',
      userNickname: ticket.userNickname ? String(ticket.userNickname) : '',
      createdAt: toUtc8Text(ticket.createdAt),
      closedAt: ticket.closedAt ? toUtc8Text(ticket.closedAt) : ''
    }))
  })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser(request, env)
  const body = await request.json<{ title?: string; content?: string }>()
  const title = body.title?.trim()
  const content = body.content?.trim()

  if (!title || !content) return json({ error: 'title and content are required' }, { status: 400 })
  if (title.length > 80) return json({ error: 'title too long' }, { status: 400 })
  if (content.length > 1000) return json({ error: 'content too long' }, { status: 400 })

  const result = await env.DB.prepare(
    `INSERT INTO tickets (title, content, contact, user_id)
     VALUES (?, ?, ?, ?)`
  ).bind(title, content, '', user?.id ?? null).run()

  return json({ id: result.meta.last_row_id }, { status: 201 })
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireAdmin(request, env)
  if (!user) return json({ error: 'admin required' }, { status: 403 })

  const body = await request.json<{ ticketId?: number; status?: 'open' | 'closed' }>()
  if (!body.ticketId || !body.status) return json({ error: 'ticketId and status are required' }, { status: 400 })

  await env.DB.prepare(
    `UPDATE tickets
     SET status = ?, closed_at = CASE WHEN ? = 'closed' THEN datetime('now') ELSE NULL END
     WHERE id = ?`
  ).bind(body.status, body.status, body.ticketId).run()

  return json({ ok: true })
}
