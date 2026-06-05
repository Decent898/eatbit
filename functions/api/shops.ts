import { type Env, json, makeId, requireUser, toUtc8Text } from './_utils'

function parseTags(value: unknown) {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      return []
    }
  }
  return []
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  let shops
  try {
    shops = await env.DB.prepare(
      `SELECT id, area_id AS areaId, name, creator, description, tags, image, created_at AS createdAt,
              is_closed AS isClosed, closed_at AS closedAt, creator_user_id AS creatorUserId
       FROM shops
       ORDER BY created_at DESC`
    ).all()
  } catch {
    shops = await env.DB.prepare(
      `SELECT id, area_id AS areaId, name, creator, description, tags, created_at AS createdAt,
              is_closed AS isClosed, closed_at AS closedAt, creator_user_id AS creatorUserId
       FROM shops
       ORDER BY created_at DESC`
    ).all()
  }

  let items
  try {
    items = await env.DB.prepare(
      `SELECT id, shop_id AS shopId, name, price, heat, description,
              is_off_shelf AS isOffShelf, off_shelf_at AS offShelfAt, creator_user_id AS creatorUserId
       FROM items
       ORDER BY heat DESC, created_at DESC`
    ).all()
  } catch {
    items = await env.DB.prepare(
      `SELECT id, shop_id AS shopId, name, price, heat, description,
              is_off_shelf AS isOffShelf, off_shelf_at AS offShelfAt
     FROM items
     ORDER BY heat DESC, created_at DESC`
    ).all()
  }

  let comments
  try {
    comments = await env.DB.prepare(
      `SELECT comments.id, comments.shop_id AS shopId, comments.item_id AS itemId,
              COALESCE(NULLIF(users.nickname, ''), users.email, comments.user) AS user,
              comments.user_id AS userId, comments.score, comments.text, comments.image,
              comments.is_anonymous AS isAnonymous, comments.is_meal_record AS isMealRecord,
              comments.meal_slot AS mealSlot, comments.is_public_comment AS isPublicComment,
              comments.created_at AS createTime
       FROM comments
       LEFT JOIN users ON users.id = comments.user_id
       ORDER BY comments.created_at DESC`
    ).all()
  } catch {
    try {
      comments = await env.DB.prepare(
        `SELECT comments.id, comments.shop_id AS shopId, comments.item_id AS itemId,
                COALESCE(NULLIF(users.nickname, ''), users.email, comments.user) AS user,
                comments.user_id AS userId, comments.score, comments.text, comments.image,
                comments.is_anonymous AS isAnonymous, comments.created_at AS createTime
         FROM comments
         LEFT JOIN users ON users.id = comments.user_id
         ORDER BY comments.created_at DESC`
      ).all()
    } catch {
      comments = await env.DB.prepare(
        `SELECT comments.id, comments.shop_id AS shopId, comments.item_id AS itemId,
                COALESCE(users.email, comments.user) AS user,
                comments.user_id AS userId, comments.score, comments.text, comments.created_at AS createTime
         FROM comments
         LEFT JOIN users ON users.id = comments.user_id
         ORDER BY comments.created_at DESC`
      ).all()
    }
  }

  let itemStats
  try {
    itemStats = await env.DB.prepare(
      `SELECT item_id AS itemId, COUNT(*) AS commentCount, AVG(score) AS averageScore
       FROM comments
       WHERE item_id IS NOT NULL AND COALESCE(is_public_comment, 1) = 1
       GROUP BY item_id`
    ).all()
  } catch {
    itemStats = await env.DB.prepare(
      `SELECT item_id AS itemId, COUNT(*) AS commentCount, AVG(score) AS averageScore
       FROM comments
       WHERE item_id IS NOT NULL
       GROUP BY item_id`
    ).all()
  }

  const statsByItem = new Map<string, { commentCount: number; averageScore: number }>()
  let maxCommentCount = 0
  for (const stat of itemStats.results ?? []) {
    const commentCount = Number(stat.commentCount)
    const averageScore = Number(stat.averageScore ?? 0)
    maxCommentCount = Math.max(maxCommentCount, commentCount)
    statsByItem.set(String(stat.itemId), { commentCount, averageScore })
  }

  const itemsByShop = new Map<string, unknown[]>()
  for (const item of items.results ?? []) {
    const shopId = String(item.shopId)
    const stats = statsByItem.get(String(item.id))
    const normalizedCount = maxCommentCount > 0 && stats ? (stats.commentCount / maxCommentCount) * 70 : 0
    const scoreBonus = stats ? (stats.averageScore / 5) * 30 : 0
    const heat = Math.round(Math.min(100, normalizedCount + scoreBonus))
    const list = itemsByShop.get(shopId) ?? []
    list.push({
      id: String(item.id),
      shopId,
      name: String(item.name),
      price: String(item.price),
      heat,
      commentCount: stats?.commentCount ?? 0,
      description: String(item.description),
      isOffShelf: Boolean(item.isOffShelf),
      offShelfAt: item.offShelfAt ? toUtc8Text(item.offShelfAt) : undefined,
      creatorUserId: item.creatorUserId == null ? undefined : Number(item.creatorUserId)
    })
    itemsByShop.set(shopId, list)
  }

  const commentsByShop = new Map<string, unknown[]>()
  for (const comment of comments.results ?? []) {
    const shopId = String(comment.shopId)
    const list = commentsByShop.get(shopId) ?? []
    list.push({
      id: Number(comment.id),
      itemId: comment.itemId ? String(comment.itemId) : undefined,
      userId: comment.userId == null ? undefined : Number(comment.userId),
      user: comment.isAnonymous === 0 ? String(comment.user) : '匿名用户',
      score: Number(comment.score),
      text: String(comment.text),
      image: comment.image ? String(comment.image) : undefined,
      isAnonymous: comment.isAnonymous == null ? true : Boolean(comment.isAnonymous),
      isMealRecord: comment.isMealRecord == null ? false : Boolean(comment.isMealRecord),
      mealSlot: comment.mealSlot ? String(comment.mealSlot) : '',
      isPublicComment: comment.isPublicComment == null ? true : Boolean(comment.isPublicComment),
      createTime: toUtc8Text(comment.createTime)
    })
    commentsByShop.set(shopId, list)
  }

  return json({
    shops: (shops.results ?? []).map((shop) => ({
      id: String(shop.id),
      areaId: String(shop.areaId),
      name: String(shop.name),
      creator: String(shop.creator),
      description: String(shop.description),
      tags: parseTags(shop.tags),
      image: shop.image ? String(shop.image) : undefined,
      createdAt: toUtc8Text(shop.createdAt),
      isClosed: Boolean(shop.isClosed),
      closedAt: shop.closedAt ? toUtc8Text(shop.closedAt) : undefined,
      creatorUserId: shop.creatorUserId == null ? undefined : Number(shop.creatorUserId),
      items: itemsByShop.get(String(shop.id)) ?? [],
      comments: commentsByShop.get(String(shop.id)) ?? []
    }))
  })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env)
  if (!user) return json({ error: 'login required' }, { status: 401 })
  const body = await request.json<{ areaId?: string; name?: string; image?: string }>()
  if (!body.areaId || !body.name) {
    return json({ error: 'areaId and name are required' }, { status: 400 })
  }

  const id = makeId(body.name)
  try {
    await env.DB.prepare(
      `INSERT INTO shops (id, area_id, name, creator, description, tags, image, creator_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, body.areaId, body.name.trim(), user.email, '', JSON.stringify([]), body.image ?? '', user.id).run()
  } catch {
    await env.DB.prepare(
      `INSERT INTO shops (id, area_id, name, creator, description, tags, creator_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, body.areaId, body.name.trim(), user.email, '', JSON.stringify([]), user.id).run()
  }

  return json({ id }, { status: 201 })
}

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env)
  if (!user) return json({ error: 'login required' }, { status: 401 })
  const body = await request.json<{ shopId?: string }>()
  if (!body.shopId) return json({ error: 'shopId is required' }, { status: 400 })

  const shop = await env.DB.prepare('SELECT creator_user_id AS creatorUserId FROM shops WHERE id = ?').bind(body.shopId).first<{ creatorUserId: number | null }>()
  if (!shop) return json({ error: 'shop not found' }, { status: 404 })
  if (user.role !== 'admin' && Number(shop.creatorUserId) !== user.id) return json({ error: 'forbidden' }, { status: 403 })

  await env.DB.prepare('DELETE FROM comments WHERE shop_id = ?').bind(body.shopId).run()
  await env.DB.prepare('DELETE FROM items WHERE shop_id = ?').bind(body.shopId).run()
  await env.DB.prepare('DELETE FROM shops WHERE id = ?').bind(body.shopId).run()

  return json({ ok: true })
}
