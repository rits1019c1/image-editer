export interface SwirlOptions {
  /** 渦の中心X位置 (画像幅に対する比率 0.0〜1.0) デフォルト: 0.5 */
  centerX?: number
  /** 渦の中心Y位置 (画像高さに対する比率 0.0〜1.0) デフォルト: 0.5 */
  centerY?: number
  /** 渦の影響半径 (画像短辺の半分に対する比率 0.1〜2.0) デフォルト: 1.0 */
  radius?: number
  /** 回転方向: 1=時計回り, -1=反時計回り デフォルト: 1 */
  direction?: 1 | -1
  /** 渦の回転数 (0.5〜10.0) デフォルト: 2 */
  rotations?: number
}

/**
 * 高自由度スワール（渦巻き）フィルター
 */
export function applySwirlFilter(
  srcDataUrl: string,
  options: SwirlOptions = {}
): Promise<string> {
  const {
    centerX = 0.5,
    centerY = 0.5,
    radius = 1.0,
    direction = 1,
    rotations = 2
  } = options

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const src = new Uint8ClampedArray(imageData.data)
      const w = canvas.width
      const h = canvas.height

      const cx = centerX * w
      const cy = centerY * h
      const maxRadius = Math.min(w, h) / 2 * radius

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = x - cx
          const dy = y - cy
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < maxRadius && dist > 0) {
            const t = 1 - dist / maxRadius
            const swirlAngle = direction * rotations * Math.PI * 2 * (t * t)
            const cos = Math.cos(swirlAngle)
            const sin = Math.sin(swirlAngle)

            const srcX = Math.round(cx + dx * cos - dy * sin)
            const srcY = Math.round(cy + dx * sin + dy * cos)

            const destIdx = (y * w + x) * 4

            if (srcX >= 0 && srcX < w && srcY >= 0 && srcY < h) {
              const srcIdx = (srcY * w + srcX) * 4
              imageData.data[destIdx]     = src[srcIdx]
              imageData.data[destIdx + 1] = src[srcIdx + 1]
              imageData.data[destIdx + 2] = src[srcIdx + 2]
              imageData.data[destIdx + 3] = src[srcIdx + 3]
            } else {
              imageData.data[destIdx + 3] = 0
            }
          }
        }
      }

      ctx.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL())
    }
    img.src = srcDataUrl
  })
}

/**
 * グレースケールフィルター
 */
export function applyGrayscaleFilter(srcDataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < imageData.data.length; i += 4) {
        const avg =
          0.299 * imageData.data[i] +
          0.587 * imageData.data[i + 1] +
          0.114 * imageData.data[i + 2]
        imageData.data[i] = avg
        imageData.data[i + 1] = avg
        imageData.data[i + 2] = avg
      }
      ctx.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL())
    }
    img.src = srcDataUrl
  })
}

/**
 * 簡易クロマキー透過フィルター (白または黒)
 */
export function applyChromaKeyFilter(
  srcDataUrl: string,
  targetColor: 'white' | 'black',
  tolerance: number = 30
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]

        if (targetColor === 'white') {
          if (r > 255 - tolerance && g > 255 - tolerance && b > 255 - tolerance) {
            data[i + 3] = 0
          }
        } else if (targetColor === 'black') {
          if (r < tolerance && g < tolerance && b < tolerance) {
            data[i + 3] = 0
          }
        }
      }

      ctx.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL())
    }
    img.src = srcDataUrl
  })
}

/**
 * 明るさ・コントラスト・彩度調整フィルター
 * @param brightness -100 〜 100
 * @param contrast   -100 〜 100
 * @param saturation -100 〜 100
 */
export function applyAdjustFilter(
  srcDataUrl: string,
  brightness: number,
  contrast: number,
  saturation: number
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!

      // CSS フィルターを使って高速に適用
      const bPct = 1 + brightness / 100       // 0.0 〜 2.0
      const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast))
      const sFactor = 1 + saturation / 100    // 0.0 〜 2.0

      ctx.filter = [
        `brightness(${bPct})`,
        `contrast(${cFactor})`,
        `saturate(${sFactor})`
      ].join(' ')
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL())
    }
    img.src = srcDataUrl
  })
}

/**
 * ぼかしフィルター
 * @param radius 0 〜 20
 */
export function applyBlurFilter(
  srcDataUrl: string,
  radius: number
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.filter = `blur(${radius}px)`
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL())
    }
    img.src = srcDataUrl
  })
}

/**
 * シャープフィルター（アンシャープマスク風）
 */
export function applySharpenFilter(srcDataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      const w = canvas.width
      const h = canvas.height
      const src = new Uint8ClampedArray(data)

      // シャープニングカーネル
      const kernel = [
         0, -1,  0,
        -1,  5, -1,
         0, -1,  0
      ]

      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = (y * w + x) * 4
          for (let c = 0; c < 3; c++) {
            let val = 0
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                const si = ((y + ky) * w + (x + kx)) * 4
                val += src[si + c] * kernel[(ky + 1) * 3 + (kx + 1)]
              }
            }
            data[idx + c] = Math.min(255, Math.max(0, val))
          }
        }
      }

      ctx.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL())
    }
    img.src = srcDataUrl
  })
}

/**
 * ノイズ除去フィルター（メディアンフィルター風の簡易版）
 */
export function applyDenoiseFilter(srcDataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      const w = canvas.width
      const h = canvas.height
      const src = new Uint8ClampedArray(data)

      // ボックスぼかし (3x3) を軽いノイズ除去として使用
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = (y * w + x) * 4
          for (let c = 0; c < 3; c++) {
            let sum = 0
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                sum += src[((y + ky) * w + (x + kx)) * 4 + c]
              }
            }
            data[idx + c] = Math.round(sum / 9)
          }
        }
      }

      ctx.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL())
    }
    img.src = srcDataUrl
  })
}

/**
 * クロップフィルター: 画像を指定した矩形で切り出す
 */
export function applyCropFilter(
  srcDataUrl: string,
  cropX: number,
  cropY: number,
  cropW: number,
  cropH: number,
  imgW: number,
  imgH: number
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      // キャンバス座標 → 元画像座標へのスケール変換
      const scaleX = img.width / imgW
      const scaleY = img.height / imgH

      const sx = Math.round(cropX * scaleX)
      const sy = Math.round(cropY * scaleY)
      const sw = Math.round(cropW * scaleX)
      const sh = Math.round(cropH * scaleY)

      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, sw)
      canvas.height = Math.max(1, sh)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
      resolve(canvas.toDataURL())
    }
    img.src = srcDataUrl
  })
}
