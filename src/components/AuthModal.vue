<script setup lang="ts">
import { reactive } from 'vue'
import { useAuthStore } from '@/store/auth'
import FormField from '@/components/FormField.vue'

const auth = useAuthStore()
const form = reactive({
  email: '',
  nickname: ''
})

async function submit() {
  const email = form.email.trim()
  const nickname = form.nickname.trim()

  if (!email && !nickname) {
    window.$message.warning('请输入昵称或邮箱')
    return
  }
  if (email && !email.includes('@')) {
    window.$message.warning('请输入有效邮箱')
    return
  }
  if (nickname.length > 20) {
    window.$message.warning('昵称最多 20 个字')
    return
  }

  try {
    await auth.login(email, nickname)
    window.$message.success('登录成功')
  } catch (error) {
    const message = error instanceof Error ? error.message : '登录失败，请稍后再试'
    if (message.includes('nickname duplicated')) {
      window.$message.warning('这个昵称不唯一，请补充邮箱登录')
    } else if (message.includes('email is required')) {
      window.$message.warning('新账号第一次登录需要填写邮箱')
    } else {
      window.$message.error('登录失败，请稍后再试')
    }
  }
}
</script>

<template>
  <n-modal v-model:show="auth.authModal.value" preset="card" title="登录" style="width: min(92vw, 420px);">
    <n-space vertical>
      <FormField label="昵称">
        <n-input v-model:value="form.nickname" maxlength="20" show-count @keyup.enter="submit" />
      </FormField>
      <FormField label="邮箱">
        <n-input v-model:value="form.email" @keyup.enter="submit" />
      </FormField>
      <n-alert type="info" :show-icon="false">
        可以只输入昵称或邮箱登录；如果昵称重复，就需要补充邮箱。新账号第一次登录需要邮箱。
      </n-alert>
      <n-button type="primary" block :loading="auth.loading.value" @click="submit">进入吃在北理</n-button>
    </n-space>
  </n-modal>
</template>
