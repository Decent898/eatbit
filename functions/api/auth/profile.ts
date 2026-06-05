import { type Env, json, requireUser } from '../_utils'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env)
  if (!user) return json({ error: 'login required' }, { status: 401 })

  const body = await request.json<{ nickname?: string; defaultCampus?: string }>()
  const nickname = body.nickname?.trim()
  const defaultCampus = body.defaultCampus === '中关村校区' ? '中关村校区' : '良乡校区'
  if (!nickname || nickname.length > 20) {
    return json({ error: 'nickname length must be 1-20' }, { status: 400 })
  }

  try {
    await env.DB.prepare('UPDATE users SET nickname = ?, default_campus = ? WHERE id = ?').bind(nickname, defaultCampus, user.id).run()
  } catch {
    await env.DB.prepare('UPDATE users SET nickname = ? WHERE id = ?').bind(nickname, user.id).run()
  }

  return json({
    user: {
      id: user.id,
      email: user.email,
      nickname,
      role: user.role,
      defaultCampus
    }
  })
}
