<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NInput, NSelect, NTag, useDialog, type DataTableColumns } from 'naive-ui'
import { useAuthStore, type AdminUser } from '@/store/auth'
import { useFoodStore, type AreaKind, type Campus, type FeedbackTicket, type FoodComment, type FoodItem, type FoodShop } from '@/store/food'
import FormField from '@/components/FormField.vue'

const auth = useAuthStore()
const food = useFoodStore()
const router = useRouter()
const dialog = useDialog()

const loading = ref(false)
const users = ref<AdminUser[]>([])
const tickets = ref<FeedbackTicket[]>([])
const keyword = ref('')
const campusFilter = ref<'全部' | Campus>('全部')
const statusFilter = ref<'全部' | 'open' | 'closed'>('全部')
const editAreaModal = ref(false)
const editShopModal = ref(false)
const editItemModal = ref(false)
const editUserModal = ref(false)

const areaForm = reactive({ id: '', name: '', campus: '良乡校区' as Campus, kind: '食堂' as AreaKind, description: '' })
const shopForm = reactive({ id: '', name: '', description: '' })
const itemForm = reactive({ id: '', name: '', price: '', description: '' })
const userForm = reactive({ id: 0, nickname: '', role: 'user' as 'user' | 'admin', defaultCampus: '良乡校区' as Campus })

const areaOptions = computed(() => food.areas.value.map((area) => ({ label: area.name, value: area.id })))
const flattenedItems = computed(() => food.shops.value.flatMap((shop) => shop.items.map((item) => ({ item, shop, area: food.getArea(shop.areaId) }))))
const flattenedComments = computed(() => food.shops.value.flatMap((shop) => shop.comments.map((comment) => ({ comment, shop, item: food.getItem(comment.itemId), area: food.getArea(shop.areaId) }))))

const normalizedKeyword = computed(() => keyword.value.trim().toLowerCase())
const filteredAreas = computed(() => food.areas.value.filter((area) => {
  if (campusFilter.value !== '全部' && area.campus !== campusFilter.value) return false
  if (!normalizedKeyword.value) return true
  return [area.name, area.campus, area.kind, area.description].join(' ').toLowerCase().includes(normalizedKeyword.value)
}))
const filteredShops = computed(() => food.shops.value.filter((shop) => {
  const area = food.getArea(shop.areaId)
  if (campusFilter.value !== '全部' && area?.campus !== campusFilter.value) return false
  if (!normalizedKeyword.value) return true
  return [shop.name, shop.description, shop.tags.join(' '), area?.name, area?.campus].join(' ').toLowerCase().includes(normalizedKeyword.value)
}))
const filteredItems = computed(() => flattenedItems.value.filter(({ item, shop, area }) => {
  if (campusFilter.value !== '全部' && area?.campus !== campusFilter.value) return false
  if (!normalizedKeyword.value) return true
  return [item.name, item.price, item.description, shop.name, area?.name].join(' ').toLowerCase().includes(normalizedKeyword.value)
}))
const filteredComments = computed(() => flattenedComments.value.filter(({ comment, shop, item }) => {
  if (!normalizedKeyword.value) return true
  return [comment.user, comment.text, shop.name, item?.name].join(' ').toLowerCase().includes(normalizedKeyword.value)
}))
const filteredTickets = computed(() => tickets.value.filter((ticket) => {
  if (statusFilter.value !== '全部' && ticket.status !== statusFilter.value) return false
  if (!normalizedKeyword.value) return true
  return [ticket.title, ticket.content, ticket.userEmail, ticket.userNickname].join(' ').toLowerCase().includes(normalizedKeyword.value)
}))
const filteredUsers = computed(() => users.value.filter((user) => {
  if (!normalizedKeyword.value) return true
  return [user.email, user.nickname, user.role, user.defaultCampus].join(' ').toLowerCase().includes(normalizedKeyword.value)
}))

const stats = computed(() => ({
  areas: food.areas.value.length,
  shops: food.shops.value.length,
  openShops: food.shops.value.filter((shop) => !shop.isClosed).length,
  items: flattenedItems.value.length,
  comments: flattenedComments.value.filter(({ comment }) => comment.isPublicComment !== false).length,
  ticketsOpen: tickets.value.filter((ticket) => ticket.status === 'open').length,
  users: users.value.length,
  admins: users.value.filter((user) => user.role === 'admin').length
}))

async function refreshAdminData() {
  if (!auth.isAdmin.value) return
  loading.value = true
  try {
    await food.loadFromApi()
    const [userData, ticketData] = await Promise.all([
      auth.adminFetchUsers(),
      food.adminFetchTickets()
    ])
    users.value = userData.users
    tickets.value = ticketData.tickets
  } catch (error) {
    window.$message.error(error instanceof Error ? error.message : '后台数据加载失败')
  } finally {
    loading.value = false
  }
}

function requireAdmin() {
  if (auth.isAdmin.value) return true
  if (!auth.user.value) auth.authModal.value = true
  return false
}

function openAreaEdit(area: { id: string; name: string; campus: Campus; kind: AreaKind; description: string }) {
  areaForm.id = area.id
  areaForm.name = area.name
  areaForm.campus = area.campus
  areaForm.kind = area.kind
  areaForm.description = area.description
  editAreaModal.value = true
}

async function submitAreaEdit() {
  await food.updateArea(areaForm.id, {
    name: areaForm.name.trim(),
    campus: areaForm.campus,
    kind: areaForm.kind,
    description: areaForm.description.trim()
  })
  editAreaModal.value = false
  await refreshAdminData()
  window.$message.success('区域已更新')
}

function openShopEdit(shop: FoodShop) {
  shopForm.id = shop.id
  shopForm.name = shop.name
  shopForm.description = shop.description
  editShopModal.value = true
}

async function submitShopEdit() {
  await food.updateShop(shopForm.id, { name: shopForm.name.trim(), description: shopForm.description.trim() })
  editShopModal.value = false
  await refreshAdminData()
  window.$message.success('店面已更新')
}

function openItemEdit(item: FoodItem) {
  itemForm.id = item.id
  itemForm.name = item.name
  itemForm.price = item.price
  itemForm.description = item.description
  editItemModal.value = true
}

async function submitItemEdit() {
  await food.updateItem(itemForm.id, { name: itemForm.name.trim(), price: itemForm.price.trim(), description: itemForm.description.trim() })
  editItemModal.value = false
  await refreshAdminData()
  window.$message.success('菜品已更新')
}

function openUserEdit(user: AdminUser) {
  userForm.id = user.id
  userForm.nickname = user.nickname
  userForm.role = user.role
  userForm.defaultCampus = user.defaultCampus ?? '良乡校区'
  editUserModal.value = true
}

async function submitUserEdit() {
  await auth.adminUpdateUser(userForm.id, {
    nickname: userForm.nickname.trim(),
    role: userForm.role,
    defaultCampus: userForm.defaultCampus
  })
  editUserModal.value = false
  await refreshAdminData()
  window.$message.success('用户已更新')
}

function confirmShopStatus(shop: FoodShop, isClosed: boolean) {
  dialog.warning({
    title: isClosed ? '标记店面关门？' : '恢复店面营业？',
    content: isClosed ? '店面会显示已关门，并自动下架下面所有菜品。' : '店面会恢复营业，菜品需要按实际情况单独恢复。',
    positiveText: isClosed ? '标记关门' : '恢复营业',
    negativeText: '取消',
    onPositiveClick: async () => {
      await food.setShopClosed(shop.id, isClosed)
      await refreshAdminData()
      window.$message.success(isClosed ? '已标记关门' : '已恢复营业')
    }
  })
}

function confirmItemStatus(item: FoodItem, isOffShelf: boolean) {
  dialog.warning({
    title: isOffShelf ? '下架菜品？' : '恢复菜品？',
    content: isOffShelf ? '菜品会显示已下架，评价时不能再引用。' : '菜品会恢复为可引用状态。',
    positiveText: isOffShelf ? '下架' : '恢复',
    negativeText: '取消',
    onPositiveClick: async () => {
      await food.setItemOffShelf(item.id, isOffShelf)
      await refreshAdminData()
      window.$message.success(isOffShelf ? '菜品已下架' : '菜品已恢复')
    }
  })
}

function confirmDeleteShop(shop: FoodShop) {
  dialog.warning({
    title: '删除店面？',
    content: `会删除“${shop.name}”以及下面所有菜品和评价，无法撤销。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await food.deleteShop(shop.id)
      await refreshAdminData()
      window.$message.success('店面已删除')
    }
  })
}

function confirmDeleteItem(item: FoodItem) {
  dialog.warning({
    title: '删除菜品？',
    content: `会删除“${item.name}”，已有评价会保留但不再引用这个菜品。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await food.deleteItem(item.id)
      await refreshAdminData()
      window.$message.success('菜品已删除')
    }
  })
}

function confirmDeleteComment(comment: FoodComment) {
  dialog.warning({
    title: '删除留言？',
    content: '这条评分留言会被删除，操作不能撤销。',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await food.deleteComment(comment.id)
      await refreshAdminData()
      window.$message.success('留言已删除')
    }
  })
}

async function updateTicket(ticket: FeedbackTicket, status: 'open' | 'closed') {
  await food.adminUpdateTicket(ticket.id, status)
  await refreshAdminData()
  window.$message.success(status === 'closed' ? '工单已关闭' : '工单已重新打开')
}

const areaColumns: DataTableColumns<(typeof filteredAreas.value)[number]> = [
  { title: '区域', key: 'name', minWidth: 140 },
  { title: '校区', key: 'campus', width: 110 },
  { title: '类型', key: 'kind', width: 110 },
  { title: '说明', key: 'description', minWidth: 240, ellipsis: { tooltip: true } },
  {
    title: '操作',
    key: 'actions',
    width: 110,
    fixed: 'right',
    render(row) {
      return h(NButton, { size: 'small', tertiary: true, onClick: () => openAreaEdit(row) }, { default: () => '编辑' })
    }
  }
]

const shopColumns: DataTableColumns<FoodShop> = [
  { title: '店面', key: 'name', minWidth: 160 },
  { title: '区域', key: 'area', minWidth: 130, render: (row) => food.getArea(row.areaId)?.name ?? '-' },
  { title: '菜品/评价', key: 'counts', width: 120, render: (row) => `${row.items.length} / ${row.comments.filter((item) => item.isPublicComment !== false).length}` },
  { title: '状态', key: 'status', width: 90, render: (row) => h(NTag, { type: row.isClosed ? 'error' : 'success', size: 'small' }, { default: () => row.isClosed ? '关门' : '营业' }) },
  {
    title: '操作',
    key: 'actions',
    width: 230,
    fixed: 'right',
    render(row) {
      return h('div', { class: 'admin-actions' }, [
        h(NButton, { size: 'small', tertiary: true, onClick: () => router.push(`/shop/${row.id}`) }, { default: () => '查看' }),
        h(NButton, { size: 'small', tertiary: true, onClick: () => openShopEdit(row) }, { default: () => '编辑' }),
        h(NButton, { size: 'small', tertiary: true, onClick: () => confirmShopStatus(row, !row.isClosed) }, { default: () => row.isClosed ? '恢复' : '关门' }),
        h(NButton, { size: 'small', tertiary: true, type: 'error', onClick: () => confirmDeleteShop(row) }, { default: () => '删除' })
      ])
    }
  }
]

const itemColumns: DataTableColumns<(typeof filteredItems.value)[number]> = [
  { title: '菜品', key: 'item.name', minWidth: 150, render: (row) => row.item.name },
  { title: '店面', key: 'shop.name', minWidth: 140, render: (row) => row.shop.name },
  { title: '价格', key: 'item.price', width: 100, render: (row) => row.item.price || '待补' },
  { title: '状态', key: 'status', width: 90, render: (row) => h(NTag, { type: row.item.isOffShelf ? 'error' : 'success', size: 'small' }, { default: () => row.item.isOffShelf ? '下架' : '在售' }) },
  {
    title: '操作',
    key: 'actions',
    width: 180,
    fixed: 'right',
    render(row) {
      return h('div', { class: 'admin-actions' }, [
        h(NButton, { size: 'small', tertiary: true, onClick: () => openItemEdit(row.item) }, { default: () => '编辑' }),
        h(NButton, { size: 'small', tertiary: true, onClick: () => confirmItemStatus(row.item, !row.item.isOffShelf) }, { default: () => row.item.isOffShelf ? '恢复' : '下架' }),
        h(NButton, { size: 'small', tertiary: true, type: 'error', onClick: () => confirmDeleteItem(row.item) }, { default: () => '删除' })
      ])
    }
  }
]

const commentColumns: DataTableColumns<(typeof filteredComments.value)[number]> = [
  { title: '用户', key: 'comment.user', width: 110, render: (row) => row.comment.user },
  { title: '店面/菜品', key: 'target', minWidth: 180, render: (row) => `${row.shop.name}${row.item ? ` · ${row.item.name}` : ''}` },
  { title: '评分', key: 'score', width: 70, render: (row) => row.comment.score.toFixed(1) },
  { title: '内容', key: 'text', minWidth: 260, ellipsis: { tooltip: true }, render: (row) => row.comment.text || '仅吃饭记录' },
  { title: '时间', key: 'time', width: 160, render: (row) => row.comment.createTime },
  {
    title: '操作',
    key: 'actions',
    width: 90,
    fixed: 'right',
    render(row) {
      return h(NButton, { size: 'small', tertiary: true, type: 'error', onClick: () => confirmDeleteComment(row.comment) }, { default: () => '删除' })
    }
  }
]

const ticketColumns: DataTableColumns<FeedbackTicket> = [
  { title: '标题', key: 'title', minWidth: 180 },
  { title: '内容', key: 'content', minWidth: 280, ellipsis: { tooltip: true } },
  { title: '用户', key: 'user', width: 160, render: (row) => row.userNickname || row.userEmail || '游客' },
  { title: '状态', key: 'status', width: 90, render: (row) => h(NTag, { type: row.status === 'open' ? 'warning' : 'success', size: 'small' }, { default: () => row.status === 'open' ? '处理中' : '已关闭' }) },
  { title: '时间', key: 'createdAt', width: 160 },
  {
    title: '操作',
    key: 'actions',
    width: 110,
    fixed: 'right',
    render(row) {
      return h(NButton, { size: 'small', tertiary: true, onClick: () => updateTicket(row, row.status === 'open' ? 'closed' : 'open') }, { default: () => row.status === 'open' ? '关闭' : '重开' })
    }
  }
]

const userColumns: DataTableColumns<AdminUser> = [
  { title: '昵称', key: 'nickname', minWidth: 120 },
  { title: '邮箱', key: 'email', minWidth: 180 },
  { title: '角色', key: 'role', width: 90, render: (row) => h(NTag, { type: row.role === 'admin' ? 'error' : 'default', size: 'small' }, { default: () => row.role }) },
  { title: '默认校区', key: 'defaultCampus', width: 120 },
  { title: '贡献', key: 'counts', width: 130, render: (row) => `${row.shopCount}店 / ${row.itemCount}菜 / ${row.commentCount}评` },
  {
    title: '操作',
    key: 'actions',
    width: 90,
    fixed: 'right',
    render(row) {
      return h(NButton, { size: 'small', tertiary: true, onClick: () => openUserEdit(row) }, { default: () => '编辑' })
    }
  }
]

onMounted(async () => {
  await auth.loadMe()
  if (requireAdmin()) await refreshAdminData()
})
</script>

<template>
  <div class="admin-page">
    <n-result
      v-if="!auth.isAdmin.value"
      status="403"
      title="需要管理员权限"
      description="这个后台用于集中管理 eat.bitdate.date 的区域、店面、菜品、评论、工单和用户。"
    >
      <template #footer>
        <n-button v-if="!auth.user.value" type="primary" @click="auth.authModal.value = true">登录</n-button>
        <n-button v-else @click="router.push('/home')">回首页</n-button>
      </template>
    </n-result>

    <n-space v-else vertical size="large">
      <n-card>
        <n-space justify="space-between" align="center">
          <div>
            <n-h1 class="admin-title">管理员后台</n-h1>
            <div class="muted">集中处理内容、工单和用户权限。</div>
          </div>
          <n-space>
            <n-button :loading="loading" @click="refreshAdminData">刷新后台数据</n-button>
            <n-button type="primary" @click="router.push('/admin/canteens')">新建区域</n-button>
          </n-space>
        </n-space>
      </n-card>

      <n-grid cols="2 s:4 m:8" responsive="screen" :x-gap="12" :y-gap="12">
        <n-grid-item><n-card size="small"><n-statistic label="区域" :value="stats.areas" /></n-card></n-grid-item>
        <n-grid-item><n-card size="small"><n-statistic label="店面" :value="stats.shops" /></n-card></n-grid-item>
        <n-grid-item><n-card size="small"><n-statistic label="营业中" :value="stats.openShops" /></n-card></n-grid-item>
        <n-grid-item><n-card size="small"><n-statistic label="菜品" :value="stats.items" /></n-card></n-grid-item>
        <n-grid-item><n-card size="small"><n-statistic label="评论" :value="stats.comments" /></n-card></n-grid-item>
        <n-grid-item><n-card size="small"><n-statistic label="待处理" :value="stats.ticketsOpen" /></n-card></n-grid-item>
        <n-grid-item><n-card size="small"><n-statistic label="用户" :value="stats.users" /></n-card></n-grid-item>
        <n-grid-item><n-card size="small"><n-statistic label="管理员" :value="stats.admins" /></n-card></n-grid-item>
      </n-grid>

      <n-card>
        <n-space align="center" justify="space-between">
          <n-input v-model:value="keyword" clearable placeholder="搜索区域、店面、菜品、评论、用户或工单" class="admin-search" />
          <n-space>
            <n-select
              v-model:value="campusFilter"
              class="admin-filter"
              :options="[
                { label: '全部校区', value: '全部' },
                { label: '良乡校区', value: '良乡校区' },
                { label: '中关村校区', value: '中关村校区' }
              ]"
            />
            <n-select
              v-model:value="statusFilter"
              class="admin-filter"
              :options="[
                { label: '全部工单', value: '全部' },
                { label: '处理中', value: 'open' },
                { label: '已关闭', value: 'closed' }
              ]"
            />
          </n-space>
        </n-space>
      </n-card>

      <n-tabs type="segment" animated>
        <n-tab-pane name="areas" tab="区域">
          <n-data-table :columns="areaColumns" :data="filteredAreas" :loading="loading" :scroll-x="760" />
        </n-tab-pane>
        <n-tab-pane name="shops" tab="店面">
          <n-data-table :columns="shopColumns" :data="filteredShops" :loading="loading" :scroll-x="900" />
        </n-tab-pane>
        <n-tab-pane name="items" tab="菜品">
          <n-data-table :columns="itemColumns" :data="filteredItems" :loading="loading" :scroll-x="820" />
        </n-tab-pane>
        <n-tab-pane name="comments" tab="评论">
          <n-data-table :columns="commentColumns" :data="filteredComments" :loading="loading" :scroll-x="980" />
        </n-tab-pane>
        <n-tab-pane name="tickets" tab="工单">
          <n-data-table :columns="ticketColumns" :data="filteredTickets" :loading="loading" :scroll-x="960" />
        </n-tab-pane>
        <n-tab-pane name="users" tab="用户">
          <n-data-table :columns="userColumns" :data="filteredUsers" :loading="loading" :scroll-x="820" />
        </n-tab-pane>
      </n-tabs>
    </n-space>

    <n-modal v-model:show="editAreaModal" preset="card" title="编辑区域" style="width: min(92vw, 560px);">
      <n-space vertical>
        <FormField label="区域名称"><n-input v-model:value="areaForm.name" /></FormField>
        <FormField label="校区">
          <n-select v-model:value="areaForm.campus" :options="[{ label: '良乡校区', value: '良乡校区' }, { label: '中关村校区', value: '中关村校区' }]" />
        </FormField>
        <FormField label="类型">
          <n-select v-model:value="areaForm.kind" :options="[{ label: '食堂', value: '食堂' }, { label: '宿舍楼下', value: '宿舍楼下' }, { label: '商业区', value: '商业区' }, { label: '其他地点', value: '其他地点' }]" />
        </FormField>
        <FormField label="说明"><n-input v-model:value="areaForm.description" type="textarea" :autosize="{ minRows: 3 }" /></FormField>
        <n-button type="primary" block @click="submitAreaEdit">保存区域</n-button>
      </n-space>
    </n-modal>

    <n-modal v-model:show="editShopModal" preset="card" title="编辑店面" style="width: min(92vw, 560px);">
      <n-space vertical>
        <FormField label="店面名称"><n-input v-model:value="shopForm.name" /></FormField>
        <FormField label="说明"><n-input v-model:value="shopForm.description" type="textarea" :autosize="{ minRows: 3 }" /></FormField>
        <n-button type="primary" block @click="submitShopEdit">保存店面</n-button>
      </n-space>
    </n-modal>

    <n-modal v-model:show="editItemModal" preset="card" title="编辑菜品" style="width: min(92vw, 560px);">
      <n-space vertical>
        <FormField label="菜品名称"><n-input v-model:value="itemForm.name" /></FormField>
        <FormField label="价格"><n-input v-model:value="itemForm.price" /></FormField>
        <FormField label="说明"><n-input v-model:value="itemForm.description" type="textarea" :autosize="{ minRows: 3 }" /></FormField>
        <n-button type="primary" block @click="submitItemEdit">保存菜品</n-button>
      </n-space>
    </n-modal>

    <n-modal v-model:show="editUserModal" preset="card" title="编辑用户" style="width: min(92vw, 520px);">
      <n-space vertical>
        <FormField label="昵称"><n-input v-model:value="userForm.nickname" /></FormField>
        <FormField label="角色">
          <n-select v-model:value="userForm.role" :options="[{ label: '普通用户', value: 'user' }, { label: '管理员', value: 'admin' }]" />
        </FormField>
        <FormField label="默认校区">
          <n-select v-model:value="userForm.defaultCampus" :options="[{ label: '良乡校区', value: '良乡校区' }, { label: '中关村校区', value: '中关村校区' }]" />
        </FormField>
        <n-button type="primary" block @click="submitUserEdit">保存用户</n-button>
      </n-space>
    </n-modal>
  </div>
</template>

<style scoped>
.admin-page {
  width: min(100%, 1180px);
  margin: auto;
}

.admin-title {
  margin: 0 0 4px;
}

.admin-search {
  width: min(100%, 420px);
}

.admin-filter {
  width: 140px;
}

.admin-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

@media (max-width: 760px) {
  .admin-search,
  .admin-filter {
    width: 100%;
  }

  .admin-actions {
    min-width: 210px;
  }
}
</style>
