import React, { useState } from 'react'
import { AnyLayer, ImageLayer, TextLayer } from '../types'
import { applySwirlFilter, applyGrayscaleFilter } from '../utils/filters'

interface PropertiesPanelProps {
  layers: AnyLayer[]
  selectedIds: string[]
  onUpdate: (id: string, changes: Partial<AnyLayer>) => void
  onMergeLayers: () => void
  // App.tsx側の背景消去ハンドラ（ローディング状態も外から管理）
  onBgRemove?: (layerId: string) => void
  isBgRemoving?: boolean
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
  layers, selectedIds, onUpdate, onMergeLayers, onBgRemove, isBgRemoving
}: PropertiesPanelProps) {
  const [isProcessing, setIsProcessing] = useState(false)

  // 単一選択の場合のみ詳細プロパティを表示
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

  // ── フィルターパイプライン管理 ──────────────────────────
  // 渦巻き/グレースケールの入力ソース:
  //   bgRemovedSrc があればそれを使う → 渦巻き+背景消去の同時利用が可能
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
    // bgRemovedSrc が変わったときも再適用（背景消去後に渦巻きを再計算）
    imgLayer?.bgRemovedSrc
  ])

  const handleApplySwirlFilter = () => {
    if (!imgLayer) return
    update({ filterType: 'swirl' } as Partial<ImageLayer>)
  }

  const handleDisableSwirlFilter = () => {
    if (!imgLayer) return
    // 渦巻きをOFF → bgRemovedSrc があればそれを表示、なければ原画
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

  const handleResetImage = () => {
    if (!imgLayer) return
    // 完全リセット: bgRemovedSrc も消す
    update({ src: imgLayer.originalSrc, filterType: 'none', bgRemovedSrc: undefined } as Partial<ImageLayer>)
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

      {/* 共通: 位置 */}
      <div className="prop-section">
        <label className="prop-label">位置</label>
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
                onChange={(e) => update({ text: e.target.value } as Partial<TextLayer>)}
                className="prop-textarea" rows={3} />
            </div>
            <div className="prop-section">
              <label className="prop-label">フォント</label>
              <select value={tl.fontFamily}
                onChange={(e) => update({ fontFamily: e.target.value } as Partial<TextLayer>)}
                className="prop-select">
                {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="prop-section">
              <label className="prop-label">フォントサイズ</label>
              <SliderRow label="Size" min={8} max={200} step={1}
                value={tl.fontSize} format={(v) => `${v}px`}
                onChange={(v) => update({ fontSize: v } as Partial<TextLayer>)}
              />
            </div>
            <div className="prop-section">
              <label className="prop-label">テキスト色</label>
              <div className="prop-row">
                <input type="color" value={tl.fill}
                  onChange={(e) => update({ fill: e.target.value } as Partial<TextLayer>)}
                  className="prop-color" />
                <span className="prop-value" style={{ fontFamily: 'monospace' }}>{tl.fill}</span>
              </div>
            </div>
            <div className="prop-section">
              <label className="prop-label">スタイル</label>
              <div className="prop-row gap">
                <button className={`style-btn ${tl.bold ? 'active' : ''}`}
                  onClick={() => update({ bold: !tl.bold } as Partial<TextLayer>)}>
                  <strong>B</strong>
                </button>
                <button className={`style-btn ${tl.italic ? 'active' : ''}`}
                  onClick={() => update({ italic: !tl.italic } as Partial<TextLayer>)}>
                  <em>I</em>
                </button>
              </div>
            </div>
          </>
        )
      })()}

      {/* ── 画像フィルター設定 ── */}
      {layer.type === 'image' && imgLayer && (
        <>
          {/* AI背景削除 ── 上に移動して目立たせる */}
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
