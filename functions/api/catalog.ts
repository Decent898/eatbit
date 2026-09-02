import { type Env, json } from './_utils'

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const [areas, shops, items] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id, name, campus, kind
       FROM areas
       ORDER BY created_at ASC`
    ),
    env.DB.prepare(
      `SELECT id, area_id AS areaId, name, is_closed AS isClosed
       FROM shops
       ORDER BY created_at DESC`
    ),
    env.DB.prepare(
      `SELECT id, shop_id AS shopId, name, price, is_off_shelf AS isOffShelf
       FROM items
       ORDER BY created_at DESC`
    )
  ])

  return json({
    areas: areas.results ?? [],
    shops: shops.results ?? [],
    items: items.results ?? []
  }, {
    headers: { 'cache-control': 'public, max-age=60' }
  })
}
