<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useAuthStore } from '@/store/auth'
import FormField from '@/components/FormField.vue'

interface Ticket {
  id: number
  title: string
  content: string
  status: 'open' | 'closed'
  userEmail?: string
  userNickname?: string
  createdAt: string
}

const auth = useAuthStore()
const loading = ref(false)
const tickets = ref<Ticket[]>([])
const form = reactive({
  title: '',
  content: ''
})

const openTickets = computed(() => tickets.value.filter((item) => item.status === 'open'))
const closedTickets = computed(() => tickets.value.filter((item) => item.status === 'closed'))

async function loadTickets() {
  if (!auth.isAdmin.value) return
  const response = await fetch('/api/tickets')
  if (!response.ok) return
  const data = await response.json() as { tickets: Ticket[] }
  tickets.value = data.tickets
}

async function submitTicket() {
  const title = form.title.trim()
  const content = form.content.trim()
  if (!title || !content) {
    window.$message.warning('请填写标题和问题内容')
    return
  }

  loading.value = true
  try {
    const response = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title,
        content
      })
    })
    if (!response.ok) throw new Error('submit failed')
    form.title = ''
    form.content = ''
    window.$message.success('反馈已提交')
    await loadTickets()
  } catch {
    window.$message.error('提交失败，请稍后再试')
  } finally {
    loading.value = false
  }
}

async function setTicketStatus(ticketId: number, status: 'open' | 'closed') {
  const response = await fetch('/api/tickets', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ticketId, status })
  })
  if (!response.ok) {
    window.$message.error('更新失败')
    return
  }
  window.$message.success(status === 'closed' ? '已标记处理' : '已重新打开')
  await loadTickets()
}

onMounted(() => {
  loadTickets()
})
</script>

<template>
  <div class="page-container">
    <n-space vertical size="large">
      <n-card>
        <n-space vertical>
          <n-h1 style="margin: 0;">问题反馈</n-h1>
          <n-text>遇到数据错误、页面问题或功能建议，都可以在这里提交工单。也可以直接联系 admin@deceric.site。</n-text>
        </n-space>
      </n-card>

      <n-card title="提交工单">
        <n-space vertical>
          <FormField label="标题" example="北食堂某店铺关门、页面按钮挡住了">
            <n-input v-model:value="form.title" maxlength="80" show-count />
          </FormField>
          <FormField label="问题内容" example="尽量写清楚页面、店铺、菜品和你看到的问题">
            <n-input v-model:value="form.content" type="textarea" :autosize="{ minRows: 4 }" maxlength="1000" show-count />
          </FormField>
          <n-button type="primary" block :loading="loading" @click="submitTicket">提交反馈</n-button>
        </n-space>
      </n-card>

      <n-card v-if="auth.isAdmin.value" title="工单列表">
        <n-tabs type="segment" animated>
          <n-tab-pane name="open" :tab="`待处理 ${openTickets.length}`">
            <n-space v-if="openTickets.length" vertical>
              <n-card v-for="ticket in openTickets" :key="ticket.id" size="small">
                <n-space vertical>
                  <n-space justify="space-between" align="start">
                    <strong>{{ ticket.title }}</strong>
                    <n-button size="small" type="primary" @click="setTicketStatus(ticket.id, 'closed')">标记已处理</n-button>
                  </n-space>
                  <n-text>{{ ticket.content }}</n-text>
                  <div class="muted">{{ ticket.createdAt }}</div>
                </n-space>
              </n-card>
            </n-space>
            <n-empty v-else description="暂无待处理工单" />
          </n-tab-pane>
          <n-tab-pane name="closed" :tab="`已处理 ${closedTickets.length}`">
            <n-space v-if="closedTickets.length" vertical>
              <n-card v-for="ticket in closedTickets" :key="ticket.id" size="small">
                <n-space vertical>
                  <n-space justify="space-between" align="start">
                    <strong>{{ ticket.title }}</strong>
                    <n-button size="small" @click="setTicketStatus(ticket.id, 'open')">重新打开</n-button>
                  </n-space>
                  <n-text>{{ ticket.content }}</n-text>
                  <div class="muted">{{ ticket.createdAt }}</div>
                </n-space>
              </n-card>
            </n-space>
            <n-empty v-else description="暂无已处理工单" />
          </n-tab-pane>
        </n-tabs>
      </n-card>
    </n-space>
  </div>
</template>
