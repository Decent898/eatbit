<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SearchOutlined from '@vicons/material/SearchOutlined'
import TodayOutlined from '@vicons/material/TodayOutlined'
import CasinoOutlined from '@vicons/material/CasinoOutlined'
import { useFoodStore, type Campus } from '@/store/food'
import { useAuthStore } from '@/store/auth'
import FormField from '@/components/FormField.vue'
import { compressImageToDataUrl } from '@/utils/image'

const route = useRoute()
const router = useRouter()
const food = useFoodStore()
const auth = useAuthStore()

const activeTab = ref(String(route.query.tab || 'areas'))
const filters = reactive({
  campus: '良乡校区' as Campus | '全部',
  keyword: ''
})
const todayForm = reactive({
  areaId: '',
  shopId: '',
  itemId: '',
  newItemPrice: '',
  mealSlot: '午餐' as '早餐' | '午餐' | '晚餐' | '其他',
  syncComment: false,
  score: 5,
  text: '',
  image: '',
  isAnonymous: true
})
const imageUploading = ref(false)
const diceState = reactive({
  areaIds: [] as string[],
  rolling: false,
  resultItemId: ''
})
const aiState = reactive({
  areaIds: [] as string[],
  preference: '',
  budget: '',
  mood: '',
  loading: false,
  source: '',
  results: [] as Array<{
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
  }>
})
const preferredCampus = computed<Campus>(() => auth.user.value?.defaultCampus ?? '良乡校区')

watch(
  () => route.query.tab,
  (tab) => {
    activeTab.value = String(tab || 'areas')
  }
)

watch(activeTab, (tab) => {
  if (String(route.query.tab || 'areas') !== tab) {
    router.replace({ path: '/home', query: tab === 'areas' ? {} : { tab } })
  }
})

watch(() => todayForm.areaId, () => {
  todayForm.shopId = ''
  todayForm.itemId = ''
  todayForm.newItemPrice = ''
})

watch(() => todayForm.shopId, () => {
  todayForm.itemId = ''
  todayForm.newItemPrice = ''
})

watch(preferredCampus, (campus) => {
  if (filters.campus === '全部' || filters.campus !== campus) {
    filters.campus = campus
  }
}, { immediate: true })

const visibleAreas = computed(() => {
  return food.areas.value.filter((area) => filters.campus === '全部' || area.campus === filters.campus)
})

const searchResults = computed(() => {
  const result = food.searchAll(filters.keyword)
  const campusMatched = (area?: { campus?: string }) => filters.campus === '全部' || area?.campus === filters.campus
  return {
    shops: result.shops
      .map((shop) => ({
        shop,
        area: food.getArea(shop.areaId),
        score: food.averageScore(shop),
        commentCount: shop.comments.length
      }))
      .filter((entry) => campusMatched(entry.area)),
    items: food.allItemsWithShop()
      .filter((entry) => result.items.some((item) => item.id === entry.item.id))
      .filter((entry) => campusMatched(entry.area))
  }
})

const showSearchEmpty = computed(() => filters.keyword.trim() && searchResults.value.shops.length === 0 && searchResults.value.items.length === 0)

const areaOptions = computed(() => food.areas.value.map((area) => ({
  label: `${area.name} · ${area.campus}`,
  value: area.id
})))

const preferredAreaOptions = computed(() => food.areas.value
  .filter((area) => filters.campus === '全部' || area.campus === filters.campus)
  .map((area) => ({
    label: `${area.name} · ${area.campus}`,
    value: area.id
  })))

const campusFilter = <T extends { area?: { campus?: string } }>(entries: T[]) =>
  entries.filter((entry) => filters.campus === '全部' || entry.area?.campus === filters.campus)

const itemScoreRank = computed(() => campusFilter(food.itemScoreRank(30)).slice(0, 8))
const shopScoreRank = computed(() => campusFilter(food.shopScoreRank(30)).slice(0, 10))
const shopHeatRank = computed(() => campusFilter(food.shopHeatRank(30)).slice(0, 10))
const itemHeatRank = computed(() => campusFilter(food.itemHeatRank(30)).slice(0, 10))

const todayShopOptions = computed(() => food.shops.value
  .filter((shop) => !todayForm.areaId || shop.areaId === todayForm.areaId)
  .map((shop) => ({
    label: `${shop.name}${shop.isClosed ? '（已关门）' : ''}`,
    value: shop.id,
    disabled: shop.isClosed
  })))

const todayItemOptions = computed(() => {
  const shop = food.getShop(todayForm.shopId)
  return (shop?.items ?? []).map((item) => ({
    label: `${item.name}${item.price ? ` · ${item.price}` : ''}${item.isOffShelf ? '（已下架）' : ''}`,
    value: item.id,
    disabled: item.isOffShelf
}))
})

const todaySelectedShop = computed(() => food.getShop(todayForm.shopId))
const todaySelectedItem = computed(() => food.getItem(todayForm.itemId))
const isNewTodayShop = computed(() => Boolean(todayForm.shopId.trim()) && !todaySelectedShop.value)
const isNewTodayItem = computed(() => Boolean(todayForm.itemId.trim()) && !todaySelectedItem.value)

const dicePool = computed(() => {
  const selected = new Set(diceState.areaIds)
  return food.allItemsWithShop().filter((entry) => {
    if (diceState.areaIds.length > 0 && (!entry.area || !selected.has(entry.area.id))) return false
    if (diceState.areaIds.length === 0 && filters.campus !== '全部' && entry.area?.campus !== filters.campus) return false
    return !entry.shop.isClosed && !entry.item.isOffShelf
  })
})

const diceResult = computed(() => dicePool.value.find((entry) => entry.item.id === diceState.resultItemId))

function areaScore(areaId: string) {
  const scoredShops = food.getShopsByArea(areaId).filter((shop) => shop.comments.length > 0)
  if (scoredShops.length === 0) return 0
  const total = scoredShops.reduce((sum, shop) => sum + food.averageScore(shop), 0)
  return Math.round((total / scoredShops.length) * 10) / 10
}

function goShop(shopId: string) {
  router.push(`/shop/${shopId}`)
}

async function submitToday() {
  if (!auth.requireLogin()) return
  if (!todayForm.areaId) {
    window.$message.warning('请选择今天在哪个区域吃')
    return
  }
  if (!todayForm.shopId.trim() || !todayForm.itemId.trim()) {
    window.$message.warning('请选择店面和菜品')
    return
  }
  if (isNewTodayItem.value && !todayForm.newItemPrice.trim()) {
    window.$message.warning('新菜品需要填写价格')
    return
  }
  if (todayForm.syncComment && !todayForm.text.trim()) {
    window.$message.warning('同步到菜品评论时需要写一句评价')
    return
  }

  let shopId = todayForm.shopId
  if (isNewTodayShop.value) {
    shopId = await food.addShop({
      areaId: todayForm.areaId,
      name: todayForm.shopId.trim()
    })
  }

  let itemId = todayForm.itemId
  if (isNewTodayItem.value || isNewTodayShop.value) {
    itemId = await food.addItem({
      shopId,
      name: todayForm.itemId.trim(),
      price: todayForm.newItemPrice.trim()
    })
  }

  const shouldSyncComment = todayForm.syncComment
  await food.addComment(shopId, {
    score: todayForm.score,
    itemId,
    text: todayForm.text.trim(),
    image: todayForm.image || undefined,
    isAnonymous: todayForm.isAnonymous,
    isMealRecord: true,
    mealSlot: todayForm.mealSlot,
    isPublicComment: shouldSyncComment
  }, auth.user.value?.nickname || auth.user.value?.email)

  todayForm.shopId = ''
  todayForm.itemId = ''
  todayForm.newItemPrice = ''
  todayForm.mealSlot = '午餐'
  todayForm.syncComment = false
  todayForm.score = 5
  todayForm.text = ''
  todayForm.image = ''
  todayForm.isAnonymous = true
  window.$message.success(shouldSyncComment ? '今天吃了什么已记录，并同步到店铺评价里了' : '今天吃了什么已记录')
  if (shouldSyncComment) router.push(`/shop/${shopId}`)
}

function pickFile() {
  return new Promise<File | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

async function pickTodayImage() {
  const file = await pickFile()
  if (!file) return
  try {
    imageUploading.value = true
    todayForm.image = await compressImageToDataUrl(file)
    window.$message.success('图片已压缩到 100KB 内')
  } catch (error) {
    window.$message.error(error instanceof Error ? error.message : '图片处理失败')
  } finally {
    imageUploading.value = false
  }
}

function rollDice() {
  if (dicePool.value.length === 0) {
    window.$message.warning('这些区域里还没有可选菜品')
    return
  }
  diceState.rolling = true
  diceState.resultItemId = ''
  window.setTimeout(() => {
    const index = Math.floor(Math.random() * dicePool.value.length)
    diceState.resultItemId = dicePool.value[index].item.id
    diceState.rolling = false
  }, 760)
}

async function askAi() {
  aiState.loading = true
  aiState.results = []
  aiState.source = ''
  try {
    const response = await fetch('/api/ai/recommend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        campus: filters.campus === '全部' ? undefined : filters.campus,
        areaIds: aiState.areaIds,
        preference: aiState.preference,
        budget: aiState.budget,
        mood: aiState.mood
      })
    })
    if (!response.ok) throw new Error('AI 推荐失败')
    const data = await response.json() as { recommendations: typeof aiState.results; source: string }
    aiState.results = data.recommendations
    aiState.source = data.source
    if (aiState.results.length === 0) {
      window.$message.warning('当前范围里还没有可推荐的菜品')
    } else {
      window.$message.success(data.source === 'workers-ai' ? 'AI 已给出推荐' : '已按现有评分给出推荐')
    }
  } catch (error) {
    window.$message.error(error instanceof Error ? error.message : 'AI 推荐失败')
  } finally {
    aiState.loading = false
  }
}
</script>

<template>
  <div class="page-container">
    <n-space vertical size="large">
      <n-card class="cover-card" content-style="padding:0;">
        <section class="cover">
          <div>
            <p>BIT Food Forum</p>
            <h1>按区域找店面，按菜品搜吃的，也记录你今天吃了什么。</h1>
          </div>
          <n-button class="hero-action" size="large" strong @click="activeTab = 'today'">
            <template #icon>
              <n-icon :component="TodayOutlined" />
            </template>
            记录今天
          </n-button>
        </section>
      </n-card>

      <n-tabs v-model:value="activeTab" type="segment" animated class="home-tabs">
        <n-tab-pane name="ai" tab="问AI">
          <n-card class="ai-card">
            <n-space vertical size="large">
              <div>
                <p class="dice-kicker">AI 问吃什么</p>
                <h2 class="ai-title">告诉我你现在想吃什么，我从校内真实店面里挑。</h2>
                <div class="muted">会自动排除关门店铺和下架菜品；AI 不可用时，会按评分和评价数兜底推荐。</div>
              </div>

              <FormField label="候选区域" example="可不选；不选时按当前校区推荐">
                <n-select v-model:value="aiState.areaIds" multiple filterable clearable :options="areaOptions" />
              </FormField>
              <FormField label="想吃什么" example="比如：热乎一点、不要太辣、想吃面、适合带走">
                <n-input v-model:value="aiState.preference" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" />
              </FormField>
              <n-grid cols="1 s:2" responsive="screen" :x-gap="12" :y-gap="12">
                <n-grid-item>
                  <FormField label="预算" example="比如：15以内、20左右、随意">
                    <n-input v-model:value="aiState.budget" />
                  </FormField>
                </n-grid-item>
                <n-grid-item>
                  <FormField label="状态" example="比如：赶时间、想坐下吃、想吃清淡">
                    <n-input v-model:value="aiState.mood" />
                  </FormField>
                </n-grid-item>
              </n-grid>
              <n-button type="primary" size="large" block :loading="aiState.loading" @click="askAi">问问 AI 今天吃什么</n-button>

              <n-space v-if="aiState.results.length" vertical>
                <n-tag :type="aiState.source === 'workers-ai' ? 'success' : 'warning'" round>
                  {{ aiState.source === 'workers-ai' ? 'Cloudflare Workers AI 推荐' : '评分规则推荐' }}
                </n-tag>
                <n-card v-for="entry in aiState.results" :key="entry.itemId" class="result-card" @click="goShop(entry.shopId)">
                  <n-space vertical>
                    <n-space justify="space-between" align="start">
                      <div>
                        <h3 class="ai-result-title">{{ entry.itemName }}</h3>
                        <div class="muted">{{ entry.shopName }} · {{ entry.areaName }} · {{ entry.campus }}</div>
                      </div>
                      <div class="rank-score">{{ entry.score ? entry.score.toFixed(1) : '新' }}</div>
                    </n-space>
                    <div>{{ entry.reason }}</div>
                    <n-space>
                      <n-tag round>{{ entry.price || '价格待补' }}</n-tag>
                      <n-tag round type="info">{{ entry.commentCount }} 评</n-tag>
                    </n-space>
                  </n-space>
                </n-card>
              </n-space>
            </n-space>
          </n-card>
        </n-tab-pane>

        <n-tab-pane name="dice" tab="骰一下">
          <n-card class="dice-card" content-style="padding: 0;">
            <section class="dice-panel">
              <div class="dice-top">
                <div>
                  <p class="dice-kicker">今天吃什么</p>
                  <h2>选几个食堂区，让骰子替你做决定。</h2>
                </div>
                <button class="dice-button" :class="{ rolling: diceState.rolling }" @click="rollDice">
                  <n-icon :component="CasinoOutlined" />
                </button>
              </div>

              <FormField label="候选区域" example="不选时按当前校区范围随机，也可以手动选几个区域">
                <n-select v-model:value="diceState.areaIds" multiple filterable clearable :options="areaOptions" />
              </FormField>

              <n-space align="center" justify="space-between">
                <span class="dice-count">{{ dicePool.length }} 个可选菜品</span>
                <n-button type="primary" size="large" :loading="diceState.rolling" @click="rollDice">骰一下</n-button>
              </n-space>

              <n-card v-if="diceResult" class="dice-result" @click="goShop(diceResult.shop.id)">
                <n-space vertical>
                  <n-space justify="space-between" align="start">
                    <div>
                      <div class="dice-result-label">今天就吃</div>
                      <h3>{{ diceResult.item.name }}</h3>
                      <div class="muted">{{ diceResult.shop.name }} · {{ diceResult.area?.name }}</div>
                    </div>
                    <div class="rank-score">{{ diceResult.score.toFixed(1) }}</div>
                  </n-space>
                  <n-space>
                    <n-tag round>{{ diceResult.item.price || '价格待补' }}</n-tag>
                    <n-tag round type="info">{{ diceResult.commentCount }} 评</n-tag>
                    <n-tag round>{{ diceResult.area?.campus }}</n-tag>
                  </n-space>
                </n-space>
              </n-card>
              <n-empty v-else class="dice-empty" description="还没开骰，先选几个区域试试手气。" />
            </section>
          </n-card>
        </n-tab-pane>

        <n-tab-pane name="areas" tab="区域">
          <n-space vertical size="large">
            <n-card>
              <n-space vertical>
                <n-radio-group v-model:value="filters.campus">
                  <n-grid :cols="3" :x-gap="8">
                    <n-grid-item>
                      <n-radio-button value="全部" class="full-radio">全部</n-radio-button>
                    </n-grid-item>
                    <n-grid-item>
                      <n-radio-button value="良乡校区" class="full-radio">良乡</n-radio-button>
                    </n-grid-item>
                    <n-grid-item>
                      <n-radio-button value="中关村校区" class="full-radio">中关村</n-radio-button>
                    </n-grid-item>
                  </n-grid>
                </n-radio-group>
              </n-space>
            </n-card>

            <n-grid :cols="1" :x-gap="14" :y-gap="14">
              <n-grid-item v-for="area in visibleAreas" :key="area.id">
                <n-card class="shop-card" @click="router.push(`/area/${area.id}`)">
                  <n-space vertical>
                    <n-space align="center">
                      <n-tag type="info" round>{{ area.campus }}</n-tag>
                      <n-tag round>{{ area.kind }}</n-tag>
                    </n-space>
                    <div>
                      <n-h2 style="margin: 4px 0;">{{ area.name }}</n-h2>
                      <n-text>{{ area.description }}</n-text>
                    </div>
                    <n-space justify="space-between" align="center">
                      <span class="muted">{{ food.getShopsByArea(area.id).length }} 个店面</span>
                      <span class="score-text">均分 {{ areaScore(area.id).toFixed(1) }}</span>
                    </n-space>
                  </n-space>
                </n-card>
              </n-grid-item>
            </n-grid>
            <n-empty v-if="visibleAreas.length === 0" description="还没有匹配的区域" />
          </n-space>
        </n-tab-pane>

        <n-tab-pane name="search" tab="搜索">
          <n-space vertical size="large">
            <n-card>
              <FormField label="搜索店面或菜品" example="麻辣香锅、煎饼、北食堂、甘棠">
                <n-input v-model:value="filters.keyword" clearable autofocus>
                  <template #prefix>
                    <n-icon :component="SearchOutlined" />
                  </template>
                </n-input>
              </FormField>
            </n-card>

            <n-card title="店面结果">
              <n-space v-if="searchResults.shops.length" vertical>
                <n-card v-for="entry in searchResults.shops" :key="entry.shop.id" size="small" class="result-card" @click="goShop(entry.shop.id)">
                  <n-space vertical>
                    <n-space justify="space-between" align="start">
                      <div>
                        <strong>{{ entry.shop.name }}</strong>
                        <div class="muted">{{ entry.area?.campus }} · {{ entry.area?.name }}</div>
                      </div>
                      <n-tag v-if="entry.shop.isClosed" type="error" size="small">已关门</n-tag>
                    </n-space>
                    <n-space justify="space-between" align="center">
                      <span class="score-text">{{ entry.score.toFixed(1) }}</span>
                      <span class="muted">{{ entry.commentCount }} 条评价 · {{ entry.shop.items.length }} 个菜品</span>
                    </n-space>
                  </n-space>
                </n-card>
              </n-space>
              <n-empty v-else description="输入关键词后会显示店面结果" />
            </n-card>

            <n-card title="菜品结果">
              <n-space v-if="searchResults.items.length" vertical>
                <n-card v-for="entry in searchResults.items" :key="entry.item.id" size="small" class="result-card" @click="goShop(entry.shop.id)">
                  <n-space vertical>
                    <n-space justify="space-between" align="start">
                      <div>
                        <strong>{{ entry.item.name }}</strong>
                        <div class="muted">{{ entry.shop.name }} · {{ entry.area?.name }}</div>
                      </div>
                      <n-tag v-if="entry.item.isOffShelf" type="error" size="small">已下架</n-tag>
                    </n-space>
                    <n-space justify="space-between" align="center">
                      <span class="score-text">{{ entry.score.toFixed(1) }}</span>
                      <span class="muted">{{ entry.item.price || '价格待补' }} · {{ entry.commentCount }} 评</span>
                    </n-space>
                  </n-space>
                </n-card>
              </n-space>
              <n-empty v-else :description="showSearchEmpty ? '没有找到匹配菜品' : '输入关键词后会显示菜品结果'" />
            </n-card>

            <n-card title="菜品评分榜">
              <n-space vertical>
                <n-card v-for="(entry, index) in itemScoreRank" :key="entry.item.id" size="small" class="rank-card" @click="goShop(entry.shop.id)">
                  <n-space justify="space-between" align="center" :wrap="false">
                    <n-space align="center" :wrap="false">
                      <span class="rank-no">{{ index + 1 }}</span>
                      <div>
                        <strong>{{ entry.item.name }}</strong>
                        <div class="muted">{{ entry.shop.name }} · {{ entry.area?.name }}</div>
                      </div>
                    </n-space>
                    <div class="rank-score">{{ entry.score.toFixed(1) }}</div>
                  </n-space>
                </n-card>
              </n-space>
            </n-card>
          </n-space>
        </n-tab-pane>

        <n-tab-pane name="ranks" tab="榜单">
          <n-space vertical size="large">
            <n-card title="店铺评分榜">
              <n-space vertical>
                <n-card v-for="(entry, index) in shopScoreRank" :key="entry.shop.id" size="small" class="rank-card" @click="goShop(entry.shop.id)">
                  <n-space justify="space-between" align="center" :wrap="false">
                    <n-space align="center" :wrap="false">
                      <span class="rank-no">{{ index + 1 }}</span>
                      <div>
                        <strong>{{ entry.shop.name }}</strong>
                        <div class="muted">{{ entry.area?.campus }} · {{ entry.area?.name }}</div>
                      </div>
                    </n-space>
                    <div class="rank-score">{{ entry.score.toFixed(1) }}</div>
                  </n-space>
                </n-card>
              </n-space>
            </n-card>

            <n-card title="店铺评价数榜">
              <n-space vertical>
                <n-card v-for="(entry, index) in shopHeatRank" :key="entry.shop.id" size="small" class="rank-card" @click="goShop(entry.shop.id)">
                  <n-space justify="space-between" align="center" :wrap="false">
                    <n-space align="center" :wrap="false">
                      <span class="rank-no">{{ index + 1 }}</span>
                      <div>
                        <strong>{{ entry.shop.name }}</strong>
                        <div class="muted">{{ entry.area?.name }} · {{ entry.commentCount }} 条评价</div>
                      </div>
                    </n-space>
                    <div class="rank-score">{{ entry.score.toFixed(1) }}</div>
                  </n-space>
                </n-card>
              </n-space>
            </n-card>

            <n-card title="菜品评价数榜">
              <n-space vertical>
                <n-card v-for="(entry, index) in itemHeatRank" :key="entry.item.id" size="small" class="rank-card" @click="goShop(entry.shop.id)">
                  <n-space justify="space-between" align="center" :wrap="false">
                    <n-space align="center" :wrap="false">
                      <span class="rank-no">{{ index + 1 }}</span>
                      <div>
                        <strong>{{ entry.item.name }}</strong>
                        <div class="muted">{{ entry.shop.name }} · {{ entry.commentCount }} 评</div>
                      </div>
                    </n-space>
                    <div class="rank-score">{{ entry.score.toFixed(1) }}</div>
                  </n-space>
                </n-card>
              </n-space>
            </n-card>
          </n-space>
        </n-tab-pane>

        <n-tab-pane name="today" tab="今天">
          <n-card title="今天吃了什么">
            <n-space vertical>
              <FormField label="今天在哪吃" example="先选食堂区、宿舍楼下或商业区">
                <n-select v-model:value="todayForm.areaId" filterable clearable :options="preferredAreaOptions" />
              </FormField>
              <FormField label="店面" example="选择今天吃的窗口或店铺">
                <n-select v-model:value="todayForm.shopId" filterable clearable tag :options="todayShopOptions" />
              </FormField>
              <FormField label="菜品" example="选择具体吃了什么">
                <n-select v-model:value="todayForm.itemId" filterable clearable tag :options="todayItemOptions" :disabled="!todayForm.shopId" />
              </FormField>
              <FormField v-if="isNewTodayShop" label="新店铺" example="提交后会加入这个区域的店铺列表">
                <n-alert type="info" :show-icon="false">“{{ todayForm.shopId }}” 会作为新店铺添加。</n-alert>
              </FormField>
              <FormField v-if="isNewTodayItem" label="新菜品价格" example="12、约15、16+、按串计">
                <n-input v-model:value="todayForm.newItemPrice" />
              </FormField>
              <FormField label="餐次" example="早餐、午餐、晚餐，也可以归到其他">
                <n-radio-group v-model:value="todayForm.mealSlot">
                  <n-grid :cols="4" :x-gap="8">
                    <n-grid-item><n-radio-button value="早餐" class="full-radio">早餐</n-radio-button></n-grid-item>
                    <n-grid-item><n-radio-button value="午餐" class="full-radio">午餐</n-radio-button></n-grid-item>
                    <n-grid-item><n-radio-button value="晚餐" class="full-radio">晚餐</n-radio-button></n-grid-item>
                    <n-grid-item><n-radio-button value="其他" class="full-radio">其他</n-radio-button></n-grid-item>
                  </n-grid>
                </n-radio-group>
              </FormField>
              <FormField label="同步到菜品评论" example="打开后才需要评分、评价、匿名和图片">
                <n-checkbox v-model:checked="todayForm.syncComment">同步到店铺公开评价</n-checkbox>
              </FormField>
              <template v-if="todayForm.syncComment">
                <FormField label="评分" example="一般就 3 分，好吃可以 4.5 或 5 分">
                  <n-rate v-model:value="todayForm.score" allow-half />
                </FormField>
                <FormField label="评价" example="口味、价格、排队、份量，写一句就行">
                  <n-input v-model:value="todayForm.text" type="textarea" :autosize="{ minRows: 3 }" maxlength="500" show-count />
                </FormField>
                <FormField label="图片" example="可以拍一张今天吃的，系统会压缩到 100KB 内">
                  <n-space vertical>
                    <n-image v-if="todayForm.image" :src="todayForm.image" width="120" object-fit="cover" />
                    <n-space>
                      <n-button :loading="imageUploading" @click="pickTodayImage">{{ todayForm.image ? '更换图片' : '上传图片' }}</n-button>
                      <n-button v-if="todayForm.image" quaternary @click="todayForm.image = ''">移除</n-button>
                    </n-space>
                  </n-space>
                </FormField>
                <FormField label="署名方式" example="默认匿名；也可以显示昵称">
                  <n-radio-group v-model:value="todayForm.isAnonymous">
                    <n-grid :cols="2" :x-gap="8">
                      <n-grid-item><n-radio-button :value="true" class="full-radio">匿名</n-radio-button></n-grid-item>
                      <n-grid-item><n-radio-button :value="false" class="full-radio">显示昵称</n-radio-button></n-grid-item>
                    </n-grid>
                  </n-radio-group>
                </FormField>
              </template>
              <n-space justify="center">
                <n-button class="today-submit" type="primary" size="large" @click="submitToday">记录今天</n-button>
              </n-space>
            </n-space>
          </n-card>
        </n-tab-pane>
      </n-tabs>
    </n-space>
  </div>
</template>

<style scoped>
.hero-action {
  min-width: 132px;
  color: #176049;
  background: #fff;
}

.home-tabs :deep(.n-tabs-rail) {
  position: sticky;
  top: 62px;
  z-index: 4;
}

.full-radio {
  width: 100%;
  text-align: center;
}

.result-card,
.rank-card {
  cursor: pointer;
}

.result-card:hover,
.rank-card:hover {
  border-color: #18a058;
}

.rank-no {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(32, 131, 95, 0.12);
  color: var(--primary-color);
  font-weight: 800;
  flex: 0 0 auto;
}

.rank-score {
  min-width: 46px;
  text-align: right;
  color: var(--primary-color);
  font-size: 18px;
  font-weight: 800;
}

.ai-card {
  border-color: rgba(176, 31, 36, 0.22);
}

.ai-title {
  margin: 2px 0 6px;
  font-size: 22px;
  line-height: 1.35;
}

.ai-result-title {
  margin: 0 0 4px;
  color: #b01f24;
  font-size: 20px;
}

.today-submit {
  min-width: 150px;
}

.dice-card {
  overflow: hidden;
  border: 0;
}

.dice-panel {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  background:
    radial-gradient(circle at 12% 10%, rgba(250, 176, 5, 0.22), transparent 30%),
    radial-gradient(circle at 88% 18%, rgba(24, 160, 88, 0.18), transparent 28%),
    linear-gradient(135deg, var(--card-color), var(--body-color));
}

.dice-top {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

.dice-kicker {
  margin: 0 0 6px;
  color: var(--primary-color);
  font-weight: 800;
}

.dice-top h2 {
  margin: 0;
  color: var(--text-color-1);
  font-size: 26px;
  line-height: 1.18;
}

.dice-button {
  width: 76px;
  height: 76px;
  border: 0;
  border-radius: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 42px;
  background: linear-gradient(135deg, #ff7a59, #ffb43b);
  box-shadow: 0 14px 30px rgba(255, 122, 89, 0.32);
  cursor: pointer;
}

.dice-button.rolling {
  animation: dice-roll 0.72s ease-in-out infinite;
}

.dice-count {
  color: var(--text-color-1);
  font-weight: 800;
}

.dice-result {
  cursor: pointer;
  border-color: rgba(32, 131, 95, 0.28);
  background: var(--card-color);
}

.dice-result h3 {
  margin: 2px 0 4px;
  color: var(--text-color-1);
  font-size: 24px;
}

.dice-result-label {
  color: #ff7a59;
  font-weight: 800;
}

.dice-empty {
  padding: 10px 0;
}

@keyframes dice-roll {
  0% {
    transform: rotate(0deg) scale(1);
  }
  45% {
    transform: rotate(160deg) scale(1.12);
  }
  100% {
    transform: rotate(360deg) scale(1);
  }
}

@media (max-width: 680px) {
  .home-tabs :deep(.n-tabs-tab) {
    padding-left: 10px;
    padding-right: 10px;
  }

  .dice-panel {
    padding: 18px;
  }

  .dice-button {
    width: 62px;
    height: 62px;
    border-radius: 18px;
    font-size: 34px;
  }

  .dice-top h2 {
    font-size: 22px;
  }
}

</style>
