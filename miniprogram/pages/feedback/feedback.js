const { api } = require('../../utils/api')
const { showBusy, showShareMenu, toast } = require('../../utils/page')

Page({
  data: {
    title: '',
    content: '',
    submitting: false
  },
  onLoad() {
    showShareMenu()
  },
  bindInput(event) {
    this.setData({ [event.currentTarget.dataset.key]: event.detail.value })
  },
  onShareAppMessage() {
    return {
      title: '吃在北理',
      path: '/pages/home/home'
    }
  },
  onShareTimeline() {
    return {
      title: '吃在北理'
    }
  },
  async submit() {
    if (this.data.submitting) return
    if (!this.data.title.trim() || !this.data.content.trim()) {
      toast('请填写标题和内容')
      return
    }
    try {
      this.setData({ submitting: true })
      showBusy('提交中...')
      await api.post('/api/tickets', {
        title: this.data.title.trim(),
        content: this.data.content.trim()
      })
      this.setData({ title: '', content: '' })
      toast('已提交', 'success')
    } catch (error) {
      toast(error.message || '提交失败')
    } finally {
      this.setData({ submitting: false })
    }
  }
})
