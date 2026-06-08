const { api } = require('../../utils/api')
const { showBusy, withFoodPage, toast } = require('../../utils/page')

withFoodPage({
  data: {
    nickname: '',
    email: '',
    defaultCampus: '良乡校区',
    mealRows: [],
    stats: {
      total: 0,
      average: '0.0',
      favoriteShop: '还没有',
      favoriteItem: '还没有'
    }
  },
  afterFood() {
    this.syncUser()
    this.buildStats()
  },
  onShowReady() {
    this.syncUser()
    this.buildStats()
  },
  methods: {
    syncUser() {
      const user = getApp().globalData.user
      if (user) {
        this.setData({
          nickname: user.nickname || '',
          email: user.email || '',
          defaultCampus: user.defaultCampus || '良乡校区'
        })
      }
    },
    bindInput(event) {
      this.setData({ [event.currentTarget.dataset.key]: event.detail.value })
    },
    setCampus(event) {
      this.setData({ defaultCampus: event.currentTarget.dataset.value })
    },
    async login() {
      if (!this.data.nickname.trim() && !this.data.email.trim()) {
        toast('请输入昵称或邮箱')
        return
      }
      try {
        showBusy('登录中...')
        const data = await api.post('/api/auth/login', {
          nickname: this.data.nickname.trim() || undefined,
          email: this.data.email.trim() || undefined
        })
        getApp().globalData.user = data.user
        this.setData({
          nickname: data.user.nickname || '',
          email: data.user.email || '',
          defaultCampus: data.user.defaultCampus || '良乡校区',
          user: data.user
        })
        this.buildStats()
        toast('已登录', 'success')
      } catch (error) {
        toast(error.message === 'nickname duplicated, email required' ? '昵称重复，请填写邮箱' : error.message || '登录失败')
      }
    },
    submitAuth() {
      if (getApp().globalData.user) this.saveProfile()
      else this.login()
    },
    async saveProfile() {
      if (!getApp().globalData.user) {
        await this.login()
        return
      }
      if (!this.data.nickname.trim()) {
        toast('昵称不能为空')
        return
      }
      try {
        showBusy('保存中...')
        const data = await api.post('/api/auth/profile', {
          nickname: this.data.nickname.trim(),
          defaultCampus: this.data.defaultCampus
        })
        getApp().globalData.user = data.user
        this.setData({ user: data.user })
        this.syncUser()
        this.buildStats()
        toast('已保存', 'success')
      } catch (error) {
        if (error.message === 'login required') {
          wx.removeStorageSync('session')
          getApp().globalData.user = null
          this.setData({ user: null })
          toast('登录状态过期，请重新登录')
        } else {
          toast(error.message || '保存失败')
        }
      }
    },
    async logout() {
      try {
        showBusy('退出中...')
        await api.post('/api/auth/logout', {})
        wx.removeStorageSync('session')
        getApp().globalData.user = null
        this.setData({
          user: null,
          nickname: '',
          email: '',
          mealRows: [],
          stats: {
            total: 0,
            average: '0.0',
            favoriteShop: '还没有',
            favoriteItem: '还没有'
          }
        })
        toast('已退出', 'success')
      } catch (error) {
        toast(error.message || '退出失败')
      }
    },
    buildStats() {
      const user = getApp().globalData.user
      if (!user) return
      const records = []
      for (const shop of this.data.shops) {
        for (const comment of shop.comments || []) {
          if (comment.userId === user.id && comment.isMealRecord) {
            const item = (shop.items || []).find((entry) => entry.id === comment.itemId)
            records.push({
              ...comment,
              shopId: shop.id,
              shopName: shop.name,
              itemName: item ? item.name : '未选菜品'
            })
          }
        }
      }
      const average = records.length ? (records.reduce((sum, item) => sum + Number(item.score || 0), 0) / records.length).toFixed(1) : '0.0'
      const shopCounts = {}
      const itemCounts = {}
      records.forEach((record) => {
        shopCounts[record.shopName] = (shopCounts[record.shopName] || 0) + 1
        itemCounts[record.itemName] = (itemCounts[record.itemName] || 0) + 1
      })
      const favoriteShop = Object.entries(shopCounts).sort((a, b) => b[1] - a[1])[0]
      const favoriteItem = Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0]
      const byDate = {}
      records
        .sort((a, b) => String(b.createTime).localeCompare(String(a.createTime)))
        .forEach((record) => {
          const date = String(record.createTime).slice(0, 10)
          const slot = ['早餐', '午餐', '晚餐', '其他'].includes(record.mealSlot) ? record.mealSlot : '午餐'
          byDate[date] = byDate[date] || { date, 早餐: [], 午餐: [], 晚餐: [], 其他: [] }
          byDate[date][slot].push(`${record.itemName} @ ${record.shopName}`)
        })
      const mealRows = Object.values(byDate).slice(0, 7).map((row) => ({
        ...row,
        breakfastText: row.早餐.length ? row.早餐.join('\n') : '未记录',
        lunchText: row.午餐.length ? row.午餐.join('\n') : '未记录',
        dinnerText: row.晚餐.length ? row.晚餐.join('\n') : '未记录',
        otherText: row.其他.length ? row.其他.join('\n') : '未记录'
      }))
      this.setData({
        stats: {
          total: records.length,
          average,
          favoriteShop: favoriteShop ? `${favoriteShop[0]} · ${favoriteShop[1]}次` : '还没有',
          favoriteItem: favoriteItem ? `${favoriteItem[0]} · ${favoriteItem[1]}次` : '还没有'
        },
        mealRows
      })
    }
  }
})
