const { api } = require('../../utils/api')
const { showBusy, withFoodPage, toast } = require('../../utils/page')
const { averageScore } = require('../../utils/food')
const { compressImageToDataUrl } = require('../../utils/image')

withFoodPage({
  data: {
    id: '',
    area: null,
    areaShops: [],
    shopModal: false,
    shopName: '',
    shopImage: '',
    imageUploading: false
  },
  onLoadBefore(options) {
    this.setData({ id: options.id || '' })
  },
  afterFood() {
    this.buildArea()
  },
  methods: {
    buildArea() {
      const area = this.data.areas.find((item) => item.id === this.data.id)
      const areaShops = this.data.shops
        .filter((shop) => shop.areaId === this.data.id)
        .sort((a, b) => Number(a.isClosed) - Number(b.isClosed) || averageScore(b) - averageScore(a))
        .map((shop) => ({
          ...shop,
          scoreText: averageScore(shop) > 0 ? averageScore(shop).toFixed(1) : '暂无',
          commentCount: (shop.comments || []).filter((item) => item.isPublicComment !== false).length,
          itemCount: (shop.items || []).length
        }))
      this.setData({ area, areaShops })
      if (area) wx.setNavigationBarTitle({ title: area.name })
    },
    goShop(event) {
      wx.navigateTo({ url: `/pages/shop/shop?id=${event.currentTarget.dataset.id}` })
    },
    openAddShop() {
      const app = getApp()
      if (!app.globalData.user) {
        wx.switchTab({ url: '/pages/profile/profile' })
        return
      }
      this.setData({ shopModal: true })
    },
    closeAddShop() {
      this.setData({ shopModal: false, shopName: '', shopImage: '', imageUploading: false })
    },
    onShopName(event) {
      this.setData({ shopName: event.detail.value })
    },
    async pickShopImage() {
      try {
        this.setData({ imageUploading: true })
        const image = await compressImageToDataUrl()
        if (image) {
          this.setData({ shopImage: image })
          toast('图片已压缩', 'success')
        }
      } catch (error) {
        toast(error.message || '图片处理失败')
      } finally {
        this.setData({ imageUploading: false })
      }
    },
    removeShopImage() {
      this.setData({ shopImage: '' })
    },
    async submitShop() {
      if (!this.data.shopName.trim()) {
        toast('店面名称不能为空')
        return
      }
      try {
        showBusy('提交中...')
        const data = await api.post('/api/shops', {
          areaId: this.data.id,
          name: this.data.shopName.trim(),
          image: this.data.shopImage || undefined
        })
        this.closeAddShop()
        await this.refreshFood(true)
        toast('店面已添加', 'success')
        setTimeout(() => {
          wx.navigateTo({ url: `/pages/shop/shop?id=${data.id}` })
        }, 650)
      } catch (error) {
        toast(error.message || '添加失败')
      }
    }
  }
})
