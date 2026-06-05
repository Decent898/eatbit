import { type Env, json, requireUser } from '../_utils'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env)
  if (!user) return json({ error: 'login required' }, { status: 401 })

  const body = await request.json<{ areaId?: string; name?: string; campus?: string; kind?: string; description?: string }>()
  if (!body.areaId || !body.name || !body.campus || !body.kind) {
    return json({ error: 'areaId, name, campus and kind are required' }, { status: 400 })
  }
  if (!['良乡校区', '中关村校区'].includes(body.campus)) {
    return json({ error: 'invalid campus' }, { status: 400 })
  }
  if (!['食堂', '宿舍楼下', '商业区', '其他地点'].includes(body.kind)) {
    return json({ error: 'invalid kind' }, { status: 400 })
  }

  await env.DB.prepare(
    `UPDATE areas
     SET name = ?, campus = ?, kind = ?, description = ?
     WHERE id = ?`
  ).bind(body.name.trim(), body.campus, body.kind, body.description?.trim() || '', body.areaId).run()

  return json({ ok: true })
}
