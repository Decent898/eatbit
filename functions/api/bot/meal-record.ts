import { type Env, json, makeId, requireBot } from '../_utils'

interface MealRecordBody {
  qqId?: string
  messageId?: string
  shopId?: string
  newShop?: {
    name?: string
    areaId?: string
  }
  itemId?: string
  newItem?: {
    name?: string
    price?: string
  }
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
  let shopId = String(body.shopId ?? '').trim()
  let itemId = String(body.itemId ?? '').trim() || null
  const text = String(body.text ?? '').trim()
  const image = String(body.image ?? '')
  const score = Number(body.score)
  const mealSlot = mealSlots.has(String(body.mealSlot)) ? String(body.mealSlot) : '其他'

  const newShopName = String(body.newShop?.name ?? '').trim()
  const newShopAreaId = String(body.newShop?.areaId ?? '').trim()
  const newItemName = String(body.newItem?.name ?? '').trim()
  const newItemPrice = String(body.newItem?.price ?? '').trim().slice(0, 30)
  if (!/^\d{5,20}$/.test(qqId) || !messageId || (!shopId && !newShopName)) {
    return json({ error: 'qqId, messageId and shopId or newShop are required' }, { status: 400 })
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

  const duplicate = await env.DB.prepare(
    `SELECT id, shop_id AS shopId, item_id AS itemId
     FROM comments WHERE source = 'qq' AND source_message_id = ?`
  ).bind(messageId).first<{ id: number; shopId: string; itemId: string | null }>()
  if (duplicate) {
    return json({
      id: duplicate.id,
      shopId: duplicate.shopId,
      itemId: duplicate.itemId,
      createdShop: false,
      createdItem: false,
      duplicate: true
    })
  }

  let createdShop = false
  let createdItem = false
  if (!shopId) {
    if (!newShopAreaId || newShopName.length > 40) {
      return json({ error: 'new shop requires areaId and a 1-40 character name' }, { status: 400 })
    }
    const area = await env.DB.prepare('SELECT id FROM areas WHERE id = ?')
      .bind(newShopAreaId).first<{ id: string }>()
    if (!area) return json({ error: 'area not found' }, { status: 404 })

    const sameName = await env.DB.prepare(
      `SELECT id FROM shops
       WHERE area_id = ? AND trim(name) = trim(?) AND COALESCE(is_closed, 0) = 0
       ORDER BY created_at ASC LIMIT 1`
    ).bind(newShopAreaId, newShopName).first<{ id: string }>()
    if (sameName) {
      shopId = sameName.id
    } else {
      shopId = makeId(newShopName)
      await env.DB.prepare(
        `INSERT INTO shops
         (id, area_id, name, creator, description, tags, image, creator_user_id)
         VALUES (?, ?, ?, ?, '', '[]', '', ?)`
      ).bind(shopId, newShopAreaId, newShopName, identity.email, identity.id).run()
      createdShop = true
    }
    // A new shop cannot contain a pre-existing item id.
    itemId = null
  }

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
  } else if (newItemName) {
    if (newItemName.length > 40) {
      return json({ error: 'new item name must be 1-40 characters' }, { status: 400 })
    }
    const sameItem = await env.DB.prepare(
      `SELECT id FROM items
       WHERE shop_id = ? AND trim(name) = trim(?) AND COALESCE(is_off_shelf, 0) = 0
       ORDER BY created_at ASC LIMIT 1`
    ).bind(shopId, newItemName).first<{ id: string }>()
    if (sameItem) {
      itemId = sameItem.id
    } else {
      itemId = makeId(newItemName)
      await env.DB.prepare(
        `INSERT INTO items
         (id, shop_id, name, price, heat, description, creator_user_id)
         VALUES (?, ?, ?, ?, 0, '', ?)`
      ).bind(itemId, shopId, newItemName, newItemPrice, identity.id).run()
      createdItem = true
    }
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
    return json({
      id: result.meta.last_row_id,
      shopId,
      createdShop,
      itemId,
      createdItem,
      duplicate: false
    }, { status: 201 })
  } catch (error) {
    const existing = await env.DB.prepare(
      `SELECT id FROM comments WHERE source = 'qq' AND source_message_id = ?`
    ).bind(messageId).first<{ id: number }>()
    if (existing) return json({ id: existing.id, duplicate: true })
    throw error
  }
}
