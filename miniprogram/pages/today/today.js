const { api } = require('../../utils/api')
const { showBusy, withFoodPage, toast } = require('../../utils/page')
const { compressImageToDataUrl } = require('../../utils/image')

const NEW_SHOP_ID = '__new_shop__'
const NEW_ITEM_ID = '__new_item__'

withFoodPage({
  data: {
    areaId: '',
    shopId: '',
    itemId: '',
    selectedAreaName: '',
    selectedShopName: '',
    selectedItemName: '',
    isAddingShop: false,
    isAddingItem: false,
    newShopName: '',
    newItemName: '',
    newItemPrice: '',
    mealSlot: '午餐',
    syncComment: false,
    score: 5,
    text: '',
    image: '',
    imageUploading: false,
    isAnonymous: true,
    areaOptions: [],
    shopOptions: [],
    itemOptions: [],
    scoreOptions: [1, 2, 3, 4, 5],
    mealSlots: ['早餐', '午餐', '晚餐', '其他']
  },
  afterFood() {
    this.buildOptions()
  },
  methods: {
    buildOptions() {
      const areaOptions = this.data.areas
      const shopOptions = [
        ...this.data.shops.filter((shop) => !this.data.areaId || shop.areaId === this.data.areaId),
        { id: NEW_SHOP_ID, name: '增加新店面' }
      ]
      const shop = this.data.shops.find((item) => item.id === this.data.shopId)
      const itemOptions = this.data.shopId
        ? [
            ...(shop ? (shop.items || []).filter((item) => !item.isOffShelf) : []),
            { id: NEW_ITEM_ID, name: '增加新菜品' }
          ]
        : []
      this.setData({ areaOptions, shopOptions, itemOptions })
    },
    bindInput(event) {
      this.setData({ [event.currentTarget.dataset.key]: event.detail.value })
    },
    onArea(event) {
      const area = this.data.areaOptions[event.detail.value]
      this.setData({
        areaId: area.id,
        shopId: '',
        itemId: '',
        selectedAreaName: area.name,
        selectedShopName: '',
        selectedItemName: '',
        isAddingShop: false,
        isAddingItem: false,
        newShopName: '',
        newItemName: '',
        newItemPrice: ''
      })
      this.buildOptions()
    },
    onShop(event) {
      const shop = this.data.shopOptions[event.detail.value]
      const isNewShop = shop.id === NEW_SHOP_ID
      this.setData({
        shopId: shop.id,
        itemId: isNewShop ? NEW_ITEM_ID : '',
        selectedShopName: shop.name,
        selectedItemName: isNewShop ? '增加新菜品' : '',
        isAddingShop: isNewShop,
        isAddingItem: isNewShop,
        newShopName: '',
        newItemName: '',
        newItemPrice: ''
      })
      this.buildOptions()
    },
    onItem(event) {
      const item = this.data.itemOptions[event.detail.value]
      const isNewItem = item.id === NEW_ITEM_ID
      this.setData({
        itemId: item.id,
        selectedItemName: item.name,
        isAddingItem: isNewItem,
        newItemName: '',
        newItemPrice: ''
      })
    },
    setMealSlot(event) {
      this.setData({ mealSlot: event.currentTarget.dataset.value })
    },
    setSync(event) {
      this.setData({ syncComment: event.currentTarget.dataset.value === 'true' })
    },
    setScore(event) {
      this.setData({ score: Number(event.currentTarget.dataset.score) })
    },
    setScoreByRate(event) {
      this.setData({ score: Number(event.detail) })
    },
    setAnonymous(event) {
      this.setData({ isAnonymous: event.currentTarget.dataset.value === 'true' })
    },
    async pickImage() {
      try {
        this.setData({ imageUploading: true })
        const image = await compressImageToDataUrl()
        if (image) {
          this.setData({ image })
          toast('图片已压缩', 'success')
        }
      } catch (error) {
        toast(error.message || '图片处理失败')
      } finally {
        this.setData({ imageUploading: false })
      }
    },
    removeImage() {
      this.setData({ image: '' })
    },
    async submit() {
      const isNewShop = this.data.shopId === NEW_SHOP_ID
      const isNewItem = this.data.itemId === NEW_ITEM_ID || isNewShop

      if (!getApp().globalData.user) {
        wx.switchTab({ url: '/pages/profile/profile' })
        return
      }
      if (!this.data.areaId) {
        toast('请选择区域')
        return
      }
      if (!this.data.shopId) {
        toast('请选择店面')
        return
      }
      if (isNewShop && !this.data.newShopName.trim()) {
        toast('请填写新店面名称')
        return
      }
      if (!this.data.itemId) {
        toast('请选择菜品')
        return
      }
      if (isNewItem && !this.data.newItemName.trim()) {
        toast('请填写新菜品名称')
        return
      }
      if (isNewItem && !this.data.newItemPrice.trim()) {
        toast('新菜品需要填写价格')
        return
      }
      if (this.data.syncComment && !this.data.text.trim()) {
        toast('同步评价时需要填写留言')
        return
      }

      try {
        showBusy('提交中...')
        let shopId = this.data.shopId
        if (isNewShop) {
          const shopData = await api.post('/api/shops', {
            areaId: this.data.areaId,
            name: this.data.newShopName.trim()
          })
          shopId = shopData.id
        }

        let itemId = this.data.itemId
        if (isNewItem) {
          const itemData = await api.post('/api/items', {
            shopId,
            name: this.data.newItemName.trim(),
            price: this.data.newItemPrice.trim()
          })
          itemId = itemData.id
        }

        await api.post('/api/comments', {
          shopId,
          itemId,
          score: this.data.score,
          text: this.data.syncComment ? this.data.text.trim() : '',
          image: this.data.syncComment ? this.data.image || undefined : undefined,
          isAnonymous: this.data.isAnonymous,
          isMealRecord: true,
          mealSlot: this.data.mealSlot,
          isPublicComment: this.data.syncComment
        })

        this.setData({
          shopId: '',
          itemId: '',
          selectedShopName: '',
          selectedItemName: '',
          isAddingShop: false,
          isAddingItem: false,
          newShopName: '',
          newItemName: '',
          newItemPrice: '',
          mealSlot: '午餐',
          syncComment: false,
          score: 5,
          text: '',
          image: '',
          imageUploading: false,
          isAnonymous: true
        })
        await this.refreshFood(true)
        toast('已记录', 'success')
      } catch (error) {
        toast(error.message || '提交失败')
      }
    }
  }
})
