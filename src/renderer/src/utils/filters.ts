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
 * 各ピクセルに対して中心からの距離に応じた回転変換を適用する
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

      // 実際の中心座標 (ピクセル)
      const cx = centerX * w
      const cy = centerY * h
      // 実際の半径 (画像短辺を基準)
      const maxRadius = Math.min(w, h) / 2 * radius

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = x - cx
          const dy = y - cy
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < maxRadius && dist > 0) {
            // 中心に近いほど強く回転 (easeIn曲線)
            const t = 1 - dist / maxRadius
            const swirlAngle = direction * rotations * Math.PI * 2 * (t * t)
            const cos = Math.cos(swirlAngle)
            const sin = Math.sin(swirlAngle)

            // 元のピクセル位置を計算
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
              // 範囲外は透明に
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
