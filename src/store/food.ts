import { computed, reactive } from 'vue'

export type Campus = '良乡校区' | '中关村校区'
export type AreaKind = '食堂' | '宿舍楼下' | '商业区' | '其他地点'
export type MealSlot = '早餐' | '午餐' | '晚餐' | '其他'

export interface FoodItem {
  id: string
  shopId: string
  name: string
  price: string
  heat: number
  commentCount?: number
  description: string
  isOffShelf?: boolean
  offShelfAt?: string
  creatorUserId?: number
}

export interface FoodComment {
  id: number
  user: string
  score: number
  text: string
  createTime: string
  itemId?: string
  userId?: number
  image?: string
  isAnonymous?: boolean
  isMealRecord?: boolean
  mealSlot?: MealSlot | ''
  isPublicComment?: boolean
}

export interface CanteenArea {
  id: string
  name: string
  campus: Campus
  kind: AreaKind
  description: string
  createdBy: 'admin'
}

export interface FoodShop {
  id: string
  areaId: string
  name: string
  creator: string
  description: string
  tags: string[]
  image?: string
  createdAt: string
  isClosed: boolean
  closedAt?: string
  items: FoodItem[]
  comments: FoodComment[]
  creatorUserId?: number
}

export interface FeedbackTicket {
  id: number
  title: string
  content: string
  status: 'open' | 'closed'
  userId?: number
  userEmail: string
  userNickname: string
  createdAt: string
  closedAt: string
}

function similarity(a: string, b: string) {
  const left = new Set(a.trim().toLowerCase())
  const right = new Set(b.trim().toLowerCase())
  if (left.size === 0 || right.size === 0) return 0
  const shared = [...left].filter((char) => right.has(char)).length
  return shared / Math.max(left.size, right.size)
}

function todayUtc8() {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 10)
}

const seedAreas: CanteenArea[] = [
  { id: 'north-canteen', name: '北食堂', campus: '良乡校区', kind: '食堂', description: '静园宿舍南侧、学生服务中心东侧，共三层，常说北一、北二、北三。', createdBy: 'admin' },
  { id: 'halal-canteen', name: '清真食堂', campus: '良乡校区', kind: '食堂', description: '位于北食堂西侧、靠近静园，只有一层，早餐评价较特别。', createdBy: 'admin' },
  { id: 'south-canteen', name: '南食堂', campus: '良乡校区', kind: '食堂', description: '南校区相对中心位置，靠近至善园宿舍区，共三层，常说南一、南二、南三。', createdBy: 'admin' },
  { id: 'east-canteen', name: '东食堂', campus: '良乡校区', kind: '食堂', description: '东区宿舍区中心地带，甘棠园南侧，分东一、东二、东三。', createdBy: 'admin' },
  { id: 'xuefu-inside', name: '学服内', campus: '良乡校区', kind: '商业区', description: '学生服务中心负一楼内部，饭团、包子、铁板烧等档口集中。', createdBy: 'admin' },
  { id: 'xuefu-outside', name: '学服外', campus: '良乡校区', kind: '商业区', description: '学生服务中心负一楼外侧露天区域，小吃摊位和独立店铺较多。', createdBy: 'admin' },
  { id: 'xuefu-qingka', name: '学服轻咖', campus: '良乡校区', kind: '商业区', description: '学生服务中心二楼轻咖区域，适合整理轻食、简餐和饮品。', createdBy: 'admin' },
  { id: 'wencui-qingka', name: '文萃M轻咖', campus: '良乡校区', kind: '商业区', description: '文萃楼 M 附近轻咖区域，有米线、沙拉等轻食选择。', createdBy: 'admin' },
  { id: 'gantang-7d', name: '甘棠园D栋 7D', campus: '良乡校区', kind: '宿舍楼下', description: '甘棠园D栋宿舍楼底层-1楼及周边，聚集小吃店和外卖窗口。', createdBy: 'admin' },
  { id: 'gantang-5b', name: '甘棠园B栋 5B', campus: '良乡校区', kind: '宿舍楼下', description: '甘棠园B栋宿舍楼-1楼，炸串、鱼粉、餐吧等小店集中。', createdBy: 'admin' },
  { id: 'zhongguancun-central', name: '中关村中心食堂', campus: '中关村校区', kind: '食堂', description: '中关村校区主力食堂，后续可继续按楼层和窗口补充。', createdBy: 'admin' }
]

const seedShops: FoodShop[] = [
  {
    id: 'north-iron-plate',
    areaId: 'north-canteen',
    name: '北三铁板窗口',
    creator: '北理食记',
    description: '北三的铁板类窗口，不知道吃什么时比较稳。',
    tags: ['北三', '铁板', '意面'],
    createdAt: '2026-05-18',
    isClosed: false,
    items: [
      { id: 'north-iron-plate-rice', shopId: 'north-iron-plate', name: '铁板饭', price: '16+', heat: 88, description: '出餐较稳，油分略大。' },
      { id: 'north-iron-plate-pasta', shopId: 'north-iron-plate', name: '铁板意面', price: '16+', heat: 92, description: '心头好之一，现做等待稍久。' }
    ],
    comments: [
      { id: 1, user: '北理食记', score: 4.6, itemId: 'north-iron-plate-pasta', text: '铁板意面和铁板饭都算稳，刚出锅会很烫。', createTime: '2026-05-19' },
      { id: 2, user: '价格表', score: 4.2, itemId: 'north-iron-plate-rice', text: '油分有点大，但味道香，很下饭。', createTime: '2026-05-20' }
    ]
  },
  {
    id: 'north-rice-noodle',
    areaId: 'north-canteen',
    name: '北二米线窗口',
    creator: '北理食记',
    description: '北二热汤米线窗口，白汤和酸汤都有人推荐。',
    tags: ['北二', '米线', '热汤'],
    createdAt: '2026-05-16',
    isClosed: false,
    items: [
      { id: 'north-rice-noodle-sour', shopId: 'north-rice-noodle', name: '酸汤米线', price: '12+', heat: 84, description: '汤味好，适合想吃热乎的时候。' },
      { id: 'north-rice-noodle-beef', shopId: 'north-rice-noodle', name: '肥牛米线', price: '15+', heat: 78, description: '加肥牛更满足，量略少。' }
    ],
    comments: [
      { id: 3, user: '北理食记', score: 4.3, itemId: 'north-rice-noodle-sour', text: '汤味调得好，一段时间不吃会想。', createTime: '2026-05-17' }
    ]
  },
  {
    id: 'east-chanzui',
    areaId: 'east-canteen',
    name: '东三馋嘴窗口',
    creator: '北理食记',
    description: '东三重口窗口，酱料很有记忆点。',
    tags: ['东三', '高分', '重口'],
    createdAt: '2026-05-20',
    isClosed: false,
    items: [
      { id: 'east-chanzui-potato', shopId: 'east-chanzui', name: '馋嘴土豆片', price: '12+', heat: 98, description: '酱料特别，土豆片很受欢迎。' },
      { id: 'east-chanzui-rice', shopId: 'east-chanzui', name: '馋嘴饭', price: '14+', heat: 90, description: '汤汁适合拌饭，肉偏少。' }
    ],
    comments: [
      { id: 4, user: '食记vol.02', score: 4.8, itemId: 'east-chanzui-potato', text: '土豆片非常好吃，酱料特别，吃了还想吃。', createTime: '2026-05-20' }
    ]
  },
  {
    id: 'east-crispy-potato',
    areaId: 'east-canteen',
    name: '东二炒菜窗口',
    creator: '校内饮食测评',
    description: '东二炒菜窗口，适合盖饭和家常炒菜。',
    tags: ['东二', '炒菜窗口', '便宜'],
    createdAt: '2026-05-19',
    isClosed: false,
    items: [
      { id: 'east-crispy-potato-item', shopId: 'east-crispy-potato', name: '脆土豆丝', price: '约9-12', heat: 94, description: '咸淡适宜，便宜又好吃。' }
    ],
    comments: [
      { id: 5, user: '测评9', score: 4.6, itemId: 'east-crispy-potato-item', text: '非常好吃，另一道菜最好点带汤的，不然有点干。', createTime: '2026-05-19' }
    ]
  },
  {
    id: 'xuefu-jianbing',
    areaId: 'xuefu-outside',
    name: '学服外煎饼摊',
    creator: '校内饮食测评',
    description: '学服外露天煎饼摊，环境一般但口碑很强。',
    tags: ['学服外', '煎饼', '小吃'],
    createdAt: '2026-05-12',
    isClosed: false,
    items: [
      { id: 'xuefu-jianbing-basic', shopId: 'xuefu-jianbing', name: '基础煎饼加辣条火腿', price: '平均9', heat: 96, description: '新鲜好吃会脆，辣条必须是丝状。' },
      { id: 'xuefu-jianbing-hand', shopId: 'xuefu-jianbing', name: '手抓饼', price: '平均9', heat: 72, description: '普通稳定款，适合赶时间。' }
    ],
    comments: [
      { id: 6, user: '测评9', score: 4.8, itemId: 'xuefu-jianbing-basic', text: '全校吃过的煎饼里很能打，新鲜好吃会脆。', createTime: '2026-05-12' }
    ]
  },
  {
    id: 'xuefu-taiwan-roll',
    areaId: 'xuefu-inside',
    name: '学服饭团窗口',
    creator: '校内饮食测评',
    description: '学服内饭团窗口，饭点人会多。',
    tags: ['学服内', '饭团', '高分'],
    createdAt: '2026-05-13',
    isClosed: false,
    items: [
      { id: 'xuefu-roll-taiwan', shopId: 'xuefu-taiwan-roll', name: '台湾饭团', price: '平均8', heat: 91, description: '推荐里脊肉松饭团加辣条。' }
    ],
    comments: [
      { id: 7, user: '测评9', score: 4.7, itemId: 'xuefu-roll-taiwan', text: '里脊肉松加辣条很推荐，适合带回宿舍吃。', createTime: '2026-05-13' }
    ]
  },
  {
    id: 'gantang-7d-beef-noodle',
    areaId: 'gantang-7d',
    name: '7D牛肉汤窗口',
    creator: '校内饮食测评',
    description: '7D高分热汤窗口，适合喜欢加醋的人。',
    tags: ['7D', '牛肉汤', '高分'],
    createdAt: '2026-05-10',
    isClosed: false,
    items: [
      { id: 'gantang-7d-beef-noodle-item', shopId: 'gantang-7d-beef-noodle', name: '淮南牛肉汤方便面', price: '约15', heat: 99, description: '酸酸开胃，热汤党友好。' }
    ],
    comments: [
      { id: 8, user: '测评9', score: 4.9, itemId: 'gantang-7d-beef-noodle-item', text: '我的最爱，加很多醋非常开胃。', createTime: '2026-05-10' }
    ]
  },
  {
    id: 'gantang-5b-zhachuan',
    areaId: 'gantang-5b',
    name: '5B炸串店',
    creator: '校内饮食测评',
    description: '5B宿舍楼下炸串店，香但偏油。',
    tags: ['5B', '炸串', '宿舍楼下'],
    createdAt: '2026-05-09',
    isClosed: false,
    items: [
      { id: 'gantang-5b-zhachuan-item', shopId: 'gantang-5b-zhachuan', name: '炸串', price: '按串计', heat: 82, description: '很香，油感偏重。' }
    ],
    comments: [
      { id: 9, user: '测评9', score: 4.4, itemId: 'gantang-5b-zhachuan-item', text: '香得很，但是油不太好吃，有点太油。', createTime: '2026-05-09' }
    ]
  }
]

const state = reactive({
  areas: seedAreas,
  shops: seedShops
})

const apiState = reactive({
  loaded: false,
  loading: false,
  error: ''
})

function averageScore(shop: FoodShop) {
  const publicComments = shop.comments.filter((comment) => comment.isPublicComment !== false)
  if (publicComments.length === 0) return 0
  const total = publicComments.reduce((sum, comment) => sum + comment.score, 0)
  return Math.round((total / publicComments.length) * 10) / 10
}

function itemHeat(shop: FoodShop, itemId: string) {
  const itemComments = shop.comments.filter((comment) => comment.itemId === itemId && comment.isPublicComment !== false)
  if (itemComments.length === 0) return 0
  const maxCount = Math.max(1, ...shop.items.map((item) => shop.comments.filter((comment) => comment.itemId === item.id && comment.isPublicComment !== false).length))
  const average = itemComments.reduce((sum, comment) => sum + comment.score, 0) / itemComments.length
  return Math.round(Math.min(100, (itemComments.length / maxCount) * 70 + (average / 5) * 30))
}

function itemCommentCount(shop: FoodShop, itemId: string) {
  return shop.comments.filter((comment) => comment.itemId === itemId && comment.isPublicComment !== false).length
}

function itemAverageScore(shop: FoodShop, itemId: string) {
  const itemComments = shop.comments.filter((comment) => comment.itemId === itemId && comment.isPublicComment !== false)
  if (itemComments.length === 0) return 0
  const total = itemComments.reduce((sum, comment) => sum + comment.score, 0)
  return Math.round((total / itemComments.length) * 10) / 10
}

function allItemsWithShop() {
  return state.shops.flatMap((shop) => {
    const area = getArea(shop.areaId)
    return shop.items.map((item) => ({
      item,
      shop,
      area,
      score: itemAverageScore(shop, item.id),
      commentCount: itemCommentCount(shop, item.id),
      heat: itemHeat(shop, item.id)
    }))
  })
}

function shopScoreRank(limit = 10) {
  return [...state.shops]
    .filter((shop) => !shop.isClosed)
    .map((shop) => ({ shop, area: getArea(shop.areaId), score: averageScore(shop), commentCount: shop.comments.filter((comment) => comment.isPublicComment !== false).length }))
    .filter((entry) => entry.commentCount > 0)
    .sort((a, b) => b.score - a.score || b.commentCount - a.commentCount)
    .slice(0, limit)
}

function shopHeatRank(limit = 10) {
  return [...state.shops]
    .filter((shop) => !shop.isClosed)
    .map((shop) => ({ shop, area: getArea(shop.areaId), score: averageScore(shop), commentCount: shop.comments.filter((comment) => comment.isPublicComment !== false).length }))
    .filter((entry) => entry.commentCount > 0)
    .sort((a, b) => b.commentCount - a.commentCount || b.score - a.score)
    .slice(0, limit)
}

function itemScoreRank(limit = 10) {
  return allItemsWithShop()
    .filter((entry) => entry.commentCount > 0 && !entry.shop.isClosed && !entry.item.isOffShelf)
    .sort((a, b) => b.score - a.score || b.commentCount - a.commentCount)
    .slice(0, limit)
}

function itemHeatRank(limit = 10) {
  return allItemsWithShop()
    .filter((entry) => entry.commentCount > 0 && !entry.shop.isClosed && !entry.item.isOffShelf)
    .sort((a, b) => b.commentCount - a.commentCount || b.score - a.score)
    .slice(0, limit)
}

function getArea(areaId: string) {
  return state.areas.find((area) => area.id === areaId)
}

function getShop(shopId: string) {
  return state.shops.find((shop) => shop.id === shopId)
}

function getItem(itemId?: string) {
  if (!itemId) return undefined
  return state.shops.flatMap((shop) => shop.items).find((item) => item.id === itemId)
}

function getShopsByArea(areaId: string) {
  return state.shops.filter((shop) => shop.areaId === areaId)
}

function getItemsByShop(shopId: string) {
  return getShop(shopId)?.items ?? []
}

function searchAll(keyword: string) {
  const query = keyword.trim().toLowerCase()
  if (!query) return { areas: [], shops: [], items: [] }
  return {
    areas: state.areas.filter((area) => [area.name, area.campus, area.kind, area.description].join(' ').toLowerCase().includes(query)),
    shops: state.shops.filter((shop) => {
      const area = getArea(shop.areaId)
      return [shop.name, shop.description, shop.tags.join(' '), area?.name, area?.campus, area?.kind].join(' ').toLowerCase().includes(query)
    }),
    items: allItemsWithShop()
      .filter((entry) => [entry.item.name, entry.item.price, entry.item.description, entry.shop.name, entry.area?.name, entry.area?.campus].join(' ').toLowerCase().includes(query))
      .map((entry) => entry.item)
  }
}

function buildSummary(shop: FoodShop) {
  const avg = averageScore(shop)
  const text = shop.comments.filter((comment) => comment.isPublicComment !== false).map((comment) => comment.text).join(' ')
  const queue = text.includes('排') || text.includes('饭点') || text.includes('等待') ? '注意错峰，热门时段可能排队或等待。' : '排队压力暂时不突出。'
  const taste = text.includes('咸') || text.includes('重') ? '口味反馈略偏重，介意咸度可以谨慎选择。' : '多数反馈认为口味稳定。'
  const value = avg >= 4.5 ? '综合口碑很强，适合作为优先打卡项。' : '评价稳中有分歧，适合作为日常备选。'
  return `${value}${taste}${queue}`
}

function addAreaLocal(payload: Pick<CanteenArea, 'name' | 'campus' | 'kind' | 'description'>, forcedId?: string) {
  const id = forcedId ?? `${Date.now()}-${payload.name}`
  if (state.areas.some((area) => area.id === id)) return id
  state.areas.unshift({ id, createdBy: 'admin', ...payload })
  return id
}

function updateAreaLocal(areaId: string, payload: Pick<CanteenArea, 'name' | 'campus' | 'kind' | 'description'>) {
  const area = getArea(areaId)
  if (!area) return
  area.name = payload.name
  area.campus = payload.campus
  area.kind = payload.kind
  area.description = payload.description
}

async function addArea(payload: Pick<CanteenArea, 'name' | 'campus' | 'kind' | 'description'>) {
  const fallbackId = `${Date.now()}-${payload.name}`
  try {
    const response = await fetch('/api/areas', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!response.ok) throw new Error('API unavailable')
    const data = await response.json() as { id: string }
    return addAreaLocal(payload, data.id)
  } catch {
    return addAreaLocal(payload, fallbackId)
  }
}

async function updateArea(areaId: string, payload: Pick<CanteenArea, 'name' | 'campus' | 'kind' | 'description'>) {
  const response = await fetch('/api/areas/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ areaId, ...payload })
  })
  if (!response.ok) throw new Error('update area failed')
  updateAreaLocal(areaId, payload)
}

function addShopLocal(payload: Pick<FoodShop, 'areaId' | 'name'>, forcedId?: string) {
  const id = forcedId ?? `${Date.now()}-${payload.name}`
  if (state.shops.some((shop) => shop.id === id)) return id
  state.shops.unshift({
    id,
    creator: '当前用户',
    description: '',
    tags: [],
    createdAt: todayUtc8(),
    isClosed: false,
    items: [],
    comments: [],
    ...payload
  })
  return id
}

async function addShop(payload: Pick<FoodShop, 'areaId' | 'name'> & { image?: string }) {
  const fallbackId = `${Date.now()}-${payload.name}`
  try {
    const response = await fetch('/api/shops', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!response.ok) throw new Error('API unavailable')
    const data = await response.json() as { id: string }
    return addShopLocal(payload, data.id)
  } catch {
    return addShopLocal(payload, fallbackId)
  }
}

function addItemLocal(payload: Pick<FoodItem, 'shopId' | 'name' | 'price'>, forcedId?: string) {
  const shop = getShop(payload.shopId)
  if (!shop) return ''
  const id = forcedId ?? `${Date.now()}-${payload.name}`
  if (shop.items.some((item) => item.id === id)) return id
  shop.items.unshift({ id, heat: 0, description: '', ...payload })
  return id
}

async function addItem(payload: Pick<FoodItem, 'shopId' | 'name' | 'price'>) {
  const fallbackId = `${Date.now()}-${payload.name}`
  try {
    const response = await fetch('/api/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!response.ok) throw new Error('API unavailable')
    const data = await response.json() as { id: string }
    return addItemLocal(payload, data.id)
  } catch {
    return addItemLocal(payload, fallbackId)
  }
}

function addCommentLocal(
  shopId: string,
  payload: Pick<FoodComment, 'score' | 'text' | 'itemId'> & { image?: string; isAnonymous?: boolean; isMealRecord?: boolean; mealSlot?: MealSlot | ''; isPublicComment?: boolean },
  forcedId?: number,
  userLabel = '匿名用户'
) {
  const shop = getShop(shopId)
  if (!shop) return
  shop.comments.unshift({
    id: forcedId ?? Date.now(),
    user: payload.isAnonymous === false ? userLabel : '匿名用户',
    createTime: todayUtc8(),
    ...payload
  })
}

async function addComment(
  shopId: string,
  payload: Pick<FoodComment, 'score' | 'text' | 'itemId'> & { image?: string; isAnonymous?: boolean; isMealRecord?: boolean; mealSlot?: MealSlot | ''; isPublicComment?: boolean },
  userLabel?: string
) {
  try {
    const response = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shopId, ...payload })
    })
    if (!response.ok) throw new Error('API unavailable')
    const data = await response.json() as { id: number }
    addCommentLocal(shopId, payload, data.id, userLabel)
  } catch {
    addCommentLocal(shopId, payload, undefined, userLabel)
  }
}

function updateShopImageLocal(shopId: string, image: string) {
  const shop = getShop(shopId)
  if (!shop) return
  shop.image = image
}

async function updateShopImage(shopId: string, image: string) {
  const response = await fetch('/api/shops/image', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ shopId, image })
  })
  if (!response.ok) throw new Error('update shop image failed')
  updateShopImageLocal(shopId, image)
}

function updateShopLocal(shopId: string, payload: { name: string; description?: string }) {
  const shop = getShop(shopId)
  if (!shop) return
  shop.name = payload.name
  shop.description = payload.description ?? ''
}

async function updateShop(shopId: string, payload: { name: string; description?: string }) {
  const response = await fetch('/api/shops/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ shopId, ...payload })
  })
  if (!response.ok) throw new Error('update shop failed')
  updateShopLocal(shopId, payload)
}

function updateItemLocal(itemId: string, payload: { name: string; price?: string; description?: string }) {
  const item = getItem(itemId)
  if (!item) return
  item.name = payload.name
  item.price = payload.price ?? ''
  item.description = payload.description ?? ''
}

async function updateItem(itemId: string, payload: { name: string; price?: string; description?: string }) {
  const response = await fetch('/api/items/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ itemId, ...payload })
  })
  if (!response.ok) throw new Error('update item failed')
  updateItemLocal(itemId, payload)
}

function deleteShopLocal(shopId: string) {
  state.shops = state.shops.filter((shop) => shop.id !== shopId)
}

async function deleteShop(shopId: string) {
  const response = await fetch('/api/shops', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ shopId })
  })
  if (!response.ok) throw new Error('delete shop failed')
  deleteShopLocal(shopId)
}

function deleteItemLocal(itemId: string) {
  for (const shop of state.shops) {
    shop.items = shop.items.filter((item) => item.id !== itemId)
    for (const comment of shop.comments) {
      if (comment.itemId === itemId) comment.itemId = undefined
    }
  }
}

async function deleteItem(itemId: string) {
  const response = await fetch('/api/items', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ itemId })
  })
  if (!response.ok) throw new Error('delete item failed')
  deleteItemLocal(itemId)
}

function deleteCommentLocal(commentId: number) {
  for (const shop of state.shops) {
    shop.comments = shop.comments.filter((comment) => comment.id !== commentId)
  }
}

async function deleteComment(commentId: number) {
  const response = await fetch('/api/comments', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ commentId })
  })
  if (!response.ok) throw new Error('delete comment failed')
  deleteCommentLocal(commentId)
}

function suggestShopNames(areaId: string, keyword: string) {
  const query = keyword.trim()
  if (!query) return []
  return state.shops
    .filter((shop) => shop.areaId === areaId)
    .map((shop) => ({ name: shop.name, score: similarity(query, shop.name) }))
    .filter((item) => item.score >= 0.35 || item.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.name)
}

function suggestItemNames(keyword: string) {
  const query = keyword.trim()
  if (!query) return []
  return [...new Set(state.shops.flatMap((shop) => shop.items.map((item) => item.name)))]
    .map((name) => ({ name, score: similarity(query, name) }))
    .filter((item) => item.score >= 0.35 || item.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.name)
}

function setShopClosedLocal(shopId: string, isClosed: boolean) {
  const shop = getShop(shopId)
  if (!shop) return
  shop.isClosed = isClosed
  shop.closedAt = isClosed ? todayUtc8() : undefined
  if (isClosed) {
    for (const item of shop.items) {
      item.isOffShelf = true
      item.offShelfAt = item.offShelfAt ?? todayUtc8()
    }
  }
}

async function setShopClosed(shopId: string, isClosed: boolean) {
  try {
    const response = await fetch('/api/shops/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shopId, isClosed })
    })
    if (!response.ok) throw new Error('API unavailable')
  } finally {
    setShopClosedLocal(shopId, isClosed)
  }
}

function setItemOffShelfLocal(itemId: string, isOffShelf: boolean) {
  const item = getItem(itemId)
  if (!item) return
  item.isOffShelf = isOffShelf
  item.offShelfAt = isOffShelf ? todayUtc8() : undefined
}

async function setItemOffShelf(itemId: string, isOffShelf: boolean) {
  try {
    const response = await fetch('/api/items/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemId, isOffShelf })
    })
    if (!response.ok) throw new Error('API unavailable')
  } finally {
    setItemOffShelfLocal(itemId, isOffShelf)
  }
}

async function loadFromApi() {
  if (apiState.loading || apiState.loaded) return
  apiState.loading = true
  apiState.error = ''
  try {
    const [areasResponse, shopsResponse] = await Promise.all([fetch('/api/areas'), fetch('/api/shops')])
    if (!areasResponse.ok || !shopsResponse.ok) throw new Error('API unavailable')
    const areasData = await areasResponse.json() as { areas: CanteenArea[] }
    const shopsData = await shopsResponse.json() as { shops: FoodShop[] }
    state.areas = areasData.areas
    state.shops = shopsData.shops
    apiState.loaded = true
  } catch (error) {
    apiState.error = error instanceof Error ? error.message : 'API unavailable'
  } finally {
    apiState.loading = false
  }
}

async function adminFetchTickets() {
  const response = await fetch('/api/tickets')
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'admin required' })) as { error?: string }
    throw new Error(data.error || 'admin required')
  }
  return response.json() as Promise<{ tickets: FeedbackTicket[] }>
}

async function adminUpdateTicket(ticketId: number, status: 'open' | 'closed') {
  const response = await fetch('/api/tickets', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ticketId, status })
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'update ticket failed' })) as { error?: string }
    throw new Error(data.error || 'update ticket failed')
  }
}

export function useFoodStore() {
  return {
    areas: computed(() => state.areas),
    shops: computed(() => state.shops),
    apiState,
    loadFromApi,
    averageScore,
    itemHeat,
    itemCommentCount,
    itemAverageScore,
    allItemsWithShop,
    shopScoreRank,
    shopHeatRank,
    itemScoreRank,
    itemHeatRank,
    getArea,
    getShop,
    getItem,
    getShopsByArea,
    getItemsByShop,
    searchAll,
    buildSummary,
    addArea,
    updateArea,
    addShop,
    addItem,
    addComment,
    updateShopImage,
    updateShop,
    updateItem,
    deleteShop,
    deleteItem,
    deleteComment,
    suggestShopNames,
    suggestItemNames,
    setShopClosed,
    setItemOffShelf,
    adminFetchTickets,
    adminUpdateTicket
  }
}
