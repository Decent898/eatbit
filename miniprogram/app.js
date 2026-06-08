const { api } = require('./utils/api')
const { buildDerivedData } = require('./utils/food')

App({
  globalData: {
    user: null,
    areas: [],
    shops: [],
    loaded: false
  },

  onLaunch() {
    this.bootstrap()
  },

  async bootstrap() {
    await Promise.all([this.loadMe(), this.loadFood()])
  },

  async loadMe() {
    try {
      const data = await api.get('/api/auth/me')
      this.globalData.user = data.user || null
      return this.globalData.user
    } catch (error) {
      this.globalData.user = null
      return null
    }
  },

  async loadFood() {
    const [areaData, shopData] = await Promise.all([
      api.get('/api/areas'),
      api.get('/api/shops')
    ])
    this.globalData.areas = areaData.areas || []
    this.globalData.shops = buildDerivedData(shopData.shops || [])
    this.globalData.loaded = true
    return {
      areas: this.globalData.areas,
      shops: this.globalData.shops
    }
  },

  async ensureFood() {
    if (!this.globalData.loaded) return this.loadFood()
    return {
      areas: this.globalData.areas,
      shops: this.globalData.shops
    }
  },

  async requireLogin() {
    if (this.globalData.user) return true
    wx.showModal({
      title: '需要登录',
      content: '登录后可以添加、评价和记录今天吃了什么。',
      confirmText: '去登录',
      success: (res) => {
        if (res.confirm) wx.switchTab({ url: '/pages/profile/profile' })
      }
    })
    return false
  }
})
