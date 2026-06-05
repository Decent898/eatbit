import { type Env, json, requireAdmin } from '../_utils'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireAdmin(request, env)
  if (!user) return json({ error: 'admin required' }, { status: 403 })

  const body = await request.json<{ itemId?: string; name?: string; price?: string; description?: string }>()
  if (!body.itemId || !body.name?.trim()) return json({ error: 'itemId and name are required' }, { status: 400 })

  await env.DB.prepare(
    `UPDATE items
     SET name = ?, price = ?, description = ?
     WHERE id = ?`
  ).bind(body.name.trim(), body.price?.trim() ?? '', body.description?.trim() ?? '', body.itemId).run()

  return json({ ok: true })
}
