import { type Env, getSessionToken, json } from '../_utils'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const token = getSessionToken(request)
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
  return json({ ok: true }, {
    headers: { 'set-cookie': 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' }
  })
}
