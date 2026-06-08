import { type Env, json, requireUser } from '../_utils'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env)
  if (!user) return json({ error: 'login required' }, { status: 401 })

  const body = await request.json<{ shopId?: string; image?: string }>()
  if (!body.shopId) return json({ error: 'shopId is required' }, { status: 400 })
  if (body.image && body.image.length > 145000) return json({ error: 'image too large' }, { status: 400 })

  const shop = await env.DB.prepare('SELECT id FROM shops WHERE id = ?').bind(body.shopId).first<{ id: string }>()
  if (!shop) return json({ error: 'shop not found' }, { status: 404 })

  await env.DB.prepare('UPDATE shops SET image = ? WHERE id = ?').bind(body.image ?? '', body.shopId).run()

  return json({ ok: true })
}
