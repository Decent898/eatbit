import { type Env, json } from '../_utils'

interface Candidate {
  itemId: string
  itemName: string
  price: string
  shopId: string
  shopName: string
  areaName: string
  campus: string
  score: number
  commentCount: number
  description: string
  comments: string[]
}

interface Recommendation {
  itemId: string
  shopId: string
  itemName: string
  shopName: string
  areaName: string
  campus: string
  price: string
  score: number
  commentCount: number
  reason: string
}

const AI_MODEL = '@cf/meta/llama-3.1-8b-instruct'

function compactText(value: unknown, max = 80) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function parseJsonText(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>
    if (typeof object.response === 'string') return object.response
    if (typeof object.result === 'string') return object.result
    if (Array.isArray(object.choices)) {
      const first = object.choices[0] as Record<string, unknown> | undefined
      if (typeof first?.text === 'string') return first.text
      const message = first?.message as Record<string, unknown> | undefined
      if (typeof message?.content === 'string') return message.content
    }
  }
  return ''
}

function parseAiResult(raw: unknown, candidates: Candidate[]) {
  const text = parseJsonText(raw)
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return { summary: '', recommendations: [] as Recommendation[] }
  try {
    const parsed = JSON.parse(match[0]) as {
      summary?: string
      recommendations?: Array<{ itemId?: string; reason?: string }>
    }
    const picked = new Set<string>()
    const recommendations = (parsed.recommendations ?? []).flatMap((entry) => {
      if (!entry.itemId || picked.has(entry.itemId)) return []
      const candidate = candidates.find((item) => item.itemId === entry.itemId)
      if (!candidate) return []
      picked.add(entry.itemId)
      return [{ ...candidate, reason: compactText(entry.reason, 120) || '比较符合你现在的偏好。' }]
    }).slice(0, 3)
    return {
      summary: compactText(parsed.summary, 180),
      recommendations
    }
  } catch {
    return { summary: '', recommendations: [] as Recommendation[] }
  }
}

function fallbackRecommend(candidates: Candidate[], preference: string) {
  const tokens = preference.toLowerCase().split(/\s+/).filter(Boolean)
  const scored = [...candidates]
    .map((candidate) => {
      const haystack = [
        candidate.itemName,
        candidate.shopName,
        candidate.areaName,
        candidate.price,
        candidate.description,
        candidate.comments.join(' ')
      ].join(' ').toLowerCase()
      const matchBonus = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1.2 : 0), 0)
      return {
        ...candidate,
        weight: candidate.score * 1.4 + Math.log(candidate.commentCount + 1) + matchBonus
      }
    })
    .sort((a, b) => b.weight - a.weight)
  const recommendations = scored.slice(0, 3)
    .map(({ weight, ...candidate }) => ({
      ...candidate,
      reason: candidate.commentCount > 0
        ? `评分 ${candidate.score.toFixed(1)}，有 ${candidate.commentCount} 条评价，比较稳。`
        : '暂时评价不多，可以当作探索项试试。'
    }))

  return {
    summary: recommendations.length
      ? '我按你的偏好、预算关键词、菜品评分和评价数量做了综合排序，优先选择仍在营业且未下架的菜品。'
      : '',
    recommendations
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await request.json<{
    campus?: string
    areaIds?: string[]
    preference?: string
    budget?: string
    mood?: string
  }>()

  const campus = body.campus === '中关村校区' || body.campus === '良乡校区' ? body.campus : ''
  const areaIds = Array.isArray(body.areaIds) ? body.areaIds.map(String).filter(Boolean).slice(0, 12) : []
  const preference = compactText(body.preference, 160)
  const budget = compactText(body.budget, 40)
  const mood = compactText(body.mood, 80)

  const areaFilter = areaIds.length > 0 ? `AND areas.id IN (${areaIds.map(() => '?').join(',')})` : ''
  const campusFilter = campus ? 'AND areas.campus = ?' : ''
  const binds = [...(campus ? [campus] : []), ...areaIds]

  const rows = await env.DB.prepare(
    `SELECT items.id AS itemId, items.name AS itemName, items.price, items.description,
            shops.id AS shopId, shops.name AS shopName,
            areas.name AS areaName, areas.campus,
            COALESCE(AVG(CASE WHEN COALESCE(comments.is_public_comment, 1) = 1 THEN comments.score END), 0) AS score,
            COUNT(CASE WHEN COALESCE(comments.is_public_comment, 1) = 1 THEN comments.id END) AS commentCount,
            GROUP_CONCAT(CASE WHEN COALESCE(comments.is_public_comment, 1) = 1 THEN comments.text END, ' / ') AS commentTexts
     FROM items
     JOIN shops ON shops.id = items.shop_id
     JOIN areas ON areas.id = shops.area_id
     LEFT JOIN comments ON comments.item_id = items.id
     WHERE COALESCE(shops.is_closed, 0) = 0
       AND COALESCE(items.is_off_shelf, 0) = 0
       ${campusFilter}
       ${areaFilter}
     GROUP BY items.id
     ORDER BY commentCount DESC, score DESC, items.created_at DESC
     LIMIT 35`
  ).bind(...binds).all()

  const candidates: Candidate[] = (rows.results ?? []).map((row) => ({
    itemId: String(row.itemId),
    itemName: String(row.itemName),
    price: String(row.price ?? ''),
    shopId: String(row.shopId),
    shopName: String(row.shopName),
    areaName: String(row.areaName),
    campus: String(row.campus),
    score: Math.round(Number(row.score ?? 0) * 10) / 10,
    commentCount: Number(row.commentCount ?? 0),
    description: compactText(row.description, 80),
    comments: compactText(row.commentTexts, 240).split(' / ').filter(Boolean).slice(0, 3)
  }))

  if (candidates.length === 0) return json({ recommendations: [], summary: '', source: 'empty', model: AI_MODEL })

  const userText = [
    preference && `偏好：${preference}`,
    budget && `预算：${budget}`,
    mood && `状态：${mood}`,
    campus && `校区：${campus}`
  ].filter(Boolean).join('\n') || '用户没有特别偏好，请给稳妥又有差异的选择。'

  if (env.AI) {
    try {
      const result = await env.AI.run(AI_MODEL, {
        messages: [
          {
            role: 'system',
            content: '你是北京理工大学校园吃饭推荐助手。只能从候选菜品里选择，不能编造店铺或菜品。需要综合考虑用户偏好、预算、状态、校区、评分、评价数量、评论内容和价格。返回严格 JSON，不要 Markdown。JSON 格式：{"summary":"80字内中文综合评价，说明你为什么这样选","recommendations":[{"itemId":"候选 itemId","reason":"40字内中文理由，结合评分/评论/价格/偏好"}]}。'
          },
          {
            role: 'user',
            content: `用户需求：\n${userText}\n\n候选菜品 JSON：\n${JSON.stringify(candidates.map(({ comments, ...item }) => ({ ...item, comments })))}`
          }
        ],
        max_tokens: 512
      })
      const aiResult = parseAiResult(result, candidates)
      if (aiResult.recommendations.length > 0) return json({ ...aiResult, source: 'workers-ai', model: AI_MODEL })
    } catch {
      // Fall back to deterministic recommendations if Workers AI is unavailable or quota is exhausted.
    }
  }

  return json({ ...fallbackRecommend(candidates, `${preference} ${budget} ${mood}`), source: 'fallback', model: AI_MODEL })
}
