<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="page-container">
    <n-result status="404" title="页面不存在" description="这个页面暂时还没有被做出来。">
      <template #footer>
        <n-button type="primary" @click="router.push('/home')">回到首页</n-button>
      </template>
    </n-result>
  </div>
</template>
