<script setup lang="ts">
import { computed, h, reactive, ref, watchEffect } from 'vue'
import type { DataTableColumns } from 'naive-ui'
import { useRouter } from 'vue-router'
import { useDialog } from 'naive-ui'
import { useAuthStore } from '@/store/auth'
import { useFoodStore, type Campus } from '@/store/food'
import FormField from '@/components/FormField.vue'

type MealCell = {
  label: string
  shopId: string
}

type MealRow = {
  date: string
  早餐: MealCell[]
  午餐: MealCell[]
  晚餐: MealCell[]
  其他: MealCell[]
}

const router = useRouter()
const dialog = useDialog()
const auth = useAuthStore()
const food = useFoodStore()
const form = reactive({
  nickname: '',
  defaultCampus: '良乡校区' as Campus
})
const detailView = ref<'home' | 'shops' | 'items' | 'meals' | 'comments'>('home')
const mealVisibleDays = ref(7)

const myShops = computed(() => {
  const userId = auth.user.value?.id
  if (!userId) return []
  return food.shops.value.filter((shop) => shop.creatorUserId === userId)
})

const myItems = computed(() => {
  const userId = auth.user.value?.id
  if (!userId) return []
  return food.shops.value.flatMap((shop) =>
    shop.items
      .filter((item) => item.creatorUserId === userId)
      .map((item) => ({
        ...item,
        shopId: shop.id,
        shopName: shop.name,
        areaName: food.getArea(shop.areaId)?.name ?? ''
      }))
  )
})

const myComments = computed(() => {
  const userId = auth.user.value?.id
  if (!userId) return []
  return food.shops.value.flatMap((shop) =>
    shop.comments
      .filter((comment) => comment.userId === userId)
      .map((comment) => ({
        ...comment,
        shopId: shop.id,
        shopName: shop.name,
        itemName: comment.itemId ? food.getItem(comment.itemId)?.name : ''
      }))
  )
})

const myMealRecords = computed(() => myComments.value.filter((comment) => comment.isMealRecord))

const mealStats = computed(() => {
  const records = myMealRecords.value
  const average = records.length
    ? Math.round((records.reduce((sum, comment) => sum + comment.score, 0) / records.length) * 10) / 10
    : 0
  const shopCounts = new Map<string, number>()
  const itemCounts = new Map<string, number>()

  for (const comment of records) {
    shopCounts.set(comment.shopName, (shopCounts.get(comment.shopName) ?? 0) + 1)
    if (comment.itemName) itemCounts.set(comment.itemName, (itemCounts.get(comment.itemName) ?? 0) + 1)
  }

  const favoriteShop = [...shopCounts.entries()].sort((a, b) => b[1] - a[1])[0]
  const favoriteItem = [...itemCounts.entries()].sort((a, b) => b[1] - a[1])[0]

  return {
    total: records.length,
    average,
    favoriteShop: favoriteShop ? `${favoriteShop[0]} · ${favoriteShop[1]} 次` : '还没有',
    favoriteItem: favoriteItem ? `${favoriteItem[0]} · ${favoriteItem[1]} 次` : '还没有',
    recent: records.slice().sort((a, b) => String(b.createTime).localeCompare(String(a.createTime))).slice(0, 12)
  }
})

const mealRows = computed(() => {
  const byDate = new Map<string, MealRow>()
  const sorted = myMealRecords.value.slice().sort((a, b) => String(b.createTime).localeCompare(String(a.createTime)))

  for (const record of sorted) {
    const date = String(record.createTime).slice(0, 10)
    const slot = (['早餐', '午餐', '晚餐', '其他'].includes(String(record.mealSlot)) ? record.mealSlot : '午餐') as '早餐' | '午餐' | '晚餐' | '其他'
    const row = byDate.get(date) ?? { date, 早餐: [], 午餐: [], 晚餐: [], 其他: [] }
    const itemText = record.itemName || '未选菜品'
    row[slot].push({
      label: `${itemText} @ ${record.shopName} (${record.score.toFixed(1)})`,
      shopId: record.shopId
    })
    byDate.set(date, row)
  }

  return [...byDate.values()]
})

const visibleMealRows = computed(() => mealRows.value.slice(0, mealVisibleDays.value))

function renderMealCell(row: MealRow, key: '早餐' | '午餐' | '晚餐' | '其他') {
  const meals = row[key]
  if (meals.length === 0) return h('span', { class: 'meal-empty' }, '未记录')
  return h('div', { class: 'meal-cell-list' }, meals.map((meal) =>
    h('button', {
      class: 'meal-cell-item',
      onClick: (event: MouseEvent) => {
        event.stopPropagation()
        goShop(meal.shopId)
      }
    }, meal.label)
  ))
}

const mealColumns: DataTableColumns<MealRow> = [
  { title: '日期', key: 'date', width: 110 },
  { title: '早餐', key: '早餐', minWidth: 170, render: (row) => renderMealCell(row, '早餐') },
  { title: '午餐', key: '午餐', minWidth: 170, render: (row) => renderMealCell(row, '午餐') },
  { title: '晚餐', key: '晚餐', minWidth: 170, render: (row) => renderMealCell(row, '晚餐') },
  { title: '其他', key: '其他', minWidth: 170, render: (row) => renderMealCell(row, '其他') }
]

watchEffect(() => {
  form.nickname = auth.user.value?.nickname ?? ''
  form.defaultCampus = auth.user.value?.defaultCampus ?? '良乡校区'
})

async function submit() {
  const nickname = form.nickname.trim()
  if (!nickname) {
    window.$message.warning('昵称不能为空')
    return
  }
  if (nickname.length > 20) {
    window.$message.warning('昵称最多 20 个字')
    return
  }

  try {
    await auth.updateProfile(nickname, false, form.defaultCampus)
    window.$message.success('账号设置已保存')
  } catch {
    window.$message.error('保存失败，请稍后再试')
  }
}

function goShop(shopId: string) {
  router.push(`/shop/${shopId}`)
}

function openDetail(view: 'shops' | 'items' | 'meals' | 'comments') {
  detailView.value = view
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function backHome() {
  detailView.value = 'home'
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function confirmDeleteShop(event: MouseEvent, shopId: string, name: string) {
  event.stopPropagation()
  dialog.warning({
    title: '确认删除店面？',
    content: `会删除“${name}”和它下面的菜品、评价。这个操作不能撤销。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await food.deleteShop(shopId)
      window.$message.success('店面已删除')
    }
  })
}

function confirmDeleteItem(event: MouseEvent, itemId: string, name: string) {
  event.stopPropagation()
  dialog.warning({
    title: '确认删除菜品？',
    content: `会删除“${name}”，已有评价会保留但不再引用这个菜品。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await food.deleteItem(itemId)
      window.$message.success('菜品已删除')
    }
  })
}

function confirmDeleteComment(event: MouseEvent, commentId: number) {
  event.stopPropagation()
  dialog.warning({
    title: '确认删除评论？',
    content: '这条评分留言会被删除，操作不能撤销。',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await food.deleteComment(commentId)
      window.$message.success('评论已删除')
    }
  })
}
</script>

<template>
  <div class="page-container">
    <n-result v-if="!auth.user.value" status="403" title="请先登录" description="登录后可以查看自己的店面、评价和吃饭记录。">
      <template #footer>
        <n-button type="primary" @click="auth.authModal.value = true">登录</n-button>
      </template>
    </n-result>

    <n-space v-else vertical size="large">
      <n-card>
        <n-space vertical>
          <n-space justify="space-between" align="center">
            <div>
              <n-h1 style="margin: 0;">{{ detailView === 'home' ? '个人中心' : detailView === 'shops' ? '我发布的店面' : detailView === 'items' ? '我添加的菜品' : detailView === 'meals' ? '最近吃了什么' : '我写过的评论' }}</n-h1>
              <div class="muted">{{ auth.user.value.email }}</div>
            </div>
            <n-button v-if="detailView !== 'home'" @click="backHome">返回</n-button>
          </n-space>
        </n-space>
      </n-card>

      <template v-if="detailView === 'home'">
      <n-card title="账号设置">
        <n-space vertical>
          <FormField label="昵称">
            <n-input v-model:value="form.nickname" maxlength="20" show-count @keyup.enter="submit" />
          </FormField>
          <FormField label="默认校区" example="首页区域、搜索和榜单会优先按这个校区展示">
            <n-radio-group v-model:value="form.defaultCampus">
              <n-grid :cols="2" :x-gap="8">
                <n-grid-item>
                  <n-radio-button value="良乡校区" class="full-radio">良乡</n-radio-button>
                </n-grid-item>
                <n-grid-item>
                  <n-radio-button value="中关村校区" class="full-radio">中关村</n-radio-button>
                </n-grid-item>
              </n-grid>
            </n-radio-group>
          </FormField>
          <n-button type="primary" block :loading="auth.loading.value" @click="submit">保存设置</n-button>
        </n-space>
      </n-card>

      <n-card title="我的吃饭统计">
        <n-grid :cols="2" :x-gap="10" :y-gap="10">
          <n-grid-item>
            <n-statistic label="记录次数" :value="mealStats.total" />
          </n-grid-item>
          <n-grid-item>
            <n-statistic label="平均评分" :value="mealStats.average.toFixed(1)" />
          </n-grid-item>
        </n-grid>
        <n-space vertical style="margin-top: 12px;">
          <div class="muted">常去店面：{{ mealStats.favoriteShop }}</div>
          <div class="muted">常吃菜品：{{ mealStats.favoriteItem }}</div>
        </n-space>
      </n-card>

      <n-card title="早中晚饭表">
        <n-data-table
          v-if="visibleMealRows.length"
          :columns="mealColumns"
          :data="visibleMealRows"
          :scroll-x="790"
        />
        <n-empty v-else description="还没有早中晚饭记录" />
        <n-space v-if="mealRows.length > visibleMealRows.length" justify="center" style="margin-top: 12px;">
          <n-button @click="mealVisibleDays += 7">显示更多 7 天</n-button>
        </n-space>
      </n-card>

      <n-card title="更多记录">
        <n-grid :cols="1" :y-gap="10">
          <n-grid-item>
            <n-card size="small" class="profile-list-card" @click="openDetail('shops')">
              <n-space justify="space-between" align="center">
                <strong>我发布的店面</strong>
                <span class="muted">{{ myShops.length }} 个</span>
              </n-space>
            </n-card>
          </n-grid-item>
          <n-grid-item>
            <n-card size="small" class="profile-list-card" @click="openDetail('items')">
              <n-space justify="space-between" align="center">
                <strong>我添加的菜品</strong>
                <span class="muted">{{ myItems.length }} 个</span>
              </n-space>
            </n-card>
          </n-grid-item>
          <n-grid-item>
            <n-card size="small" class="profile-list-card" @click="openDetail('meals')">
              <n-space justify="space-between" align="center">
                <strong>最近吃了什么</strong>
                <span class="muted">{{ myMealRecords.length }} 条</span>
              </n-space>
            </n-card>
          </n-grid-item>
          <n-grid-item>
            <n-card size="small" class="profile-list-card" @click="openDetail('comments')">
              <n-space justify="space-between" align="center">
                <strong>我写过的评论</strong>
                <span class="muted">{{ myComments.length }} 条</span>
              </n-space>
            </n-card>
          </n-grid-item>
        </n-grid>
      </n-card>
      </template>

      <template v-if="detailView === 'shops'">
      <n-card title="我发布的店面">
        <n-space v-if="myShops.length" vertical>
          <n-card v-for="shop in myShops" :key="shop.id" size="small" class="profile-list-card" @click="goShop(shop.id)">
            <n-space justify="space-between" align="center">
              <div>
                <strong>{{ shop.name }}</strong>
                <div class="muted">{{ food.getArea(shop.areaId)?.name }} · {{ shop.items.length }} 个菜品 · {{ shop.comments.length }} 条评价</div>
              </div>
              <n-space align="center">
                <n-tag v-if="shop.isClosed" type="error" size="small">已关门</n-tag>
                <button type="button" class="danger-dot" aria-label="删除店面" @click="(event: MouseEvent) => confirmDeleteShop(event, shop.id, shop.name)">×</button>
              </n-space>
            </n-space>
          </n-card>
        </n-space>
        <n-empty v-else description="还没有发布过店面" />
      </n-card>
      </template>

      <template v-if="detailView === 'items'">
      <n-card title="我添加的菜品">
        <n-space v-if="myItems.length" vertical>
          <n-card v-for="item in myItems" :key="item.id" size="small" class="profile-list-card" @click="goShop(item.shopId)">
            <n-space justify="space-between" align="center">
              <div>
                <strong>{{ item.name }}</strong>
                <div class="muted">{{ item.shopName }} · {{ item.areaName }} · 价格 {{ item.price || '待补' }}</div>
              </div>
              <n-space align="center">
                <n-tag v-if="item.isOffShelf" type="error" size="small">已下架</n-tag>
                <button type="button" class="danger-dot" aria-label="删除菜品" @click="(event: MouseEvent) => confirmDeleteItem(event, item.id, item.name)">×</button>
              </n-space>
            </n-space>
          </n-card>
        </n-space>
        <n-empty v-else description="还没有添加过菜品" />
      </n-card>
      </template>

      <template v-if="detailView === 'meals'">
      <n-card title="最近吃了什么">
        <n-space v-if="mealStats.recent.length" vertical>
          <n-card v-for="comment in mealStats.recent" :key="comment.id" size="small" class="profile-list-card" @click="goShop(comment.shopId)">
            <n-space vertical>
              <n-space justify="space-between" align="center">
                <strong>{{ comment.shopName }}</strong>
                <n-tag size="small" type="success" round>评分 {{ comment.score.toFixed(1) }}</n-tag>
              </n-space>
              <n-tag v-if="comment.itemName" size="small" round>{{ comment.itemName }}</n-tag>
              <n-image v-if="comment.image" :src="comment.image" width="120" object-fit="cover" />
              <n-text>{{ comment.text }}</n-text>
              <span class="muted">{{ comment.createTime }}</span>
            </n-space>
          </n-card>
        </n-space>
        <n-empty v-else description="还没有记录吃过什么" />
      </n-card>
      </template>

      <template v-if="detailView === 'comments'">
      <n-card title="我写过的评论">
        <n-space v-if="myComments.length" vertical>
          <n-card v-for="comment in myComments" :key="comment.id" size="small" class="profile-list-card" @click="goShop(comment.shopId)">
            <n-space vertical>
              <n-space justify="space-between" align="center">
                <strong>{{ comment.shopName }}</strong>
                <n-space align="center">
                  <n-tag size="small" type="success" round>评分 {{ comment.score.toFixed(1) }}</n-tag>
                  <button type="button" class="danger-dot" aria-label="删除评论" @click="(event: MouseEvent) => confirmDeleteComment(event, comment.id)">×</button>
                </n-space>
              </n-space>
              <n-space>
                <n-tag v-if="comment.itemName" size="small" round>{{ comment.itemName }}</n-tag>
                <n-tag v-if="comment.isMealRecord" size="small" type="success" round>{{ comment.mealSlot || '吃饭记录' }}</n-tag>
              </n-space>
              <n-text>{{ comment.text }}</n-text>
              <span class="muted">{{ comment.createTime }}</span>
            </n-space>
          </n-card>
        </n-space>
        <n-empty v-else description="还没有写过评论" />
      </n-card>
      </template>
    </n-space>
  </div>
</template>

<style scoped>
.profile-list-card {
  cursor: pointer;
}

.profile-list-card:hover {
  border-color: #18a058;
}

.full-radio {
  width: 100%;
  text-align: center;
}

.meal-cell-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}

.meal-cell-item {
  padding: 0;
  border: 0;
  color: var(--primary-color);
  background: transparent;
  line-height: 1.45;
  text-align: left;
  cursor: pointer;
}

.meal-cell-item:hover {
  text-decoration: underline;
}

.meal-empty {
  display: inline;
  color: var(--text-color-3);
  background: transparent;
}

.danger-dot {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  min-width: 20px;
  padding: 0;
  border: 1px solid rgba(208, 48, 80, 0.28);
  border-radius: 999px;
  color: #d03050;
  background: rgba(208, 48, 80, 0.08);
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
}

.danger-dot:hover {
  background: rgba(208, 48, 80, 0.14);
}
</style>
