const { api } = require('../../utils/api')
const { showBusy, withFoodPage, toast } = require('../../utils/page')
const { averageScore, itemAverageScore, itemCommentCount } = require('../../utils/food')
const { compressImageToDataUrl } = require('../../utils/image')

withFoodPage({
  data: {
    id: '',
    shop: null,
    area: null,
    itemModal: false,
    commentModal: false,
    itemName: '',
    itemPrice: '',
    commentText: '',
    commentScore: 5,
    commentItemId: '',
    commentImage: '',
    imageUploading: false,
    isAnonymous: true,
    isMealRecord: false,
    mealSlot: '午餐',
    scoreOptions: [1, 2, 3, 4, 5],
    mealSlots: ['早餐', '午餐', '晚餐', '其他']
  },
  onLoadBefore(options) {
    this.setData({ id: options.id || '' })
  },
  afterFood() {
    this.buildShop()
  },
  methods: {
    buildShop() {
      const shop = this.data.shops.find((item) => item.id === this.data.id)
      const area = shop ? this.data.areas.find((item) => item.id === shop.areaId) : null
      if (!shop) {
        this.setData({ shop: null, area: null })
        return
      }
      const nextShop = {
        ...shop,
        canDeleteShop: this.canDeleteShop(shop),
        scoreText: averageScore(shop) > 0 ? averageScore(shop).toFixed(1) : '暂无',
        publicComments: (shop.comments || []).filter((item) => item.isPublicComment !== false),
        items: (shop.items || []).map((item) => ({
          ...item,
          canDelete: this.canDeleteItem(item),
          scoreText: itemAverageScore(shop, item.id) > 0 ? itemAverageScore(shop, item.id).toFixed(1) : '暂无',
          commentCount: itemCommentCount(shop, item.id)
        }))
      }
      const itemMap = new Map(nextShop.items.map((item) => [item.id, item.name]))
      nextShop.publicComments = nextShop.publicComments.map((comment) => ({
        ...comment,
        itemName: comment.itemId ? itemMap.get(comment.itemId) || '' : '',
        canDelete: this.canDeleteComment(comment)
      }))
      this.setData({ shop: nextShop, area })
      wx.setNavigationBarTitle({ title: shop.name })
    },
    canDeleteShop(shop) {
      const user = getApp().globalData.user
      return Boolean(user && (user.role === 'admin' || shop.creatorUserId === user.id))
    },
    canDeleteItem(item) {
      const user = getApp().globalData.user
      return Boolean(user && (user.role === 'admin' || item.creatorUserId === user.id))
    },
    canDeleteComment(comment) {
      const user = getApp().globalData.user
      return Boolean(user && (user.role === 'admin' || comment.userId === user.id))
    },
    openItemModal() {
      if (!getApp().globalData.user) {
        wx.switchTab({ url: '/pages/profile/profile' })
        return
      }
      this.setData({ itemModal: true })
    },
    closeItemModal() {
      this.setData({ itemModal: false, itemName: '', itemPrice: '' })
    },
    openCommentModal(event) {
      if (!getApp().globalData.user) {
        wx.switchTab({ url: '/pages/profile/profile' })
        return
      }
      this.setData({ commentModal: true, commentItemId: event.currentTarget.dataset.itemId || '' })
    },
    closeCommentModal() {
      this.setData({
        commentModal: false,
        commentText: '',
        commentScore: 5,
        commentItemId: '',
        commentImage: '',
        imageUploading: false,
        isAnonymous: true,
        isMealRecord: false,
        mealSlot: '午餐'
      })
    },
    bindInput(event) {
      this.setData({ [event.currentTarget.dataset.key]: event.detail.value })
    },
    previewImage(event) {
      const current = event.currentTarget.dataset.src
      if (!current) return
      const urls = [this.data.shop && this.data.shop.image]
        .concat((this.data.shop && this.data.shop.publicComments || []).map((item) => item.image))
        .filter(Boolean)
      wx.previewImage({
        current,
        urls: urls.length ? urls : [current]
      })
    },
    setScore(event) {
      this.setData({ commentScore: Number(event.currentTarget.dataset.score) })
    },
    setScoreByRate(event) {
      this.setData({ commentScore: Number(event.detail) })
    },
    setAnonymous(event) {
      this.setData({ isAnonymous: event.currentTarget.dataset.value === 'true' })
    },
    setMealRecord(event) {
      this.setData({ isMealRecord: event.currentTarget.dataset.value === 'true' })
    },
    setMealSlot(event) {
      this.setData({ mealSlot: event.currentTarget.dataset.value })
    },
    setCommentItem(event) {
      const item = this.data.shop.items[Number(event.detail.value)]
      this.setData({ commentItemId: item ? item.id : '' })
    },
    async pickShopImage() {
      if (!getApp().globalData.user) {
        wx.switchTab({ url: '/pages/profile/profile' })
        return
      }
      try {
        this.setData({ imageUploading: true })
        const image = await compressImageToDataUrl()
        if (!image) return
        showBusy('保存中...')
        await api.post('/api/shops/image', { shopId: this.data.id, image })
        await this.refreshFood(true)
        toast('店铺图片已更新', 'success')
      } catch (error) {
        toast(error.message || '图片处理失败')
      } finally {
        this.setData({ imageUploading: false })
      }
    },
    async pickCommentImage() {
      try {
        this.setData({ imageUploading: true })
        const image = await compressImageToDataUrl()
        if (image) {
          this.setData({ commentImage: image })
          toast('图片已压缩', 'success')
        }
      } catch (error) {
        toast(error.message || '图片处理失败')
      } finally {
        this.setData({ imageUploading: false })
      }
    },
    removeCommentImage() {
      this.setData({ commentImage: '' })
    },
    async submitItem() {
      if (!this.data.itemName.trim()) {
        toast('菜品名称不能为空')
        return
      }
      try {
        showBusy('提交中...')
        await api.post('/api/items', {
          shopId: this.data.id,
          name: this.data.itemName.trim(),
          price: this.data.itemPrice.trim()
        })
        this.closeItemModal()
        await this.refreshFood(true)
        toast('菜品已添加', 'success')
      } catch (error) {
        toast(error.message || '添加失败')
      }
    },
    async submitComment() {
      if (!this.data.commentText.trim()) {
        toast('留言不能为空')
        return
      }
      try {
        showBusy('提交中...')
        await api.post('/api/comments', {
          shopId: this.data.id,
          itemId: this.data.commentItemId || undefined,
          score: this.data.commentScore,
          text: this.data.commentText.trim(),
          image: this.data.commentImage || undefined,
          isAnonymous: this.data.isAnonymous,
          isMealRecord: this.data.isMealRecord,
          mealSlot: this.data.isMealRecord ? this.data.mealSlot : ''
        })
        this.closeCommentModal()
        await this.refreshFood(true)
        toast('评价已发布', 'success')
      } catch (error) {
        toast(error.message || '发布失败')
      }
    },
    async toggleShopStatus() {
      const shop = this.data.shop
      if (!shop) return
      wx.showModal({
        title: shop.isClosed ? '恢复营业？' : '标记关门？',
        content: shop.isClosed ? '店面会恢复为营业中，菜品需要按实际情况手动恢复上架。' : '店面会显示已关门，下面所有菜品也会自动下架。',
        confirmText: shop.isClosed ? '恢复' : '关门',
        success: async (res) => {
          if (!res.confirm) return
          try {
            showBusy('处理中...')
            await api.post('/api/shops/status', { shopId: shop.id, isClosed: !shop.isClosed })
            await this.refreshFood(true)
            toast(shop.isClosed ? '已恢复营业' : '已标记关门', 'success')
          } catch (error) {
            toast(error.message || '操作失败')
          }
        }
      })
    },
    async toggleItemStatus(event) {
      const item = this.data.shop.items.find((entry) => entry.id === event.currentTarget.dataset.id)
      if (!item) return
      wx.showModal({
        title: item.isOffShelf ? '恢复上架？' : '标记下架？',
        content: item.isOffShelf ? '菜品会恢复为可引用状态。' : '菜品会显示已下架，评价时不能再引用它。',
        confirmText: item.isOffShelf ? '恢复' : '下架',
        success: async (res) => {
          if (!res.confirm) return
          try {
            showBusy('处理中...')
            await api.post('/api/items/status', { itemId: item.id, isOffShelf: !item.isOffShelf })
            await this.refreshFood(true)
            toast(item.isOffShelf ? '已恢复上架' : '已标记下架', 'success')
          } catch (error) {
            toast(error.message || '操作失败')
          }
        }
      })
    },
    deleteShop() {
      const shop = this.data.shop
      if (!shop || !shop.canDeleteShop) return
      wx.showModal({
        title: '确认删除店面？',
        content: `会删除“${shop.name}”和它下面的菜品、评价。这个操作不能撤销。`,
        confirmText: '删除',
        confirmColor: '#d03050',
        success: async (res) => {
          if (!res.confirm) return
          try {
            showBusy('删除中...')
            await api.delete('/api/shops', { shopId: shop.id })
            await this.refreshFood(true)
            toast('店面已删除', 'success')
            wx.navigateBack()
          } catch (error) {
            toast(error.message || '删除失败')
          }
        }
      })
    },
    deleteItem(event) {
      const item = this.data.shop.items.find((entry) => entry.id === event.currentTarget.dataset.id)
      if (!item || !item.canDelete) return
      wx.showModal({
        title: '确认删除菜品？',
        content: `会删除“${item.name}”，已有评价会保留但不再引用这个菜品。`,
        confirmText: '删除',
        confirmColor: '#d03050',
        success: async (res) => {
          if (!res.confirm) return
          try {
            showBusy('删除中...')
            await api.delete('/api/items', { itemId: item.id })
            await this.refreshFood(true)
            toast('菜品已删除', 'success')
          } catch (error) {
            toast(error.message || '删除失败')
          }
        }
      })
    },
    deleteComment(event) {
      const comment = this.data.shop.publicComments.find((entry) => entry.id === Number(event.currentTarget.dataset.id))
      if (!comment || !comment.canDelete) return
      wx.showModal({
        title: '确认删除评论？',
        content: '这条评分留言会被删除，操作不能撤销。',
        confirmText: '删除',
        confirmColor: '#d03050',
        success: async (res) => {
          if (!res.confirm) return
          try {
            showBusy('删除中...')
            await api.delete('/api/comments', { commentId: comment.id })
            await this.refreshFood(true)
            toast('评论已删除', 'success')
          } catch (error) {
            toast(error.message || '删除失败')
          }
        }
      })
    }
  }
})
