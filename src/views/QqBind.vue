<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/store/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const ticket = computed(() => String(route.query.ticket ?? ''))
const submitting = ref(false)
const bindAfterAuth = ref(false)

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

function loginOrRegisterAndBind() {
  bindAfterAuth.value = true
  auth.authModal.value = true
  window.$message.info('已有账号会直接登录；新邮箱会自动注册，随后完成 QQ 绑定')
}

watch(() => auth.user.value, (user) => {
  if (!user || !bindAfterAuth.value) return
  bindAfterAuth.value = false
  void bindCurrentAccount()
})

watch(() => auth.authModal.value, (show) => {
  if (!show && !auth.user.value) bindAfterAuth.value = false
})

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
        登录/绑定用于确认群聊记餐的归属，并把记录同步到你的个人记录。这里使用的是“吃在北理”网页和小程序共用的同一个 EatBit 账号，账号与数据互通，不是机器人单独创建的账号。已有账号可以直接登录并绑定；没有账号时，填写新邮箱和昵称会自动注册并绑定。
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
        <div>登录已有账号，或填写新邮箱和昵称自动注册。完成后会继续绑定当前 QQ。</div>
        <n-button type="primary" @click="loginOrRegisterAndBind">登录或注册并绑定</n-button>
      </n-space>
    </n-card>
  </div>
</template>

<style scoped>
.bind-page { max-width: 720px; padding-top: 36px; padding-bottom: 64px; }
.account-block { margin-top: 24px; }
</style>
