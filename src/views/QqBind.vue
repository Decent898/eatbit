<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/store/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const ticket = computed(() => String(route.query.ticket ?? ''))
const submitting = ref(false)

onMounted(() => auth.loadMe())

async function bindCurrentAccount() {
  if (!auth.user.value) {
    auth.authModal.value = true
    window.$message.info('请先登录你原来的 EatBit 账号，登录后再确认绑定')
    return
  }
  if (!ticket.value) {
    window.$message.error('绑定链接无效，请重新向机器人发送“绑定”')
    return
  }
  submitting.value = true
  try {
    const response = await fetch('/api/auth/qq-bind', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticket: ticket.value })
    })
    const data = await response.json().catch(() => ({ error: '绑定失败' })) as { error?: string }
    if (!response.ok) throw new Error(data.error || '绑定失败')
    window.$message.success('QQ 已绑定到当前 EatBit 账号')
    await router.replace('/profile')
  } catch (error) {
    window.$message.error(error instanceof Error ? error.message : '绑定失败')
  } finally {
    submitting.value = false
  }
}

async function switchAccount() {
  await auth.logout()
  auth.authModal.value = true
  window.$message.info('请登录你希望绑定的 EatBit 账号')
}
</script>

<template>
  <div class="container bind-page">
    <n-card title="绑定 QQ 到 EatBit" size="large">
      <n-alert type="warning" :bordered="false">
        绑定只会关联你明确确认的现有 EatBit 账号，不会再自动创建同名账号。
      </n-alert>
      <n-space v-if="auth.user.value" vertical size="large" class="account-block">
        <div>当前 EatBit 账号</div>
        <n-descriptions bordered :column="1">
          <n-descriptions-item label="昵称">{{ auth.user.value.nickname }}</n-descriptions-item>
          <n-descriptions-item label="邮箱">{{ auth.user.value.email }}</n-descriptions-item>
        </n-descriptions>
        <n-space>
          <n-button type="primary" :loading="submitting" @click="bindCurrentAccount">确认绑定到这个账号</n-button>
          <n-button @click="switchAccount">切换账号</n-button>
        </n-space>
      </n-space>
      <n-space v-else vertical size="large" class="account-block">
        <div>请先登录你原来的 EatBit 账号，再回来确认绑定。</div>
        <n-button type="primary" @click="bindCurrentAccount">登录现有账号</n-button>
      </n-space>
    </n-card>
  </div>
</template>

<style scoped>
.bind-page { max-width: 720px; padding-top: 36px; padding-bottom: 64px; }
.account-block { margin-top: 24px; }
</style>
