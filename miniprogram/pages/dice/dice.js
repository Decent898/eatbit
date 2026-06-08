const { withFoodPage, toast } = require('../../utils/page')
const { allItemsWithShop } = require('../../utils/food')

withFoodPage({
  data: {
    campus: '良乡校区',
    selectedAreaIds: [],
    areaOptions: [],
    poolCount: 0,
    rolling: false,
    result: null
  },
  afterFood() {
    const campus = (this.data.user && this.data.user.defaultCampus) || this.data.campus || '良乡校区'
    this.setData({ campus })
    this.buildOptions()
    this.buildPool()
  },
  methods: {
    setCampus(event) {
      this.setData({ campus: event.currentTarget.dataset.campus, selectedAreaIds: [], result: null })
      this.buildOptions()
      this.buildPool()
    },
    buildOptions() {
      const areaOptions = this.data.areas
        .filter((area) => this.data.campus === '全部' || area.campus === this.data.campus)
        .map((area) => ({
          ...area,
          checked: this.data.selectedAreaIds.includes(area.id)
        }))
      this.setData({ areaOptions })
    },
    buildPool() {
      const selected = this.data.selectedAreaIds
      const pool = allItemsWithShop(this.data.shops, this.data.areas).filter((entry) => {
        if (entry.shop.isClosed || entry.item.isOffShelf) return false
        if (selected.length > 0) return selected.includes(entry.area && entry.area.id)
        return this.data.campus === '全部' || (entry.area && entry.area.campus === this.data.campus)
      })
      this._pool = pool
      this.setData({ poolCount: pool.length })
    },
    toggleArea(event) {
      const id = event.currentTarget.dataset.id
      const set = new Set(this.data.selectedAreaIds)
      if (set.has(id)) set.delete(id)
      else set.add(id)
      this.setData({ selectedAreaIds: Array.from(set), result: null })
      this.buildOptions()
      this.buildPool()
    },
    clearAreas() {
      this.setData({ selectedAreaIds: [], result: null })
      this.buildOptions()
      this.buildPool()
    },
    roll() {
      this.buildPool()
      if (!this._pool || this._pool.length === 0) {
        toast('还没有可选菜品')
        return
      }
      this.setData({ rolling: true, result: null })
      setTimeout(() => {
        const picked = this._pool[Math.floor(Math.random() * this._pool.length)]
        this.setData({
          rolling: false,
          result: {
            ...picked,
            scoreText: picked.score > 0 ? picked.score.toFixed(1) : '暂无'
          }
        })
      }, 650)
    },
    goResult() {
      if (!this.data.result) return
      wx.navigateTo({ url: `/pages/shop/shop?id=${this.data.result.shop.id}` })
    }
  }
})
