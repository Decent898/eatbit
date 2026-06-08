<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AddRound from '@vicons/material/AddRound'
import { NIcon } from 'naive-ui'
import { useFoodStore } from '@/store/food'
import { useAuthStore } from '@/store/auth'
import FormField from '@/components/FormField.vue'
import { compressImageToDataUrl } from '@/utils/image'

const route = useRoute()
const router = useRouter()
const food = useFoodStore()
const auth = useAuthStore()

const area = computed(() => food.getArea(String(route.params.id)))
const shops = computed(() => {
  if (!area.value) return []
  return [...food.getShopsByArea(area.value.id)].sort((a, b) => Number(a.isClosed) - Number(b.isClosed) || food.averageScore(b) - food.averageScore(a))
})

const shopModal = ref(false)
const imageUploading = ref(false)
const shopForm = reactive({ name: '', image: '' })
const shopNameOptions = computed(() => {
  if (!area.value) return []
  return food.suggestShopNames(area.value.id, shopForm.name).map((name) => ({ label: name, value: name }))
})

async function submitShop() {
  if (!area.value || !auth.requireLogin()) return
  if (!shopForm.name.trim()) {
    window.$message.warning('店面名称不能为空')
    return
  }

  const id = await food.addShop({
    areaId: area.value.id,
    name: shopForm.name.trim(),
    image: shopForm.image || undefined
  })

  shopForm.name = ''
  shopForm.image = ''
  shopModal.value = false
  window.$message.success('店面已添加')
  router.push(`/shop/${id}`)
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

async function pickShopImage() {
  const file = await pickFile()
  if (!file) return
  try {
    imageUploading.value = true
    shopForm.image = await compressImageToDataUrl(file)
    window.$message.success('店铺图片已压缩到 100KB 内')
  } catch (error) {
    window.$message.error(error instanceof Error ? error.message : '图片处理失败')
  } finally {
    imageUploading.value = false
  }
}
</script>

<template>
  <div class="page-container">
    <n-result v-if="!area" status="404" title="没有找到这个区域" description="可能是链接过期，或者这个区域还没有被添加。">
      <template #footer>
        <n-button @click="router.push('/home')">回首页</n-button>
      </template>
    </n-result>

    <n-space v-else vertical size="large">
      <n-card>
        <n-space vertical>
          <n-space justify="space-between" align="start">
            <div>
              <n-space align="center">
                <n-tag type="info" round>{{ area.campus }}</n-tag>
                <n-tag round>{{ area.kind }}</n-tag>
              </n-space>
              <n-h1 style="margin: 10px 0 4px;">{{ area.name }}</n-h1>
              <n-text>{{ area.description }}</n-text>
            </div>
            <n-button type="primary" @click="auth.requireLogin() && (shopModal = true)">添加店面</n-button>
          </n-space>
        </n-space>
      </n-card>

      <n-card :title="`${area.name} 包含的店面`">
        <n-space vertical>
          <n-card v-for="shop in shops" :key="shop.id" size="small" class="shop-card clickable-card" @click="router.push(`/shop/${shop.id}`)">
            <n-space vertical>
              <n-space align="center">
                <span class="score-text">{{ food.averageScore(shop).toFixed(1) }}</span>
                <span class="muted">{{ shop.comments.length }} 条评价</span>
                <span class="muted">{{ shop.items.length }} 个菜品</span>
                <n-tag v-if="shop.isClosed" type="error" size="small">已关门</n-tag>
              </n-space>
              <n-h2 style="margin: 0;">{{ shop.name }}</n-h2>
              <n-text v-if="shop.description">{{ shop.description }}</n-text>
              <div v-if="shop.tags.length" class="tag-row">
                <n-tag v-for="tag in shop.tags" :key="tag" size="small" round>{{ tag }}</n-tag>
              </div>
            </n-space>
          </n-card>
          <n-empty v-if="shops.length === 0" description="这个区域还没有店面，登录后可以添加第一个。" />
        </n-space>
      </n-card>

      <n-button class="area-float" circle size="large" type="primary" @click="auth.requireLogin() && (shopModal = true)">
        <template #icon>
          <n-icon :component="AddRound" />
        </template>
      </n-button>

      <n-modal v-model:show="shopModal" preset="card" :title="`添加到 ${area.name}`" style="width: min(92vw, 520px);">
        <n-space vertical>
          <FormField label="店面名称" example="学服外煎饼摊、北三铁板窗口">
            <n-auto-complete v-model:value="shopForm.name" :options="shopNameOptions" />
          </FormField>
          <FormField label="店铺图片" example="可以先不传，之后在店铺详情里补">
            <n-space vertical>
              <n-image v-if="shopForm.image" :src="shopForm.image" width="120" object-fit="cover" />
              <n-space>
                <n-button :loading="imageUploading" @click="pickShopImage">{{ shopForm.image ? '更换图片' : '上传图片' }}</n-button>
                <n-button v-if="shopForm.image" quaternary @click="shopForm.image = ''">移除</n-button>
              </n-space>
            </n-space>
          </FormField>
          <n-button type="primary" block @click="submitShop">提交店面</n-button>
        </n-space>
      </n-modal>
    </n-space>
  </div>
</template>

<style scoped>
.area-float {
  position: fixed;
  right: 16px;
  bottom: 18px;
}

.clickable-card {
  cursor: pointer;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.clickable-card:hover {
  border-color: #18a058;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
}
</style>
