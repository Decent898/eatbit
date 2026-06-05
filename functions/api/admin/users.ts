import { type Env, json, requireAdmin, toUtc8Text } from '../_utils'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env)
  if (!admin) return json({ error: 'admin required' }, { status: 403 })

  const rows = await env.DB.prepare(
    `SELECT users.id, users.email, users.nickname, users.role,
            users.default_campus AS defaultCampus, users.created_at AS createdAt,
            COUNT(DISTINCT shops.id) AS shopCount,
            COUNT(DISTINCT items.id) AS itemCount,
            COUNT(DISTINCT comments.id) AS commentCount
     FROM users
     LEFT JOIN shops ON shops.creator_user_id = users.id
     LEFT JOIN items ON items.creator_user_id = users.id
     LEFT JOIN comments ON comments.user_id = users.id
     GROUP BY users.id
     ORDER BY users.created_at DESC`
  ).all()

  return json({
    users: (rows.results ?? []).map((user) => ({
      id: Number(user.id),
      email: String(user.email),
      nickname: String(user.nickname ?? ''),
      role: String(user.role),
      defaultCampus: String(user.defaultCampus ?? '良乡校区'),
      createdAt: toUtc8Text(user.createdAt),
      shopCount: Number(user.shopCount ?? 0),
      itemCount: Number(user.itemCount ?? 0),
      commentCount: Number(user.commentCount ?? 0)
    }))
  })
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env)
  if (!admin) return json({ error: 'admin required' }, { status: 403 })

  const body = await request.json<{
    userId?: number
    nickname?: string
    role?: 'user' | 'admin'
    defaultCampus?: '良乡校区' | '中关村校区'
  }>()
  if (!body.userId) return json({ error: 'userId is required' }, { status: 400 })
  if (body.role && !['user', 'admin'].includes(body.role)) return json({ error: 'invalid role' }, { status: 400 })
  if (body.defaultCampus && !['良乡校区', '中关村校区'].includes(body.defaultCampus)) return json({ error: 'invalid campus' }, { status: 400 })

  const target = await env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(body.userId).first<{ id: number; role: string }>()
  if (!target) return json({ error: 'user not found' }, { status: 404 })

  const nextRole = body.role ?? target.role
  const adminCountRow = await env.DB.prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin'`).first<{ count: number }>()
  if (admin.id === body.userId && admin.role === 'admin' && nextRole !== 'admin' && Number(adminCountRow?.count ?? 0) <= 1) {
    return json({ error: 'cannot remove last admin' }, { status: 400 })
  }

  await env.DB.prepare(
    `UPDATE users
     SET nickname = COALESCE(?, nickname),
         role = COALESCE(?, role),
         default_campus = COALESCE(?, default_campus)
     WHERE id = ?`
  ).bind(
    body.nickname == null ? null : body.nickname.trim(),
    body.role ?? null,
    body.defaultCampus ?? null,
    body.userId
  ).run()

  return json({ ok: true })
}
