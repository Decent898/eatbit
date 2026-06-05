import { type Env, getCurrentUser, json } from '../_utils'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getCurrentUser(request, env)
  return json({ user })
}
