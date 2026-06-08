const MAX_IMAGE_BYTES = 100 * 1024

function base64Bytes(base64) {
  return Math.ceil((base64.length * 3) / 4)
}

function getImageInfo(src) {
  return new Promise((resolve) => {
    wx.getImageInfo({
      src,
      success(res) {
        resolve({ width: Number(res.width || 0), height: Number(res.height || 0) })
      },
      fail() {
        resolve({ width: 0, height: 0 })
      }
    })
  })
}

function chooseImagePath() {
  return new Promise((resolve, reject) => {
    const handleFail = (error) => {
      const message = String(error && error.errMsg ? error.errMsg : '')
      if (message.includes('cancel')) resolve('')
      else reject(error)
    }

    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success(res) {
          const file = res.tempFiles && res.tempFiles[0]
          resolve(file ? file.tempFilePath : '')
        },
        fail: handleFail
      })
      return
    }

    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        resolve(res.tempFilePaths && res.tempFilePaths[0] ? res.tempFilePaths[0] : '')
      },
      fail: handleFail
    })
  })
}

function fitSize(info, maxSide) {
  if (!info.width || !info.height) return {}
  const scale = Math.min(1, maxSide / Math.max(info.width, info.height))
  return {
    compressedWidth: Math.max(1, Math.round(info.width * scale)),
    compressedHeight: Math.max(1, Math.round(info.height * scale))
  }
}

function compressPath(src, quality, size = {}) {
  if (!wx.compressImage) return Promise.resolve(src)
  return new Promise((resolve) => {
    wx.compressImage({
      src,
      quality,
      ...size,
      success(res) {
        resolve(res.tempFilePath || src)
      },
      fail() {
        resolve(src)
      }
    })
  })
}

function readBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success(res) {
        resolve(String(res.data || ''))
      },
      fail: reject
    })
  })
}

async function compressImageToDataUrl(maxBytes = MAX_IMAGE_BYTES) {
  const source = await chooseImagePath()
  if (!source) return ''

  let lastBase64 = ''
  const info = await getImageInfo(source)
  const maxSides = [1280, 960, 720, 540, 405, 320, 240, 180, 120, 90]
  const qualities = [82, 70, 58, 46, 34, 24, 16, 10]

  for (const maxSide of maxSides) {
    const size = fitSize(info, maxSide)
    for (const quality of qualities) {
      const path = await compressPath(source, quality, size)
      const base64 = await readBase64(path)
      lastBase64 = base64
      if (base64Bytes(base64) <= maxBytes) {
        return `data:image/jpeg;base64,${base64}`
      }
    }
  }

  if (lastBase64 && base64Bytes(lastBase64) <= maxBytes) {
    return `data:image/jpeg;base64,${lastBase64}`
  }

  throw new Error('图片压缩后仍超过 100KB，请换一张更小的图')
}

module.exports = {
  compressImageToDataUrl
}
