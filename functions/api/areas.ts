import { type Env, json, makeId, requireUser, toUtc8Text } from './_utils'

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT id, name, campus, kind, description, created_by AS createdBy, created_at AS createdAt
     FROM areas
     ORDER BY created_at ASC`
  ).all()

  return json({
    areas: (results ?? []).map((area) => ({
      ...area,
      createdAt: toUtc8Text(area.createdAt)
    }))
  })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env)
  if (!user) return json({ error: 'login required' }, { status: 401 })
  const body = await request.json<{ name?: string; campus?: string; kind?: string; description?: string }>()
  if (!body.name || !body.campus || !body.kind) {
    return json({ error: 'name, campus and kind are required' }, { status: 400 })
  }

  const id = makeId(body.name)
  await env.DB.prepare(
    `INSERT INTO areas (id, name, campus, kind, description, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, body.name.trim(), body.campus, body.kind, body.description?.trim() || '区域说明待补充。', user.email).run()

  return json({ id }, { status: 201 })
}
