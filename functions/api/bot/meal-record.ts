import { type Env, json, requireBot } from '../_utils'

interface MealRecordBody {
  qqId?: string
  messageId?: string
  shopId?: string
  itemId?: string
  score?: number
  text?: string
  image?: string
  mealSlot?: string
  isAnonymous?: boolean
}

const mealSlots = new Set(['早餐', '午餐', '晚餐', '夜宵', '其他'])

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!await requireBot(request, env)) {
    return json({ error: 'bot unauthorized' }, { status: 401 })
  }

  const body = await request.json<MealRecordBody>()
  const qqId = String(body.qqId ?? '').trim()
  const messageId = String(body.messageId ?? '').trim()
  const shopId = String(body.shopId ?? '').trim()
  const itemId = String(body.itemId ?? '').trim() || null
  const text = String(body.text ?? '').trim()
  const image = String(body.image ?? '')
  const score = Number(body.score)
  const mealSlot = mealSlots.has(String(body.mealSlot)) ? String(body.mealSlot) : '其他'

  if (!/^\d{5,20}$/.test(qqId) || !messageId || !shopId) {
    return json({ error: 'qqId, messageId and shopId are required' }, { status: 400 })
  }
  if (!text || !Number.isFinite(score) || score < 1 || score > 5) {
    return json({ error: 'text and score (1-5) are required' }, { status: 400 })
  }
  if (image.length > 145000) {
    return json({ error: 'image too large' }, { status: 400 })
  }

  const identity = await env.DB.prepare(
    `SELECT users.id, users.email
     FROM qq_identities
     JOIN users ON users.id = qq_identities.user_id
     WHERE qq_identities.platform = 'onebot11' AND qq_identities.external_user_id = ?`
  ).bind(qqId).first<{ id: number; email: string }>()
  if (!identity) return json({ error: 'qq_not_bound' }, { status: 403 })

  const shop = await env.DB.prepare(
    'SELECT id FROM shops WHERE id = ? AND COALESCE(is_closed, 0) = 0'
  ).bind(shopId).first<{ id: string }>()
  if (!shop) return json({ error: 'shop not found or closed' }, { status: 404 })

  if (itemId) {
    const item = await env.DB.prepare(
      `SELECT id FROM items
       WHERE id = ? AND shop_id = ? AND COALESCE(is_off_shelf, 0) = 0`
    ).bind(itemId, shopId).first<{ id: string }>()
    if (!item) return json({ error: 'item not found or off shelf' }, { status: 404 })
  }

  try {
    const result = await env.DB.prepare(
      `INSERT INTO comments
       (shop_id, item_id, user, user_id, score, text, image, is_anonymous,
        is_meal_record, meal_slot, is_public_comment, source, source_message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, 'qq', ?)`
    ).bind(
      shopId,
      itemId,
      identity.email,
      identity.id,
      score,
      text,
      image,
      body.isAnonymous === true ? 1 : 0,
      mealSlot,
      messageId
    ).run()
    return json({ id: result.meta.last_row_id, duplicate: false }, { status: 201 })
  } catch (error) {
    const existing = await env.DB.prepare(
      `SELECT id FROM comments WHERE source = 'qq' AND source_message_id = ?`
    ).bind(messageId).first<{ id: number }>()
    if (existing) return json({ id: existing.id, duplicate: true })
    throw error
  }
}
