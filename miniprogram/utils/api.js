const BASE_URL = 'https://eat.bitdate.date'

function getCookieHeader() {
  const session = wx.getStorageSync('session')
  return session ? `session=${session}` : ''
}

function saveSessionToken(token) {
  if (token) wx.setStorageSync('session', String(token))
}

function saveSessionFromHeader(header = {}) {
  const raw = header['Set-Cookie'] || header['set-cookie']
  if (!raw) return
  const match = String(raw).match(/session=([^;]+)/)
  if (match) saveSessionToken(decodeURIComponent(match[1]))
}

function request(path, options = {}) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`
  const header = {
    'content-type': 'application/json',
    ...(options.header || {})
  }
  const cookie = getCookieHeader()
  if (cookie) {
    header.Cookie = cookie
    header.cookie = cookie
    header['X-Session-Token'] = wx.getStorageSync('session')
    header.Authorization = `Bearer ${wx.getStorageSync('session')}`
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: options.method || 'GET',
      data: options.data,
      header,
      timeout: 20000,
      success(res) {
        saveSessionFromHeader(res.header)
        if (res.data && res.data.token) saveSessionToken(res.data.token)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data || {})
        } else {
          if (res.statusCode === 401) {
            wx.removeStorageSync('session')
            const app = getApp({ allowDefault: true })
            if (app && app.globalData) app.globalData.user = null
          }
          const message = res.data && res.data.error ? res.data.error : `请求失败 ${res.statusCode}`
          reject(new Error(message))
        }
      },
      fail(error) {
        reject(error)
      }
    })
  })
}

const api = {
  baseUrl: BASE_URL,
  get(path) {
    return request(path)
  },
  post(path, data) {
    return request(path, { method: 'POST', data })
  },
  patch(path, data) {
    return request(path, { method: 'PATCH', data })
  },
  delete(path, data) {
    return request(path, { method: 'DELETE', data })
  }
}

module.exports = {
  BASE_URL,
  api
}
