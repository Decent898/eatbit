import { type Env, json, requireUser } from './_utils'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env)
  if (!user) return json({ error: 'login required' }, { status: 401 })
  const body = await request.json<{
    shopId?: string
    itemId?: string
    score?: number
    text?: string
    image?: string
    isAnonymous?: boolean
    isMealRecord?: boolean
    mealSlot?: string
    isPublicComment?: boolean
  }>()
  const isPublicComment = body.isPublicComment !== false
  if (!body.shopId) {
    return json({ error: 'shopId is required' }, { status: 400 })
  }
  if (isPublicComment && (!body.text || typeof body.score !== 'number')) {
    return json({ error: 'score and text are required for public comments' }, { status: 400 })
  }
  if (body.image && body.image.length > 145000) return json({ error: 'image too large' }, { status: 400 })

  let result
  try {
    result = await env.DB.prepare(
      `INSERT INTO comments (shop_id, item_id, user, user_id, score, text, image, is_anonymous, is_meal_record, meal_slot, is_public_comment)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      body.shopId,
      body.itemId ?? null,
      user.email,
      user.id,
      typeof body.score === 'number' ? body.score : 0,
      body.text?.trim() ?? '',
      isPublicComment ? body.image ?? '' : '',
      body.isAnonymous === false ? 0 : 1,
      body.isMealRecord ? 1 : 0,
      body.isMealRecord ? body.mealSlot ?? '' : '',
      isPublicComment ? 1 : 0
    ).run()
  } catch {
    result = await env.DB.prepare(
      `INSERT INTO comments (shop_id, item_id, user, user_id, score, text)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(body.shopId, body.itemId ?? null, user.email, user.id, typeof body.score === 'number' ? body.score : 0, body.text?.trim() ?? '').run()
  }

  return json({ id: result.meta.last_row_id }, { status: 201 })
}

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env)
  if (!user) return json({ error: 'login required' }, { status: 401 })
  const body = await request.json<{ commentId?: number }>()
  if (!body.commentId) return json({ error: 'commentId is required' }, { status: 400 })

  const comment = await env.DB.prepare('SELECT user_id AS userId FROM comments WHERE id = ?').bind(body.commentId).first<{ userId: number | null }>()
  if (!comment) return json({ error: 'comment not found' }, { status: 404 })
  if (user.role !== 'admin' && Number(comment.userId) !== user.id) return json({ error: 'forbidden' }, { status: 403 })

  await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(body.commentId).run()

  return json({ ok: true })
}
