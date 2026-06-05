<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { darkTheme, lightTheme, NIcon, type MenuOption } from 'naive-ui'
import MenuRound from '@vicons/material/MenuRound'
import HomeOutlined from '@vicons/material/HomeOutlined'
import RestaurantOutlined from '@vicons/material/RestaurantOutlined'
import AdminPanelSettingsOutlined from '@vicons/material/AdminPanelSettingsOutlined'
import RefreshOutlined from '@vicons/material/RefreshOutlined'
import PersonOutlineOutlined from '@vicons/material/PersonOutlineOutlined'
import DarkModeOutlined from '@vicons/material/DarkModeOutlined'
import LightModeOutlined from '@vicons/material/LightModeOutlined'
import FeedbackOutlined from '@vicons/material/FeedbackOutlined'
import { useFoodStore } from '@/store/food'
import { useAuthStore } from '@/store/auth'
import AuthModal from '@/components/AuthModal.vue'

const router = useRouter()
const route = useRoute()
const drawer = ref(false)
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')
const themeMode = ref<'system' | 'light' | 'dark'>((localStorage.getItem('theme-mode') as 'system' | 'light' | 'dark') || 'system')
const systemDark = ref(prefersDark.matches)
const dark = computed(() => themeMode.value === 'system' ? systemDark.value : themeMode.value === 'dark')
const theme = computed(() => (dark.value ? darkTheme : lightTheme))
const food = useFoodStore()
const auth = useAuthStore()

function renderIcon(icon: unknown) {
  return () => h(NIcon, null, { default: () => h(icon as never) })
}

const menuOptions: MenuOption[] = [
  { label: '首页', key: '/home', icon: renderIcon(HomeOutlined) },
  { label: '店面发现', key: '/home?tab=search', icon: renderIcon(RestaurantOutlined) },
  { label: '个人中心', key: '/profile', icon: renderIcon(PersonOutlineOutlined) },
  { label: '问题反馈', key: '/feedback', icon: renderIcon(FeedbackOutlined) },
  { label: '食堂区管理', key: '/admin/canteens', icon: renderIcon(AdminPanelSettingsOutlined) }
]

function handleMenu(key: string) {
  drawer.value = false
  router.push(key)
}

function toTop() {
  window.scrollTo(0, 0)
}

function syncTheme(event: MediaQueryListEvent) {
  systemDark.value = event.matches
}

function toggleTheme() {
  themeMode.value = dark.value ? 'light' : 'dark'
}

onMounted(() => {
  prefersDark.addEventListener('change', syncTheme)
  auth.loadMe()
  food.loadFromApi()
})

watch(themeMode, (value) => {
  localStorage.setItem('theme-mode', value)
})

onBeforeUnmount(() => {
  prefersDark.removeEventListener('change', syncTheme)
})
</script>

<template>
  <n-config-provider :theme="theme">
    <n-global-style />
    <n-message-provider>
      <n-dialog-provider>
        <n-layout>
          <n-layout-header bordered class="app-header">
            <n-space class="container" justify="space-between" align="center">
              <n-space align="center" :wrap="false">
                <n-button circle text-color="#fff" type="primary" size="large" @click="drawer = true">
                  <template #icon>
                    <n-icon :component="MenuRound" size="28" />
                  </template>
                </n-button>
                <n-button text class="brand-button" @click="router.push('/home')">吃在北理</n-button>
              </n-space>

              <n-space align="center" :wrap="false">
                <n-button circle quaternary color="#fff" @click="router.go(-1)">←</n-button>
                <n-button circle quaternary color="#fff" @click="router.go(0)">
                  <template #icon>
                    <n-icon :component="RefreshOutlined" />
                  </template>
                </n-button>
                <n-button circle quaternary color="#fff" @click="toggleTheme">
                  <template #icon>
                    <n-icon :component="dark ? LightModeOutlined : DarkModeOutlined" />
                  </template>
                </n-button>
                <n-dropdown
                  v-if="auth.user.value"
                  :options="[
                    { label: auth.user.value.email, key: 'email', disabled: true },
                    { label: '个人中心', key: 'profile' },
                    { label: '退出登录', key: 'logout' }
                  ]"
                  @select="(key: string) => key === 'logout' ? auth.logout() : key === 'profile' && router.push('/profile')"
                >
                  <n-button quaternary color="#fff">{{ auth.user.value.nickname || auth.user.value.email }}</n-button>
                </n-dropdown>
                <n-button v-else quaternary color="#fff" @click="auth.authModal.value = true">登录</n-button>
              </n-space>
            </n-space>
          </n-layout-header>

          <n-drawer v-model:show="drawer" placement="left" :width="260">
            <n-drawer-content title="吃在北理" body-content-style="padding: 4px;">
              <n-menu :options="menuOptions" :value="route.fullPath" @update:value="handleMenu" />
            </n-drawer-content>
          </n-drawer>

          <n-layout-content class="app-content">
            <router-view v-slot="{ Component }">
              <keep-alive :max="12">
                <component :is="Component" v-if="route.meta.keepAlive !== false" :key="route.fullPath" />
              </keep-alive>
              <component :is="Component" v-if="route.meta.keepAlive === false" />
            </router-view>
          </n-layout-content>

          <n-layout-footer class="app-footer">
            <n-space vertical align="center">
              <span>把北理的食堂、窗口、留言和评分整理成一个可共建的校园美食社区。</span>
              <n-button text @click="toTop">回到顶部</n-button>
            </n-space>
          </n-layout-footer>
        </n-layout>
        <AuthModal />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>
