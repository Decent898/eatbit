import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/home'
    },
    {
      path: '/home',
      name: 'home',
      component: () => import('@/views/Home.vue')
    },
    {
      path: '/shop/:id',
      name: 'shop',
      component: () => import('@/views/ShopShow.vue'),
      meta: { keepAlive: false }
    },
    {
      path: '/area/:id',
      name: 'area',
      component: () => import('@/views/AreaShow.vue')
    },
    {
      path: '/admin',
      name: 'admin-dashboard',
      component: () => import('@/views/AdminDashboard.vue'),
      meta: { keepAlive: false }
    },
    {
      path: '/admin/canteens',
      name: 'admin-canteens',
      component: () => import('@/views/AdminCanteens.vue'),
      meta: { keepAlive: false }
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/Profile.vue'),
      meta: { keepAlive: false }
    },
    {
      path: '/feedback',
      name: 'feedback',
      component: () => import('@/views/Feedback.vue'),
      meta: { keepAlive: false }
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFound.vue')
    }
  ],
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0 }
  }
})

router.beforeEach((to) => {
  const titleMap: Record<string, string> = {
    home: '吃在北理',
    area: '区域店面',
    shop: '店面详情',
    profile: '个人中心',
    feedback: '问题反馈',
    'admin-dashboard': '管理员后台',
    'admin-canteens': '食堂区管理',
    'not-found': '页面不存在'
  }
  document.title = `${titleMap[String(to.name)] ?? '吃在北理'} | BIT Food`
})

export default router
