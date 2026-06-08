const { withFoodPage } = require('../../utils/page')
const { averageScore } = require('../../utils/food')

withFoodPage({
  data: {
    campus: '良乡校区',
    visibleAreas: []
  },
  afterFood() {
    const userCampus = this.data.user && this.data.user.defaultCampus
    const campus = this.data.campus || userCampus || '良乡校区'
    this.setData({ campus })
    this.applyFilter()
  },
  methods: {
    setCampus(event) {
      this.setData({ campus: event.currentTarget.dataset.campus })
      this.applyFilter()
    },
    applyFilter() {
      const visibleAreas = this.data.areas
        .filter((area) => this.data.campus === '全部' || area.campus === this.data.campus)
        .map((area) => {
          const shops = this.data.shops.filter((shop) => shop.areaId === area.id)
          const scored = shops.filter((shop) => (shop.comments || []).length > 0)
          const score = scored.length ? Math.round(scored.reduce((sum, shop) => sum + averageScore(shop), 0) / scored.length * 10) / 10 : 0
          return {
            ...area,
            shopCount: shops.length,
            score: score > 0 ? score.toFixed(1) : '暂无'
          }
        })
      this.setData({ visibleAreas })
    },
    goArea(event) {
      wx.navigateTo({ url: `/pages/area/area?id=${event.currentTarget.dataset.id}` })
    },
    goManage() {
      wx.navigateTo({ url: '/pages/areaManage/areaManage' })
    },
    goFeedback() {
      wx.navigateTo({ url: '/pages/feedback/feedback' })
    }
  }
})
