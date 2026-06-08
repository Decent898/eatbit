import { type Env, json, requireAdmin } from '../_utils'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireAdmin(request, env)
  if (!user) return json({ error: 'admin required' }, { status: 403 })

  const body = await request.json<{ shopId?: string; name?: string; description?: string }>()
  if (!body.shopId || !body.name?.trim()) return json({ error: 'shopId and name are required' }, { status: 400 })

  await env.DB.prepare(
    `UPDATE shops
     SET name = ?, description = ?
     WHERE id = ?`
  ).bind(body.name.trim(), body.description?.trim() ?? '', body.shopId).run()

  return json({ ok: true })
}
