const { api } = require('../../utils/api')
const { showBusy, withFoodPage, toast } = require('../../utils/page')

withFoodPage({
  data: {
    name: '',
    campus: '良乡校区',
    kind: '食堂',
    description: '',
    editId: '',
    editMode: false,
    kinds: ['食堂', '宿舍楼下', '商业区', '其他地点']
  },
  afterFood() {
    const userCampus = this.data.user && this.data.user.defaultCampus
    if (!this.data.editMode) this.setData({ campus: userCampus || '良乡校区' })
  },
  methods: {
    bindInput(event) {
      this.setData({ [event.currentTarget.dataset.key]: event.detail.value })
    },
    setCampus(event) {
      this.setData({ campus: event.currentTarget.dataset.value })
    },
    onKind(event) {
      this.setData({ kind: this.data.kinds[event.detail.value] })
    },
    editArea(event) {
      const area = this.data.areas.find((item) => item.id === event.currentTarget.dataset.id)
      if (!area) return
      this.setData({
        editMode: true,
        editId: area.id,
        name: area.name,
        campus: area.campus,
        kind: area.kind,
        description: area.description
      })
      wx.pageScrollTo({ scrollTop: 0 })
    },
    resetForm() {
      this.setData({
        editMode: false,
        editId: '',
        name: '',
        campus: (this.data.user && this.data.user.defaultCampus) || '良乡校区',
        kind: '食堂',
        description: ''
      })
    },
    async submit() {
      if (!getApp().globalData.user) {
        wx.switchTab({ url: '/pages/profile/profile' })
        return
      }
      if (!this.data.name.trim()) {
        toast('区域名称不能为空')
        return
      }
      const payload = {
        name: this.data.name.trim(),
        campus: this.data.campus,
        kind: this.data.kind,
        description: this.data.description.trim() || '区域说明待补充。'
      }
      try {
        showBusy('提交中...')
        const message = this.data.editMode ? '区域已更新' : '区域已创建'
        if (this.data.editMode) {
          await api.post('/api/areas/update', { areaId: this.data.editId, ...payload })
        } else {
          await api.post('/api/areas', payload)
        }
        this.resetForm()
        await this.refreshFood(true)
        toast(message, 'success')
      } catch (error) {
        toast(error.message || '提交失败')
      }
    }
  }
})
