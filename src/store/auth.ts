import { computed, reactive } from 'vue'

export interface AuthUser {
  id: number
  email: string
  nickname: string
  role: 'user' | 'admin'
  defaultCampus?: '良乡校区' | '中关村校区'
}

const state = reactive({
  user: null as AuthUser | null,
  loading: false,
  authModal: false,
  profileModal: false
})

async function loadMe() {
  try {
    const response = await fetch('/api/auth/me')
    if (!response.ok) return
    const data = await response.json() as { user: AuthUser | null }
    state.user = data.user
  } catch {
    state.user = null
  }
}

async function login(email: string, nickname: string) {
  state.loading = true
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, nickname })
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'login failed' })) as { error?: string }
      throw new Error(data.error || 'login failed')
    }
    const data = await response.json() as { user: AuthUser }
    state.user = data.user
    state.authModal = false
  } finally {
    state.loading = false
  }
}

async function updateProfile(nickname: string, closeModal = true, defaultCampus?: '良乡校区' | '中关村校区') {
  state.loading = true
  try {
    const response = await fetch('/api/auth/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nickname, defaultCampus })
    })
    if (!response.ok) throw new Error('profile update failed')
    const data = await response.json() as { user: AuthUser }
    state.user = data.user
    if (closeModal) state.profileModal = false
  } finally {
    state.loading = false
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' })
  state.user = null
}

function requireLogin() {
  if (state.user) return true
  state.authModal = true
  window.$message.warning('登录后才能新增、修改或评价')
  return false
}

export function useAuthStore() {
  return {
    user: computed(() => state.user),
    isAdmin: computed(() => state.user?.role === 'admin'),
    loading: computed(() => state.loading),
    authModal: computed({
      get: () => state.authModal,
      set: (value) => { state.authModal = value }
    }),
    profileModal: computed({
      get: () => state.profileModal,
      set: (value) => { state.profileModal = value }
    }),
    loadMe,
    login,
    updateProfile,
    logout,
    requireLogin
  }
}
