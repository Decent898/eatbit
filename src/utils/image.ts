const MAX_IMAGE_BYTES = 100 * 1024

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function dataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(',')[1] ?? ''
  return Math.ceil((base64.length * 3) / 4)
}

export async function compressImageToDataUrl(file: File, maxBytes = MAX_IMAGE_BYTES) {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件')
  }

  const original = await fileToDataUrl(file)
  const image = await loadImage(original)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器不支持图片压缩')

  let maxSide = 1280
  let quality = 0.82
  let result = original

  for (let round = 0; round < 12; round += 1) {
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    result = canvas.toDataURL('image/jpeg', quality)
    if (dataUrlBytes(result) <= maxBytes) return result
    if (quality > 0.45) {
      quality -= 0.12
    } else {
      maxSide = Math.round(maxSide * 0.75)
      quality = 0.72
    }
  }

  if (dataUrlBytes(result) > maxBytes) {
    throw new Error('图片压缩后仍超过 100KB，请换一张更小的图')
  }
  return result
}
