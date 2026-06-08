<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/store/auth'
import { useFoodStore } from '@/store/food'
import FormField from '@/components/FormField.vue'

const router = useRouter()
const auth = useAuthStore()
const food = useFoodStore()
const form = reactive({ nickname: '' })

const myShops = computed(() => {
  const userId = auth.user.value?.id
  if (!userId) return []
  return food.shops.value.filter((shop) => shop.creatorUserId === userId)
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

const mealStats = computed(() => {
  const comments = myComments.value
  const average = comments.length
    ? Math.round((comments.reduce((sum, comment) => sum + comment.score, 0) / comments.length) * 10) / 10
    : 0
  const shopCounts = new Map<string, number>()
  const itemCounts = new Map<string, number>()

  for (const comment of comments) {
    shopCounts.set(comment.shopName, (shopCounts.get(comment.shopName) ?? 0) + 1)
    if (comment.itemName) itemCounts.set(comment.itemName, (itemCounts.get(comment.itemName) ?? 0) + 1)
  }

  const favoriteShop = [...shopCounts.entries()].sort((a, b) => b[1] - a[1])[0]
  const favoriteItem = [...itemCounts.entries()].sort((a, b) => b[1] - a[1])[0]

  return {
    total: comments.length,
    average,
    favoriteShop: favoriteShop ? `${favoriteShop[0]} · ${favoriteShop[1]} 次` : '还没有',
    favoriteItem: favoriteItem ? `${favoriteItem[0]} · ${favoriteItem[1]} 次` : '还没有',
    recent: comments.slice().sort((a, b) => String(b.createTime).localeCompare(String(a.createTime))).slice(0, 8)
  }
})

watch(
  () => auth.profileModal.value,
  (show) => {
    if (show) form.nickname = auth.user.value?.nickname ?? ''
  }
)

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
    await auth.updateProfile(nickname)
    window.$message.success('昵称已更新')
  } catch {
    window.$message.error('保存失败，请稍后再试')
  }
}

function goShop(shopId: string) {
  auth.profileModal.value = false
  router.push(`/shop/${shopId}`)
}
</script>

<template>
  <n-modal v-model:show="auth.profileModal.value" preset="card" title="个人中心" style="width: min(94vw, 620px);">
    <n-space vertical size="large">
      <n-card size="small" title="账号设置">
        <n-space vertical>
          <FormField label="邮箱">
            <n-input :value="auth.user.value?.email" disabled />
          </FormField>
          <FormField label="昵称">
            <n-input v-model:value="form.nickname" maxlength="20" show-count @keyup.enter="submit" />
          </FormField>
          <n-button type="primary" block :loading="auth.loading.value" @click="submit">保存昵称</n-button>
        </n-space>
      </n-card>

      <n-card size="small" title="我的吃饭统计">
        <n-grid :cols="2" :x-gap="8" :y-gap="8" responsive="screen">
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

      <n-card size="small" title="我发布的店面">
        <n-space v-if="myShops.length" vertical>
          <n-card v-for="shop in myShops" :key="shop.id" size="small" class="profile-list-card" @click="goShop(shop.id)">
            <n-space justify="space-between" align="center">
              <div>
                <strong>{{ shop.name }}</strong>
                <div class="muted">{{ food.getArea(shop.areaId)?.name }} · {{ shop.items.length }} 个菜品 · {{ shop.comments.length }} 条评价</div>
              </div>
              <n-tag v-if="shop.isClosed" type="error" size="small">已关门</n-tag>
            </n-space>
          </n-card>
        </n-space>
        <n-empty v-else description="还没有发布过店面" />
      </n-card>

      <n-card size="small" title="最近吃了什么">
        <n-space v-if="mealStats.recent.length" vertical>
          <n-card v-for="comment in mealStats.recent" :key="comment.id" size="small" class="profile-list-card" @click="goShop(comment.shopId)">
            <n-space vertical>
              <n-space justify="space-between" align="center">
                <strong>{{ comment.shopName }}</strong>
                <span class="score-text">{{ comment.score.toFixed(1) }}</span>
              </n-space>
              <n-tag v-if="comment.itemName" size="small" round>{{ comment.itemName }}</n-tag>
              <n-text>{{ comment.text }}</n-text>
              <span class="muted">{{ comment.createTime }}</span>
            </n-space>
          </n-card>
        </n-space>
        <n-empty v-else description="还没有记录吃过什么" />
      </n-card>
    </n-space>
  </n-modal>
</template>

<style scoped>
.profile-list-card {
  cursor: pointer;
}

.profile-list-card:hover {
  border-color: #18a058;
}
</style>
