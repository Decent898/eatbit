const { withFoodPage } = require('../../utils/page')
const { searchAll, shopScoreRank, shopHeatRank, itemScoreRank, itemHeatRank, averageScore } = require('../../utils/food')

withFoodPage({
  data: {
    keyword: '',
    campus: '良乡校区',
    shopResults: [],
    itemResults: [],
    shopScore: [],
    shopHeat: [],
    itemScore: [],
    itemHeat: []
  },
  afterFood() {
    const campus = (this.data.user && this.data.user.defaultCampus) || this.data.campus || '良乡校区'
    this.setData({ campus })
    this.buildRanks()
    this.doSearch()
  },
  methods: {
    setCampus(event) {
      this.setData({ campus: event.currentTarget.dataset.campus })
      this.buildRanks()
      this.doSearch()
    },
    onKeyword(event) {
      this.setData({ keyword: event.detail.value })
      this.doSearch()
    },
    campusMatched(area) {
      return this.data.campus === '全部' || (area && area.campus === this.data.campus)
    },
    buildRanks() {
      const filter = (list) => list.filter((entry) => this.campusMatched(entry.area))
      this.setData({
        shopScore: filter(shopScoreRank(this.data.shops, this.data.areas, 30)).slice(0, 8),
        shopHeat: filter(shopHeatRank(this.data.shops, this.data.areas, 30)).slice(0, 8),
        itemScore: filter(itemScoreRank(this.data.shops, this.data.areas, 30)).slice(0, 8),
        itemHeat: filter(itemHeatRank(this.data.shops, this.data.areas, 30)).slice(0, 8)
      })
    },
    doSearch() {
      const result = searchAll(this.data.keyword, this.data.shops, this.data.areas)
      const shopResults = result.shops
        .map((shop) => {
          const area = this.data.areas.find((item) => item.id === shop.areaId)
          return {
            shop,
            area,
            score: averageScore(shop) > 0 ? averageScore(shop).toFixed(1) : '暂无',
            commentCount: (shop.comments || []).filter((item) => item.isPublicComment !== false).length
          }
        })
        .filter((entry) => this.campusMatched(entry.area))
      const itemResults = result.items
        .filter((entry) => this.campusMatched(entry.area))
        .map((entry) => ({
          ...entry,
          scoreText: entry.score > 0 ? entry.score.toFixed(1) : '暂无'
        }))
      this.setData({ shopResults, itemResults })
    },
    goShop(event) {
      wx.navigateTo({ url: `/pages/shop/shop?id=${event.currentTarget.dataset.id}` })
    }
  }
})
