import { type Env, json, makeId, requireUser } from './_utils'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env)
  if (!user) return json({ error: 'login required' }, { status: 401 })
  const body = await request.json<{ shopId?: string; name?: string; price?: string }>()
  if (!body.shopId || !body.name) return json({ error: 'shopId and name are required' }, { status: 400 })

  const id = makeId(body.name)
  try {
    await env.DB.prepare(
      `INSERT INTO items (id, shop_id, name, price, description, creator_user_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(id, body.shopId, body.name.trim(), body.price?.trim() ?? '', '', user.id).run()
  } catch {
    await env.DB.prepare(
      `INSERT INTO items (id, shop_id, name, price, description)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(id, body.shopId, body.name.trim(), body.price?.trim() ?? '', '').run()
  }

  return json({ id }, { status: 201 })
}

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env)
  if (!user) return json({ error: 'login required' }, { status: 401 })
  const body = await request.json<{ itemId?: string }>()
  if (!body.itemId) return json({ error: 'itemId is required' }, { status: 400 })

  let item
  try {
    item = await env.DB.prepare('SELECT creator_user_id AS creatorUserId FROM items WHERE id = ?').bind(body.itemId).first<{ creatorUserId: number | null }>()
  } catch {
    item = null
  }
  if (!item) return json({ error: 'item not found' }, { status: 404 })
  if (user.role !== 'admin' && Number(item.creatorUserId) !== user.id) return json({ error: 'forbidden' }, { status: 403 })

  await env.DB.prepare('UPDATE comments SET item_id = NULL WHERE item_id = ?').bind(body.itemId).run()
  await env.DB.prepare('DELETE FROM items WHERE id = ?').bind(body.itemId).run()

  return json({ ok: true })
}
