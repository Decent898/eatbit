function showBusy(title = '提交中...') {
  wx.showLoading({
    title,
    mask: true
  })
}

function hideBusy() {
  wx.hideLoading()
}

function toast(title, icon = 'none') {
  hideBusy()
  wx.showToast({ title, icon })
}

function showShareMenu() {
  if (!wx.showShareMenu) return
  try {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
  } catch (error) {
    wx.showShareMenu({ withShareTicket: true })
  }
}

function defaultShare() {
  return {
    title: '吃在北理',
    path: '/pages/home/home'
  }
}

function getAppData() {
  const app = getApp()
  return app.globalData
}

function withFoodPage(pageOptions) {
  return Page({
    data: {
      loading: true,
      user: null,
      areas: [],
      shops: [],
      ...(pageOptions.data || {})
    },
    async onLoad(options) {
      showShareMenu()
      if (pageOptions.onLoadBefore) pageOptions.onLoadBefore.call(this, options)
      await this.refreshFood()
      if (pageOptions.onLoaded) pageOptions.onLoaded.call(this, options)
    },
    async onShow() {
      const app = getApp()
      this.setData({ user: app.globalData.user || null })
      if (pageOptions.onShowReady) pageOptions.onShowReady.call(this)
    },
    async onPullDownRefresh() {
      await this.refreshFood(true)
      wx.stopPullDownRefresh()
    },
    async refreshFood(force = false) {
      const app = getApp()
      try {
        if (force) app.globalData.loaded = false
        const data = await app.ensureFood()
        this.setData({
          loading: false,
          user: app.globalData.user || null,
          areas: data.areas,
          shops: data.shops
        })
        if (pageOptions.afterFood) pageOptions.afterFood.call(this)
      } catch (error) {
        this.setData({ loading: false })
        toast('加载失败')
      }
    },
    onShareAppMessage(event) {
      return defaultShare()
    },
    onShareTimeline() {
      return {
        title: '吃在北理'
      }
    },
    ...(pageOptions.methods || {})
  })
}

module.exports = {
  defaultShare,
  hideBusy,
  toast,
  getAppData,
  showBusy,
  showShareMenu,
  withFoodPage
}
