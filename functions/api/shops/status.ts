import { type Env, json, requireUser } from '../_utils'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env)
  if (!user) return json({ error: 'login required' }, { status: 401 })
  const body = await request.json<{ shopId?: string; isClosed?: boolean }>()
  if (!body.shopId || typeof body.isClosed !== 'boolean') return json({ error: 'shopId and isClosed are required' }, { status: 400 })

  await env.DB.prepare(
    `UPDATE shops
     SET is_closed = ?, closed_at = CASE WHEN ? THEN datetime('now') ELSE NULL END
     WHERE id = ?`
  ).bind(body.isClosed ? 1 : 0, body.isClosed ? 1 : 0, body.shopId).run()

  if (body.isClosed) {
    await env.DB.prepare(
      `UPDATE items
       SET is_off_shelf = 1,
           off_shelf_at = COALESCE(off_shelf_at, datetime('now'))
       WHERE shop_id = ?`
    ).bind(body.shopId).run()
  }

  return json({ ok: true })
}
