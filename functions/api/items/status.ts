import { type Env, json, requireUser } from '../_utils'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env)
  if (!user) return json({ error: 'login required' }, { status: 401 })
  const body = await request.json<{ itemId?: string; isOffShelf?: boolean }>()
  if (!body.itemId || typeof body.isOffShelf !== 'boolean') return json({ error: 'itemId and isOffShelf are required' }, { status: 400 })

  await env.DB.prepare(
    `UPDATE items
     SET is_off_shelf = ?, off_shelf_at = CASE WHEN ? THEN datetime('now') ELSE NULL END
     WHERE id = ?`
  ).bind(body.isOffShelf ? 1 : 0, body.isOffShelf ? 1 : 0, body.itemId).run()

  return json({ ok: true })
}
