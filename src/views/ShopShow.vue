<script setup lang="ts">
import { computed, h, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NDropdown, NIcon, NTag, useDialog, type DataTableColumns } from 'naive-ui'
import MoreVertRound from '@vicons/material/MoreVertRound'
import { useFoodStore, type FoodComment, type FoodItem } from '@/store/food'
import { useAuthStore } from '@/store/auth'
import FormField from '@/components/FormField.vue'
import { compressImageToDataUrl } from '@/utils/image'

const route = useRoute()
const router = useRouter()
const dialog = useDialog()
const food = useFoodStore()
const auth = useAuthStore()

const shop = computed(() => food.getShop(String(route.params.id)))
const area = computed(() => (shop.value ? food.getArea(shop.value.areaId) : undefined))

const itemModal = ref(false)
const itemForm = reactive({ name: '', price: '' })
const shopEditModal = ref(false)
const itemEditModal = ref(false)
const shopEditForm = reactive({ name: '', description: '' })
const itemEditForm = reactive({ id: '', name: '', price: '', description: '' })
const imageUploading = ref(false)
const comment = reactive({
  score: 5,
  itemId: '',
  text: '',
  image: '',
  isAnonymous: true,
  isMealRecord: false,
  mealSlot: '午餐' as '早餐' | '午餐' | '晚餐' | '其他'
})

const itemNameOptions = computed(() => food.suggestItemNames(itemForm.name).map((name) => ({ label: name, value: name })))

function canDeleteItem(item: FoodItem) {
  return auth.isAdmin.value || (auth.user.value && item.creatorUserId === auth.user.value.id)
}

function canDeleteComment(commentItem: FoodComment) {
  return auth.isAdmin.value || (auth.user.value && commentItem.userId === auth.user.value.id)
}

function canManageShop() {
  return auth.isAdmin.value || (auth.user.value && shop.value?.creatorUserId === auth.user.value.id)
}

const itemColumns = computed<DataTableColumns<FoodItem>>(() => [
  { title: '菜品', key: 'name', minWidth: 150 },
  { title: '价格', key: 'price', width: 110 },
  {
    title: '评分',
    key: 'heat',
    width: 150,
    render(row) {
      const currentShop = shop.value
      const score = currentShop ? food.itemAverageScore(currentShop, row.id) : 0
      const count = currentShop ? food.itemCommentCount(currentShop, row.id) : row.commentCount ?? 0
      return h('div', { class: 'item-metrics' }, [
        h('span', null, [
          h('small', null, '评分'),
          h('strong', null, score > 0 ? score.toFixed(1) : '暂无')
        ]),
        h('span', null, [
          h('small', null, '评论数'),
          h('strong', null, String(count))
        ])
      ])
    }
  },
  { title: '说明', key: 'description', minWidth: 220 },
  {
    title: '状态',
    key: 'status',
    width: 95,
    render(row) {
      const isOffShelf = Boolean(row.isOffShelf)
      return h(NTag, { type: isOffShelf ? 'error' : 'success', size: 'small' }, {
        default: () => (isOffShelf ? '已下架' : '在售')
      })
    }
  },
  {
    title: '',
    key: 'actions',
    width: 56,
    align: 'center',
    render(row) {
      const isOffShelf = Boolean(row.isOffShelf)
      const options = [
        ...(auth.isAdmin.value ? [{ label: '编辑菜品', key: 'edit' }] : []),
        { label: isOffShelf ? '恢复上架' : '标记下架', key: isOffShelf ? 'restore' : 'off' },
        ...(canDeleteItem(row) ? [{ label: '删除菜品', key: 'delete' }] : [])
      ]
      return h(NDropdown, {
        trigger: 'click',
        options,
        onSelect: (key) => {
          if (key === 'delete') confirmDeleteItem(row)
          else if (key === 'edit') openItemEdit(row)
          else confirmItemStatus(row.id, !isOffShelf)
        }
      }, {
        default: () => h(NButton, { quaternary: true, circle: true, size: 'small' }, {
          icon: () => h(NIcon, null, { default: () => h(MoreVertRound) })
        })
      })
    }
  }
])

const itemOptions = computed(() => (shop.value?.items ?? []).map((item) => ({
  label: `${item.name}${item.isOffShelf ? '（已下架）' : ''}`,
  value: item.id,
  disabled: item.isOffShelf
})))

const visibleComments = computed(() => shop.value?.comments.filter((item) => item.isPublicComment !== false) ?? [])

const shopMoreOptions = computed(() => {
  if (!shop.value) return []
  return [
    { label: shop.value.isClosed ? '恢复营业' : '标记关门', key: shop.value.isClosed ? 'open' : 'close' },
    { label: shop.value.image ? '更换店铺图片' : '上传店铺图片', key: 'image' },
    ...(auth.isAdmin.value ? [{ label: '编辑店面', key: 'edit' }] : []),
    ...(canManageShop() ? [
      { label: '删除店面', key: 'delete', class: 'danger-menu-item' }
    ] : [])
  ]
})

async function submitItem() {
  if (!shop.value || !auth.requireLogin()) return
  if (!itemForm.name.trim()) {
    window.$message.warning('菜品名称不能为空')
    return
  }

  await food.addItem({
    shopId: shop.value.id,
    name: itemForm.name.trim(),
    price: itemForm.price.trim()
  })

  itemForm.name = ''
  itemForm.price = ''
  itemModal.value = false
  window.$message.success('菜品已添加')
}

async function submitComment() {
  if (!shop.value || !auth.requireLogin()) return
  if (!comment.text.trim()) {
    window.$message.warning('留言不能为空')
    return
  }

  await food.addComment(shop.value.id, {
    score: comment.score,
    itemId: comment.itemId || undefined,
    text: comment.text.trim(),
    image: comment.image || undefined,
    isAnonymous: comment.isAnonymous,
    isMealRecord: comment.isMealRecord,
    mealSlot: comment.isMealRecord ? comment.mealSlot : ''
  }, auth.user.value?.nickname || auth.user.value?.email)

  comment.score = 5
  comment.itemId = ''
  comment.text = ''
  comment.image = ''
  comment.isAnonymous = true
  comment.isMealRecord = false
  comment.mealSlot = '午餐'
  window.$message.success('评价已发布')
}

function handleShopMore(key: string) {
  if (!shop.value) return
  if (key === 'image') {
    pickShopImage()
    return
  }
  if (key === 'delete') {
    confirmDeleteShop()
    return
  }
  if (key === 'edit') {
    openShopEdit()
    return
  }
  confirmShopStatus(key === 'close')
}

function confirmShopStatus(isClosed: boolean) {
  if (!shop.value || !auth.requireLogin()) return
  dialog.warning({
    title: isClosed ? '确认标记关门？' : '确认恢复营业？',
    content: isClosed ? '这个操作会让店面在列表里显示“已关门”。之后也可以撤销。' : '这个操作会把店面恢复为营业中。',
    positiveText: isClosed ? '标记关门' : '恢复营业',
    negativeText: '取消',
    onPositiveClick: async () => {
      await food.setShopClosed(shop.value!.id, isClosed)
      window.$message.success(isClosed ? '已标记关门' : '已恢复营业')
    }
  })
}

function confirmItemStatus(itemId: string, isOffShelf: boolean) {
  if (!auth.requireLogin()) return
  dialog.warning({
    title: isOffShelf ? '确认下架菜品？' : '确认恢复菜品？',
    content: isOffShelf ? '菜品会显示“已下架”，评价时不能再引用它；之后可以撤销。' : '菜品会恢复为可引用状态。',
    positiveText: isOffShelf ? '确认下架' : '恢复上架',
    negativeText: '取消',
    onPositiveClick: async () => {
      await food.setItemOffShelf(itemId, isOffShelf)
      window.$message.success(isOffShelf ? '菜品已下架' : '菜品已恢复')
    }
  })
}

function confirmDeleteItem(item: FoodItem) {
  dialog.warning({
    title: '确认删除菜品？',
    content: `会删除“${item.name}”，已有评价会保留但不再引用这个菜品。`,
    positiveText: '删除菜品',
    negativeText: '取消',
    onPositiveClick: async () => {
      await food.deleteItem(item.id)
      window.$message.success('菜品已删除')
    }
  })
}

function confirmDeleteComment(commentItem: FoodComment) {
  dialog.warning({
    title: '确认删除留言？',
    content: '这条评分留言会被删除，操作不能撤销。',
    positiveText: '删除留言',
    negativeText: '取消',
    onPositiveClick: async () => {
      await food.deleteComment(commentItem.id)
      window.$message.success('留言已删除')
    }
  })
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
  if (!shop.value || !auth.requireLogin()) return
  const file = await pickFile()
  if (!file) return
  try {
    imageUploading.value = true
    const image = await compressImageToDataUrl(file)
    await food.updateShopImage(shop.value.id, image)
    window.$message.success('店铺图片已更新')
  } catch (error) {
    window.$message.error(error instanceof Error ? error.message : '图片处理失败')
  } finally {
    imageUploading.value = false
  }
}

function openShopEdit() {
  if (!shop.value || !auth.isAdmin.value) return
  shopEditForm.name = shop.value.name
  shopEditForm.description = shop.value.description
  shopEditModal.value = true
}

async function submitShopEdit() {
  if (!shop.value || !auth.isAdmin.value) return
  if (!shopEditForm.name.trim()) {
    window.$message.warning('店面名称不能为空')
    return
  }
  await food.updateShop(shop.value.id, {
    name: shopEditForm.name.trim(),
    description: shopEditForm.description.trim()
  })
  shopEditModal.value = false
  window.$message.success('店面已更新')
}

function openItemEdit(item: FoodItem) {
  if (!auth.isAdmin.value) return
  itemEditForm.id = item.id
  itemEditForm.name = item.name
  itemEditForm.price = item.price
  itemEditForm.description = item.description
  itemEditModal.value = true
}

async function submitItemEdit() {
  if (!itemEditForm.id || !auth.isAdmin.value) return
  if (!itemEditForm.name.trim()) {
    window.$message.warning('菜品名称不能为空')
    return
  }
  await food.updateItem(itemEditForm.id, {
    name: itemEditForm.name.trim(),
    price: itemEditForm.price.trim(),
    description: itemEditForm.description.trim()
  })
  itemEditModal.value = false
  window.$message.success('菜品已更新')
}

async function pickCommentImage() {
  const file = await pickFile()
  if (!file) return
  try {
    imageUploading.value = true
    comment.image = await compressImageToDataUrl(file)
    window.$message.success('评价图片已压缩到 100KB 内')
  } catch (error) {
    window.$message.error(error instanceof Error ? error.message : '图片处理失败')
  } finally {
    imageUploading.value = false
  }
}

function confirmDeleteShop() {
  if (!shop.value || !canManageShop()) return
  dialog.warning({
    title: '确认删除店面？',
    content: `会删除“${shop.value.name}”和它下面的菜品、评价。这个操作不能撤销。`,
    positiveText: '删除店面',
    negativeText: '取消',
    onPositiveClick: async () => {
      const areaId = shop.value!.areaId
      await food.deleteShop(shop.value!.id)
      window.$message.success('店面已删除')
      router.push(`/area/${areaId}`)
    }
  })
}
</script>

<template>
  <div class="page-container">
    <n-result v-if="!shop" status="404" title="没有找到这个店面" description="可能是链接过期，或者店面还没有被添加。">
      <template #footer>
        <n-button @click="router.push('/home')">回首页</n-button>
      </template>
    </n-result>

    <n-space v-else vertical size="large">
      <n-card>
          <n-space vertical>
          <img v-if="shop.image" class="shop-photo" :src="shop.image" :alt="shop.name">
          <n-space justify="space-between" align="start">
            <div>
              <n-space align="center">
                <n-tag type="info" round>{{ area?.campus }}</n-tag>
                <span class="muted">{{ area?.name }}</span>
                <n-tag v-if="shop.isClosed" type="error">已关门</n-tag>
              </n-space>
              <n-h1 style="margin: 8px 0 4px;">{{ shop.name }}</n-h1>
              <div class="location-line">
                所在区域：{{ area?.campus }} · {{ area?.name }} · {{ area?.kind }}
              </div>
              <n-text v-if="shop.description">{{ shop.description }}</n-text>
            </div>
            <n-space align="start">
              <n-statistic label="综合评分" :value="food.averageScore(shop).toFixed(1)" />
              <n-dropdown trigger="click" :options="shopMoreOptions" @select="handleShopMore">
                <n-button quaternary circle>
                  <template #icon>
                    <n-icon :component="MoreVertRound" />
                  </template>
                </n-button>
              </n-dropdown>
            </n-space>
          </n-space>
          <div v-if="shop.tags.length" class="tag-row">
            <n-tag v-for="tag in shop.tags" :key="tag" round>{{ tag }}</n-tag>
          </div>
        </n-space>
      </n-card>

      <n-card title="菜品表">
        <n-space vertical>
          <n-data-table class="desktop-item-table" :columns="itemColumns" :data="shop.items" />
          <div class="mobile-item-list">
            <n-card v-for="item in shop.items" :key="item.id" size="small" class="mobile-item-card">
              <n-space vertical>
                <n-space justify="space-between" align="start">
                  <strong class="mobile-item-name">{{ item.name }}</strong>
                  <n-dropdown
                    trigger="click"
                    :options="[
                      ...(auth.isAdmin.value ? [{ label: '编辑菜品', key: 'edit' }] : []),
                      { label: item.isOffShelf ? '恢复上架' : '标记下架', key: item.isOffShelf ? 'restore' : 'off' },
                      ...(canDeleteItem(item) ? [{ label: '删除菜品', key: 'delete' }] : [])
                    ]"
                    @select="(key: string) => key === 'delete' ? confirmDeleteItem(item) : key === 'edit' ? openItemEdit(item) : confirmItemStatus(item.id, !item.isOffShelf)"
                  >
                    <n-button quaternary circle size="small">
                      <template #icon>
                        <n-icon :component="MoreVertRound" />
                      </template>
                    </n-button>
                  </n-dropdown>
                </n-space>
                <n-space align="center">
                  <n-tag size="small" round>价格 {{ item.price || '待补' }}</n-tag>
                  <n-tag size="small" type="info" round>评分 {{ food.itemAverageScore(shop, item.id) > 0 ? food.itemAverageScore(shop, item.id).toFixed(1) : '暂无' }}</n-tag>
                  <n-tag size="small" round>评论数 {{ food.itemCommentCount(shop, item.id) }}</n-tag>
                  <n-tag v-if="item.isOffShelf" type="error" size="small">已下架</n-tag>
                </n-space>
                <n-text v-if="item.description" class="mobile-item-description">{{ item.description }}</n-text>
              </n-space>
            </n-card>
          </div>
          <n-space justify="end">
            <n-button type="primary" @click="auth.requireLogin() && (itemModal = true)">添加菜品</n-button>
          </n-space>
        </n-space>
      </n-card>

      <n-card title="AI 总结留言">
        <n-text>{{ food.buildSummary(shop) }}</n-text>
      </n-card>

      <n-card title="写一条评分留言">
        <n-space vertical>
          <FormField label="评分" example="觉得很好吃就给 4.5 或 5 分">
            <n-rate v-model:value="comment.score" allow-half />
          </FormField>
          <FormField label="引用菜品" example="基础煎饼加辣条火腿；也可以不选">
            <n-select v-model:value="comment.itemId" clearable :options="itemOptions" />
          </FormField>
          <FormField label="留言内容" example="口味、价格、排队、适合什么场景">
            <n-input v-model:value="comment.text" type="textarea" :autosize="{ minRows: 3 }" maxlength="500" show-count />
          </FormField>
          <FormField label="是否匿名" example="默认匿名；关闭后会显示你的昵称">
            <n-radio-group v-model:value="comment.isAnonymous">
              <n-grid :cols="2" :x-gap="8">
                <n-grid-item><n-radio-button :value="true" class="slot-radio">匿名</n-radio-button></n-grid-item>
                <n-grid-item><n-radio-button :value="false" class="slot-radio">显示昵称</n-radio-button></n-grid-item>
              </n-grid>
            </n-radio-group>
          </FormField>
          <FormField label="计入今天吃了" example="打开后才会进入个人吃饭统计">
            <n-space vertical>
              <n-switch v-model:value="comment.isMealRecord">
                <template #checked>计入</template>
                <template #unchecked>只发评价</template>
              </n-switch>
              <n-radio-group v-if="comment.isMealRecord" v-model:value="comment.mealSlot">
                <n-grid :cols="4" :x-gap="8">
                  <n-grid-item><n-radio-button value="早餐" class="slot-radio">早餐</n-radio-button></n-grid-item>
                  <n-grid-item><n-radio-button value="午餐" class="slot-radio">午餐</n-radio-button></n-grid-item>
                  <n-grid-item><n-radio-button value="晚餐" class="slot-radio">晚餐</n-radio-button></n-grid-item>
                  <n-grid-item><n-radio-button value="其他" class="slot-radio">其他</n-radio-button></n-grid-item>
                </n-grid>
              </n-radio-group>
            </n-space>
          </FormField>
          <FormField label="图片" example="可以拍一张菜品图，系统会压缩到 100KB 内">
            <n-space vertical>
              <n-image v-if="comment.image" :src="comment.image" width="120" object-fit="cover" />
              <n-space>
                <n-button :loading="imageUploading" @click="pickCommentImage">{{ comment.image ? '更换图片' : '上传图片' }}</n-button>
                <n-button v-if="comment.image" quaternary @click="comment.image = ''">移除</n-button>
              </n-space>
            </n-space>
          </FormField>
          <n-space justify="end">
            <n-button type="primary" @click="submitComment">发表评价</n-button>
          </n-space>
        </n-space>
      </n-card>

      <n-card title="评分留言">
        <n-space vertical>
          <n-card v-for="item in visibleComments" :key="item.id" size="small">
            <n-space vertical>
              <n-space justify="space-between" align="start">
                <n-space>
                  <strong>{{ item.user }}</strong>
                  <n-tag v-if="item.itemId" size="small" round>{{ food.getItem(item.itemId)?.name }}</n-tag>
                </n-space>
                <n-space align="center">
                  <n-tag size="small" type="success" round>评分 {{ item.score.toFixed(1) }}</n-tag>
                  <button v-if="canDeleteComment(item)" type="button" class="danger-dot" aria-label="删除评论" @click="confirmDeleteComment(item)">×</button>
                </n-space>
              </n-space>
              <n-text class="comment-text">{{ item.text }}</n-text>
              <n-image v-if="item.image" :src="item.image" width="140" object-fit="cover" />
              <span class="muted">{{ item.createTime }}</span>
            </n-space>
          </n-card>
          <n-empty v-if="visibleComments.length === 0" description="还没有评价，登录后可以做第一个评价的人。" />
        </n-space>
      </n-card>

      <n-modal v-model:show="itemModal" preset="card" title="添加菜品" style="width: min(92vw, 520px);">
        <n-space vertical>
          <FormField label="菜品名称" example="基础煎饼加辣条火腿、铁板意面">
            <n-auto-complete v-model:value="itemForm.name" :options="itemNameOptions" />
          </FormField>
          <FormField label="价格" example="平均9、16+、按串计">
            <n-input v-model:value="itemForm.price" />
          </FormField>
          <n-button type="primary" block @click="submitItem">提交菜品</n-button>
        </n-space>
      </n-modal>

      <n-modal v-model:show="shopEditModal" preset="card" title="编辑店面" style="width: min(92vw, 520px);">
        <n-space vertical>
          <FormField label="店面名称">
            <n-input v-model:value="shopEditForm.name" />
          </FormField>
          <FormField label="说明">
            <n-input v-model:value="shopEditForm.description" type="textarea" :autosize="{ minRows: 3 }" />
          </FormField>
          <n-button type="primary" block @click="submitShopEdit">保存店面</n-button>
        </n-space>
      </n-modal>

      <n-modal v-model:show="itemEditModal" preset="card" title="编辑菜品" style="width: min(92vw, 520px);">
        <n-space vertical>
          <FormField label="菜品名称">
            <n-input v-model:value="itemEditForm.name" />
          </FormField>
          <FormField label="价格">
            <n-input v-model:value="itemEditForm.price" />
          </FormField>
          <FormField label="说明">
            <n-input v-model:value="itemEditForm.description" type="textarea" :autosize="{ minRows: 3 }" />
          </FormField>
          <n-button type="primary" block @click="submitItemEdit">保存菜品</n-button>
        </n-space>
      </n-modal>
    </n-space>
  </div>
</template>

<style scoped>
.mini-text {
  font-size: 12px;
  white-space: nowrap;
}

.item-metrics {
  display: flex;
  gap: 12px;
  align-items: center;
  white-space: nowrap;
}

.item-metrics span {
  display: inline-flex;
  gap: 4px;
  align-items: baseline;
}

.item-metrics small {
  color: var(--text-color-3);
  font-size: 12px;
}

.item-metrics strong {
  color: var(--text-color-1);
  font-size: 14px;
  font-weight: 700;
}

.location-line {
  margin: 0 0 8px;
  color: var(--text-color-2);
  font-weight: 700;
}

.shop-photo {
  width: 100%;
  max-height: 260px;
  object-fit: cover;
  border-radius: 8px;
}

.slot-radio {
  width: 100%;
  text-align: center;
}

.mobile-item-list {
  display: none;
}

.mobile-item-description {
  line-height: 1.6;
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

@media (max-width: 680px) {
  .desktop-item-table {
    display: none;
  }

  .mobile-item-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .mobile-item-name {
    font-size: 18px;
    line-height: 1.35;
  }

  .comment-text {
    font-size: 17px;
    line-height: 1.7;
  }
}
</style>
