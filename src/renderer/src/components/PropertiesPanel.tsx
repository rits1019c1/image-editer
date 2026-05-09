import React, { useState } from 'react'
import { AnyLayer, ImageLayer, TextLayer } from '../types'
import {
  applySwirlFilter, applyGrayscaleFilter, applyChromaKeyFilter,
  applyAdjustFilter, applyBlurFilter, applySharpenFilter, applyDenoiseFilter
} from '../utils/filters'

interface PropertiesPanelProps {
  layers: AnyLayer[]
  selectedIds: string[]
  onUpdate: (id: string, changes: Partial<AnyLayer>) => void
  onMergeLayers: () => void
  onBgRemove?: (layerId: string) => void
  isBgRemoving?: boolean
  onStartCrop?: (layerId: string) => void
}

const FONT_FAMILIES = [
  'Noto Sans JP', 'Arial', 'Georgia', 'Courier New',
  'Impact', 'Comic Sans MS', 'Times New Roman'
]

// スライダー行
function SliderRow({
  label, min, max, step, value, format, onChange
}: {
  label: string; min: number; max: number; step: number
  value: number; format?: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <div className="prop-section-inner">
      <div className="prop-row-label">
        <span>{label}</span>
        <span className="prop-value">{format ? format(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="prop-slider"
      />
    </div>
  )
}

export default function PropertiesPanel({
  layers, selectedIds, onUpdate, onMergeLayers, onBgRemove, isBgRemoving, onStartCrop
}: PropertiesPanelProps) {
  const [isProcessing, setIsProcessing] = useState(false)

  const layer = selectedIds.length === 1
    ? layers.find((l) => l.id === selectedIds[0]) ?? null
    : null

  if (selectedIds.length === 0) {
    return (
      <div className="properties-panel">
        <div className="panel-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
          </svg>
          プロパティ
        </div>
        <div className="props-empty">レイヤーを選択してください</div>
      </div>
    )
  }

  if (selectedIds.length > 1) {
    return (
      <div className="properties-panel">
        <div className="panel-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
          </svg>
          プロパティ
        </div>
        <div className="props-multi">
          <div className="multi-badge">{selectedIds.length} 個選択中</div>
          <p className="props-empty" style={{ padding: '20px 10px', marginBottom: '20px' }}>
            複数選択時は<br/>個別設定できません
          </p>
          <button className="tool-btn accent" onClick={onMergeLayers} style={{ width: '100%', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <path d="M8 12h8m-4-4v8"/>
            </svg>
            選択レイヤーを結合 (1枚の画像に)
          </button>
        </div>
      </div>
    )
  }

  if (!layer) return null
  const update = (changes: Partial<AnyLayer>) => onUpdate(layer.id, changes)
  // テキストプロパティ変更時は isRichText をリセットして Konvaテキストノードに即座反映
  const updateText = (changes: Partial<TextLayer>) =>
    onUpdate(layer.id, { ...changes, isRichText: false, richDataUrl: undefined, htmlContent: undefined } as Partial<AnyLayer>)

  // ── フィルターパイプライン管理 ──────────────────────────
  const imgLayer = layer.type === 'image' ? (layer as ImageLayer) : null
  const baseSourceForFilter = imgLayer?.bgRemovedSrc ?? imgLayer?.originalSrc ?? ''

  // 渦巻きパラメータが変わったら自動で再適用
  React.useEffect(() => {
    if (!imgLayer || imgLayer.filterType !== 'swirl') return
    const timer = setTimeout(async () => {
      setIsProcessing(true)
      try {
        const result = await applySwirlFilter(baseSourceForFilter, {
          centerX: imgLayer.swirlCenterX,
          centerY: imgLayer.swirlCenterY,
          radius: imgLayer.swirlRadius,
          direction: imgLayer.swirlDirection,
          rotations: imgLayer.swirlRotations
        })
        if (imgLayer.src !== result) {
          update({ src: result } as Partial<ImageLayer>)
        }
      } finally {
        setIsProcessing(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [
    imgLayer?.swirlCenterX, imgLayer?.swirlCenterY, imgLayer?.swirlRadius,
    imgLayer?.swirlDirection, imgLayer?.swirlRotations, imgLayer?.filterType,
    imgLayer?.bgRemovedSrc
  ])

  // クロマキー透過が変わったら自動適用
  React.useEffect(() => {
    if (!imgLayer || imgLayer.chromaKeyColor === 'none' || !imgLayer.chromaKeyColor) return
    const timer = setTimeout(async () => {
      setIsProcessing(true)
      try {
        const result = await applyChromaKeyFilter(
          baseSourceForFilter,
          imgLayer.chromaKeyColor as 'white' | 'black',
          imgLayer.chromaKeyTolerance ?? 30
        )
        if (imgLayer.src !== result) {
          update({ src: result } as Partial<ImageLayer>)
        }
      } finally {
        setIsProcessing(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [
    imgLayer?.chromaKeyColor, imgLayer?.chromaKeyTolerance,
    imgLayer?.bgRemovedSrc, imgLayer?.originalSrc
  ])

  // 明るさ・コントラスト・彩度が変わったら自動適用
  React.useEffect(() => {
    if (!imgLayer) return
    const b = imgLayer.brightness ?? 0
    const c = imgLayer.contrast ?? 0
    const s = imgLayer.saturation ?? 0
    if (b === 0 && c === 0 && s === 0) return
    const timer = setTimeout(async () => {
      setIsProcessing(true)
      try {
        const result = await applyAdjustFilter(baseSourceForFilter, b, c, s)
        update({ src: result, filterType: 'adjust' } as Partial<ImageLayer>)
      } finally {
        setIsProcessing(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [imgLayer?.brightness, imgLayer?.contrast, imgLayer?.saturation])

  const handleApplySwirlFilter = () => {
    if (!imgLayer) return
    update({ filterType: 'swirl' } as Partial<ImageLayer>)
  }

  const handleDisableSwirlFilter = () => {
    if (!imgLayer) return
    const displaySrc = imgLayer.bgRemovedSrc ?? imgLayer.originalSrc
    update({ filterType: 'none', src: displaySrc } as Partial<ImageLayer>)
  }

  const handleGrayscaleFilter = async () => {
    if (!imgLayer) return
    setIsProcessing(true)
    try {
      const result = await applyGrayscaleFilter(baseSourceForFilter)
      update({ src: result, filterType: 'grayscale' } as Partial<ImageLayer>)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleBlurFilter = async () => {
    if (!imgLayer) return
    setIsProcessing(true)
    try {
      const result = await applyBlurFilter(baseSourceForFilter, imgLayer.blurRadius ?? 3)
      update({ src: result, filterType: 'blur' } as Partial<ImageLayer>)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSharpenFilter = async () => {
    if (!imgLayer) return
    setIsProcessing(true)
    try {
      const result = await applySharpenFilter(baseSourceForFilter)
      update({ src: result, filterType: 'sharpen' } as Partial<ImageLayer>)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDenoiseFilter = async () => {
    if (!imgLayer) return
    setIsProcessing(true)
    try {
      const result = await applyDenoiseFilter(baseSourceForFilter)
      update({ src: result, filterType: 'denoise' } as Partial<ImageLayer>)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleResetImage = () => {
    if (!imgLayer) return
    update({
      src: imgLayer.originalSrc, filterType: 'none',
      bgRemovedSrc: undefined, chromaKeyColor: 'none',
      brightness: 0, contrast: 0, saturation: 0
    } as Partial<ImageLayer>)
  }

  const isBusy = isProcessing || !!isBgRemoving

  return (
    <div className="properties-panel">
      <div className="panel-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
        </svg>
        プロパティ
      </div>

      {/* 共通: 不透明度 */}
      <div className="prop-section">
        <label className="prop-label">不透明度</label>
        <SliderRow label="Opacity" min={0} max={1} step={0.01}
          value={layer.opacity} format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => update({ opacity: v })}
        />
      </div>

      {/* 共通: 位置・サイズ */}
      <div className="prop-section">
        <label className="prop-label">位置 / サイズ</label>
        <div className="prop-grid-2">
          <div className="prop-field">
            <label>X</label>
            <input type="number" value={Math.round(layer.x)}
              onChange={(e) => update({ x: parseInt(e.target.value) || 0 })}
              className="prop-input" />
          </div>
          <div className="prop-field">
            <label>Y</label>
            <input type="number" value={Math.round(layer.y)}
              onChange={(e) => update({ y: parseInt(e.target.value) || 0 })}
              className="prop-input" />
          </div>
          <div className="prop-field">
            <label>幅</label>
            <input type="number" value={Math.round(layer.width)}
              onChange={(e) => update({ width: Math.max(1, parseInt(e.target.value) || 1) })}
              className="prop-input" />
          </div>
          <div className="prop-field">
            <label>高さ</label>
            <input type="number" value={Math.round(layer.height)}
              onChange={(e) => update({ height: Math.max(1, parseInt(e.target.value) || 1) })}
              className="prop-input" />
          </div>
        </div>
      </div>

      {/* ── テキスト設定 ── */}
      {layer.type === 'text' && (() => {
        const tl = layer as TextLayer
        return (
          <>
            <div className="prop-section">
              <label className="prop-label">テキスト</label>
              <textarea value={tl.text}
                onChange={(e) => updateText({ text: e.target.value })}
                className="prop-textarea" rows={3} />
            </div>
            <div className="prop-section">
              <label className="prop-label">フォント</label>
              <select value={tl.fontFamily}
                onChange={(e) => updateText({ fontFamily: e.target.value })}
                className="prop-select">
                {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="prop-section">
              <label className="prop-label">フォントサイズ</label>
              <SliderRow label="Size" min={8} max={200} step={1}
                value={tl.fontSize} format={(v) => `${v}px`}
                onChange={(v) => updateText({ fontSize: v })}
              />
            </div>
            <div className="prop-section">
              <label className="prop-label">テキスト色</label>
              <div className="prop-row">
                <input type="color" value={tl.fill}
                  onChange={(e) => updateText({ fill: e.target.value })}
                  className="prop-color" />
                <span className="prop-value" style={{ fontFamily: 'monospace' }}>{tl.fill}</span>
              </div>
            </div>
            <div className="prop-section">
              <label className="prop-label">スタイル</label>
              <div className="prop-row gap">
                <button className={`style-btn ${tl.bold ? 'active' : ''}`}
                  onClick={() => updateText({ bold: !tl.bold })}>
                  <strong>B</strong>
                </button>
                <button className={`style-btn ${tl.italic ? 'active' : ''}`}
                  onClick={() => updateText({ italic: !tl.italic })}>
                  <em>I</em>
                </button>
              </div>
            </div>

            {/* アウトライン */}
            <div className="prop-section">
              <label className="prop-label">🖊 アウトライン</label>
              <div className="prop-grid-2" style={{ marginBottom: 8 }}>
                <div className="prop-field">
                  <label>色</label>
                  <input type="color" value={tl.strokeColor}
                    onChange={(e) => update({ strokeColor: e.target.value } as Partial<TextLayer>)}
                    className="prop-color" style={{ width: '100%', height: 32 }} />
                </div>
                <div className="prop-field">
                  <label>太さ</label>
                  <input type="number" min={0} max={20} value={tl.strokeWidth}
                    onChange={(e) => update({ strokeWidth: parseFloat(e.target.value) || 0 } as Partial<TextLayer>)}
                    className="prop-input" />
                </div>
              </div>
              <SliderRow label="太さ" min={0} max={20} step={0.5}
                value={tl.strokeWidth} format={(v) => `${v}px`}
                onChange={(v) => update({ strokeWidth: v } as Partial<TextLayer>)}
              />
            </div>

            {/* 影 */}
            <div className="prop-section">
              <label className="prop-label">🌑 テキスト影</label>
              <div className="prop-grid-2" style={{ marginBottom: 8 }}>
                <div className="prop-field">
                  <label>色</label>
                  <input type="color" value={tl.shadowColor}
                    onChange={(e) => update({ shadowColor: e.target.value } as Partial<TextLayer>)}
                    className="prop-color" style={{ width: '100%', height: 32 }} />
                </div>
                <div className="prop-field">
                  <label>ぼかし</label>
                  <input type="number" min={0} max={50} value={tl.shadowBlur}
                    onChange={(e) => update({ shadowBlur: parseFloat(e.target.value) || 0 } as Partial<TextLayer>)}
                    className="prop-input" />
                </div>
              </div>
              <SliderRow label="ぼかし" min={0} max={50} step={1}
                value={tl.shadowBlur} format={(v) => `${v}px`}
                onChange={(v) => update({ shadowBlur: v } as Partial<TextLayer>)}
              />
              <div className="prop-grid-2">
                <div className="prop-field">
                  <label>X オフセット</label>
                  <input type="number" min={-50} max={50} value={tl.shadowOffsetX}
                    onChange={(e) => update({ shadowOffsetX: parseInt(e.target.value) || 0 } as Partial<TextLayer>)}
                    className="prop-input" />
                </div>
                <div className="prop-field">
                  <label>Y オフセット</label>
                  <input type="number" min={-50} max={50} value={tl.shadowOffsetY}
                    onChange={(e) => update({ shadowOffsetY: parseInt(e.target.value) || 0 } as Partial<TextLayer>)}
                    className="prop-input" />
                </div>
              </div>
            </div>
          </>
        )
      })()}

      {/* ── 画像フィルター設定 ── */}
      {layer.type === 'image' && imgLayer && (
        <>
          {/* クロップ */}
          <div className="prop-section">
            <label className="prop-label">✂ クロップ / トリミング</label>
            <button className="filter-btn" onClick={() => onStartCrop?.(layer.id)} disabled={isBusy}
              style={{ width: '100%', justifyContent: 'center' }}>
              ✂ クロップモードを開始
            </button>
          </div>

          {/* 明るさ・コントラスト・彩度 */}
          <div className="prop-section">
            <label className="prop-label">☀ 明るさ / コントラスト / 彩度</label>
            <SliderRow label="明るさ" min={-100} max={100} step={1}
              value={imgLayer.brightness ?? 0} format={(v) => `${v > 0 ? '+' : ''}${v}`}
              onChange={(v) => update({ brightness: v } as Partial<ImageLayer>)}
            />
            <SliderRow label="コントラスト" min={-100} max={100} step={1}
              value={imgLayer.contrast ?? 0} format={(v) => `${v > 0 ? '+' : ''}${v}`}
              onChange={(v) => update({ contrast: v } as Partial<ImageLayer>)}
            />
            <SliderRow label="彩度" min={-100} max={100} step={1}
              value={imgLayer.saturation ?? 0} format={(v) => `${v > 0 ? '+' : ''}${v}`}
              onChange={(v) => update({ saturation: v } as Partial<ImageLayer>)}
            />
          </div>

          {/* AI背景削除 */}
          <div className="prop-section">
            <label className="prop-label">
              ✨ AI 背景削除
              {imgLayer.bgRemovedSrc && (
                <span className="filter-badge active-badge">✓ 適用済み</span>
              )}
            </label>
            <div className="filter-btns">
              <button
                className={`filter-btn ai-btn ${imgLayer.bgRemovedSrc ? 'ai-btn-done' : ''}`}
                onClick={() => onBgRemove?.(layer.id)}
                disabled={isBusy}
              >
                {isBgRemoving ? '⏳ AI処理中...' : imgLayer.bgRemovedSrc ? '🔄 背景を再削除' : '✨ 背景を削除 (AI)'}
              </button>
              {isBgRemoving && <div className="ai-note">初回は数分かかる場合があります</div>}
              {imgLayer.bgRemovedSrc && !isBgRemoving && (
                <button className="filter-btn reset" onClick={handleResetImage} disabled={isBusy}>
                  ↩ 背景削除を取り消す
                </button>
              )}
            </div>
          </div>

          {/* クロマキー透過 */}
          <div className="prop-section">
            <label className="prop-label">
              🔳 簡易背景透過 (白/黒)
              {imgLayer.chromaKeyColor && imgLayer.chromaKeyColor !== 'none' && (
                <span className="filter-badge active-badge">✓ {imgLayer.chromaKeyColor === 'white' ? '白' : '黒'}透過</span>
              )}
            </label>
            <div className="filter-btns" style={{ marginBottom: 8 }}>
              <button className={`filter-btn ${imgLayer.chromaKeyColor === 'white' ? 'ai-btn-done' : ''}`}
                onClick={() => update({ chromaKeyColor: imgLayer.chromaKeyColor === 'white' ? 'none' : 'white' } as Partial<ImageLayer>)} disabled={isBusy}>
                ⬜ 白を透過
              </button>
              <button className={`filter-btn ${imgLayer.chromaKeyColor === 'black' ? 'ai-btn-done' : ''}`}
                onClick={() => update({ chromaKeyColor: imgLayer.chromaKeyColor === 'black' ? 'none' : 'black' } as Partial<ImageLayer>)} disabled={isBusy}>
                ⬛ 黒を透過
              </button>
            </div>
            {imgLayer.chromaKeyColor && imgLayer.chromaKeyColor !== 'none' && (
              <SliderRow label="透過の強さ" min={0} max={255} step={1}
                value={imgLayer.chromaKeyTolerance ?? 30} format={(v) => v.toString()}
                onChange={(v) => update({ chromaKeyTolerance: v } as Partial<ImageLayer>)}
              />
            )}
          </div>

          {/* 渦巻きパラメータ */}
          <div className="prop-section">
            <label className="prop-label">
              🌀 渦巻き
              {imgLayer.filterType === 'swirl' && (
                <span className="filter-badge active-badge">✓ ON</span>
              )}
            </label>
            <SliderRow label="中心 X" min={0} max={1} step={0.01}
              value={imgLayer.swirlCenterX} format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => update({ swirlCenterX: v } as Partial<ImageLayer>)}
            />
            <SliderRow label="中心 Y" min={0} max={1} step={0.01}
              value={imgLayer.swirlCenterY} format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => update({ swirlCenterY: v } as Partial<ImageLayer>)}
            />
            <SliderRow label="半径" min={0.1} max={2.0} step={0.05}
              value={imgLayer.swirlRadius} format={(v) => `${v.toFixed(2)}x`}
              onChange={(v) => update({ swirlRadius: v } as Partial<ImageLayer>)}
            />
            <SliderRow label="回転数" min={0.5} max={10} step={0.5}
              value={imgLayer.swirlRotations} format={(v) => `${v}回転`}
              onChange={(v) => update({ swirlRotations: v } as Partial<ImageLayer>)}
            />
            <div className="prop-section-inner">
              <div className="prop-row-label"><span>方向</span></div>
              <div className="prop-row gap">
                <button
                  className={`style-btn ${imgLayer.swirlDirection === 1 ? 'active' : ''}`}
                  onClick={() => update({ swirlDirection: 1 } as Partial<ImageLayer>)}
                >🔁 時計回り</button>
                <button
                  className={`style-btn ${imgLayer.swirlDirection === -1 ? 'active' : ''}`}
                  onClick={() => update({ swirlDirection: -1 } as Partial<ImageLayer>)}
                >🔄 逆時計</button>
              </div>
            </div>
            <div className="filter-btns" style={{ marginTop: 12 }}>
              {imgLayer.filterType !== 'swirl' ? (
                <button className="filter-btn swirl-btn" onClick={handleApplySwirlFilter} disabled={isBusy}>
                  🌀 渦巻きを有効化
                </button>
              ) : (
                <button className="filter-btn reset" onClick={handleDisableSwirlFilter} disabled={isBusy}>
                  ✕ 渦巻きをOFF
                </button>
              )}
              {isProcessing && <div className="ai-note">⏳ 処理中...</div>}
            </div>
          </div>

          {/* その他フィルター */}
          <div className="prop-section">
            <label className="prop-label">その他フィルター</label>
            <div className="filter-btns">
              <button className="filter-btn" onClick={handleGrayscaleFilter} disabled={isBusy}>
                ⬛ グレースケール
              </button>
              <button className="filter-btn" onClick={handleBlurFilter} disabled={isBusy}>
                🌫 ぼかし
              </button>
              <button className="filter-btn" onClick={handleSharpenFilter} disabled={isBusy}>
                🔍 シャープ
              </button>
              <button className="filter-btn" onClick={handleDenoiseFilter} disabled={isBusy}>
                ✨ ノイズ除去
              </button>
            </div>
            {imgLayer.filterType === 'blur' && (
              <SliderRow label="ぼかし半径" min={1} max={20} step={1}
                value={imgLayer.blurRadius ?? 3} format={(v) => `${v}px`}
                onChange={(v) => update({ blurRadius: v } as Partial<ImageLayer>)}
              />
            )}
            <div className="filter-btns" style={{ marginTop: 8 }}>
              <button className="filter-btn reset" onClick={handleResetImage} disabled={isBusy}>
                ↩ すべて元に戻す
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
