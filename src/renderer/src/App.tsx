import React, { useRef, useEffect, useCallback, useState } from 'react'
import Konva from 'konva'
import { useEditorState } from './hooks/useEditorState'
import CanvasView from './components/CanvasView'
import LayerPanel from './components/LayerPanel'
import PropertiesPanel from './components/PropertiesPanel'
import { AnyLayer } from './types'
import './App.css'

// トースト通知
function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200)
    return () => clearTimeout(t)
  }, [onDone])
  return <div className="toast">{message}</div>
}

// キャンバスサイズ変更ダイアログ
function CanvasSizeDialog({
  currentWidth, currentHeight,
  onApply, onClose
}: {
  currentWidth: number; currentHeight: number
  onApply: (w: number, h: number) => void
  onClose: () => void
}) {
  const [w, setW] = useState(currentWidth)
  const [h, setH] = useState(currentHeight)
  const presets = [
    { label: 'HD 1280×720', w: 1280, h: 720 },
    { label: 'FHD 1920×1080', w: 1920, h: 1080 },
    { label: 'Square 1000×1000', w: 1000, h: 1000 },
    { label: 'A4 (print) 2480×3508', w: 2480, h: 3508 },
    { label: 'Twitter 1500×500', w: 1500, h: 500 },
  ]
  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <span>キャンバスサイズ</span>
          <button className="dialog-close" onClick={onClose}>✕</button>
        </div>
        <div className="dialog-body">
          <div className="dialog-presets">
            {presets.map((p) => (
              <button key={p.label} className="preset-btn" onClick={() => { setW(p.w); setH(p.h) }}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="dialog-inputs">
            <div className="dialog-field">
              <label>幅 (px)</label>
              <input type="number" value={w} min={1} max={8000}
                onChange={(e) => setW(Math.max(1, parseInt(e.target.value) || 1))}
                className="prop-input" />
            </div>
            <div className="dialog-field">
              <label>高さ (px)</label>
              <input type="number" value={h} min={1} max={8000}
                onChange={(e) => setH(Math.max(1, parseInt(e.target.value) || 1))}
                className="prop-input" />
            </div>
          </div>
        </div>
        <div className="dialog-footer">
          <button className="tool-btn" onClick={onClose}>キャンセル</button>
          <button className="tool-btn accent" onClick={() => { onApply(w, h); onClose() }}>
            適用
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const {
    state, undo, redo,
    selectLayer, selectLayers, toggleSelectLayer,
    addImageLayer, addTextLayer,
    updateLayer, updateLayerImmediate,
    renameLayer,
    deleteLayer, deleteSelectedLayers,
    moveLayerUp, moveLayerDown,
    toggleLayerVisibility, setBgColor, setCanvasSize,
    copySelectedLayers, cutSelectedLayers, pasteFromClipboard
  } = useEditorState()

  const stageRef = useRef<Konva.Stage>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [transparentBg, setTransparentBg] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, layerId?: string } | null>(null)
  const [showCanvasSizeDialog, setShowCanvasSizeDialog] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isBgRemoving, setIsBgRemoving] = useState(false)
  // プラットフォーム（Mac/Windows判定）
  const [platform, setPlatform] = useState<string>('darwin')

  // プラットフォーム取得
  useEffect(() => {
    window.api.getPlatform?.().then((p) => setPlatform(p)).catch(() => {})
  }, [])

  const isMac = platform === 'darwin'

  const showToast = useCallback((msg: string) => {
    setToast(msg)
  }, [])

  // ── AI背景消去（PropertiesPanel & コンテキストメニューから呼び出し可能） ──
  const handleBgRemoveLayer = useCallback(async (layerId: string) => {
    const targetLayer = state.layers.find((l) => l.id === layerId)
    if (!targetLayer || targetLayer.type !== 'image') return
    const imgLayer = targetLayer as import('./types').ImageLayer
    setIsBgRemoving(true)
    try {
      const { removeBackground } = await import('@imgly/background-removal')
      // 背景消去はいつも originalSrc を使う（フィルター前の純粋な元画像）
      const res = await fetch(imgLayer.originalSrc)
      const blob = await res.blob()
      const resultBlob = await removeBackground(blob)
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(resultBlob)
      })
      // bgRemovedSrc に保存、src も更新（渦巻きがONなら useEffect が自動再適用）
      updateLayer(layerId, {
        bgRemovedSrc: dataUrl,
        src: dataUrl,
        filterType: imgLayer.filterType === 'swirl' ? 'swirl' : 'none'
      } as Partial<import('./types').ImageLayer>)
      showToast('✨ 背景を削除しました')
    } catch (e) {
      console.error('背景削除に失敗しました:', e)
      showToast('❌ 背景削除に失敗しました')
    } finally {
      setIsBgRemoving(false)
    }
  }, [state.layers, updateLayer, showToast])

  // ── ファイルドロップ対応 ──────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])
  const handleDragLeave = useCallback(() => setIsDragOver(false), [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    files.forEach((file) => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        addImageLayer(ev.target?.result as string, file.name.replace(/\.[^/.]+$/, ''))
        showToast(`📂 ${file.name} を追加しました`)
      }
      reader.readAsDataURL(file)
    })
  }, [addImageLayer, showToast])

  // ── HTML5のペーストイベント監視 ──────────────────────────────
  useEffect(() => {
    const handlePasteEvent = (e: ClipboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile()
          if (file) {
            const reader = new FileReader()
            reader.onload = (ev) => {
              addImageLayer(ev.target?.result as string, 'ペースト画像')
              showToast('画像をペーストしました')
            }
            reader.readAsDataURL(file)
            e.preventDefault()
            return
          }
        }
      }
    }
    window.addEventListener('paste', handlePasteEvent)
    return () => window.removeEventListener('paste', handlePasteEvent)
  }, [addImageLayer, showToast])

  // ── 画面のクリックでコンテキストメニューを消す ──────────────
  useEffect(() => {
    const closeMenu = () => setContextMenu(null)
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [])

  // ── ファイルを開く ──────────────────────────────────────────
  const handleOpenFile = useCallback(async () => {
    const dataUrl = await window.api.openImageFile()
    if (dataUrl) addImageLayer(dataUrl, 'ファイル画像')
  }, [addImageLayer])

  // ── クリップボードから貼り付け（画像取込） ───────────────────
  const handlePasteImageFromClipboard = useCallback(async () => {
    const dataUrl = await window.api.readClipboardImage()
    if (dataUrl) {
      addImageLayer(dataUrl, 'クリップボード画像')
      showToast('画像をペーストしました')
    } else {
      showToast('クリップボードに画像がありません')
    }
  }, [addImageLayer, showToast])

  // ── キャンバスをファイルに保存 ────────────────────────────────
  const handleSaveImage = useCallback(async () => {
    if (!stageRef.current) return
    const prevIds = state.selectedIds
    selectLayers([])
    await new Promise((r) => setTimeout(r, 80))

    const bgRect = stageRef.current.findOne('.bg')
    if (bgRect && transparentBg) bgRect.hide()

    const dataUrl = stageRef.current.toDataURL({ pixelRatio: 2 })

    if (bgRect && transparentBg) bgRect.show()
    selectLayers(prevIds)

    const result = await window.api.saveImage(dataUrl)
    if (result.success) showToast(`保存完了: ${result.filePath?.split(/[\\/]/).pop()}`)
  }, [state.selectedIds, selectLayers, showToast, transparentBg])

  // ── 選択レイヤーを一つに結合 ─────────────────────────────
  const handleMergeLayers = useCallback(async () => {
    if (state.selectedIds.length < 2 || !stageRef.current) return
    const stage = stageRef.current

    const targetIds = [...state.selectedIds]
    selectLayers([])
    await new Promise((r) => setTimeout(r, 80))

    const bg = stage.findOne('.bg')
    if (bg) bg.hide()

    const allNodes = stage.find('.layer-node')
    const originalVisibilities = new Map<Konva.Node, boolean>()

    allNodes.forEach((node) => {
      originalVisibilities.set(node, node.visible())
      if (!targetIds.includes(node.id())) {
        node.hide()
      } else {
        node.show()
      }
    })

    await new Promise((r) => setTimeout(r, 80))
    const dataUrl = stage.toDataURL({ pixelRatio: 2 })

    if (bg) bg.show()
    allNodes.forEach((node) => {
      node.visible(originalVisibilities.get(node) ?? true)
    })

    selectLayers(targetIds)
    deleteSelectedLayers()
    addImageLayer(dataUrl, '結合レイヤー')
    showToast('レイヤーを結合しました')
  }, [state.selectedIds, selectLayers, deleteSelectedLayers, addImageLayer, showToast])

  // ── キャンバスをクリップボードに書き込み ─────────────────────
  const handleCopyCanvasToClipboard = useCallback(async () => {
    if (!stageRef.current) return
    const prevIds = state.selectedIds
    selectLayers([])
    await new Promise((r) => setTimeout(r, 80))
    const dataUrl = stageRef.current.toDataURL({ pixelRatio: 2 })
    selectLayers(prevIds)
    await window.api.writeClipboardImage(dataUrl)
    showToast('📋 クリップボードにコピーしました')
  }, [state.selectedIds, selectLayers, showToast])

  // ── キーボードショートカット ──────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const inInput = tag === 'TEXTAREA' || tag === 'INPUT'
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault(); undo(); showToast('↩ 元に戻した')
        return
      }
      if ((mod && e.shiftKey && e.key === 'z') || (mod && e.key === 'y')) {
        e.preventDefault(); redo(); showToast('↪ やり直した')
        return
      }
      if (mod && e.key === 'c' && !inInput) {
        e.preventDefault(); copySelectedLayers(); showToast('コピーしました')
        return
      }
      if (mod && e.key === 'x' && !inInput) {
        e.preventDefault(); cutSelectedLayers(); showToast('カットしました')
        return
      }
      if (mod && e.key === 'v' && !inInput) {
        const didPasteLayer = pasteFromClipboard()
        if (didPasteLayer) {
          e.preventDefault()
        }
        return
      }
      if (mod && e.shiftKey && e.key === 'v' && !inInput) {
        e.preventDefault(); handlePasteImageFromClipboard()
        return
      }
      if (mod && e.key === 'a' && !inInput) {
        e.preventDefault()
        selectLayers(state.layers.map((l) => l.id))
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !inInput && state.selectedIds.length > 0) {
        e.preventDefault(); deleteSelectedLayers()
        return
      }
      if (e.key === 'Escape') {
        selectLayers([])
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    undo, redo, copySelectedLayers, cutSelectedLayers, pasteFromClipboard,
    handlePasteImageFromClipboard, selectLayers, deleteSelectedLayers,
    state.layers, state.selectedIds, showToast
  ])

  // ショートカットキーの表示（Mac/Windows対応）
  const mod = isMac ? '⌘' : 'Ctrl'

  return (
    <div
      className={`app ${isDragOver ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* タイトルバー */}
      <header className={`titlebar ${!isMac ? 'titlebar-win' : ''}`}>
        <div className="titlebar-drag" />
        <div className="titlebar-title">
          <span className="titlebar-icon">✦</span>
          Image Editor
        </div>
        <div className="titlebar-drag" />
      </header>

      {/* ツールバー */}
      <div className="toolbar">
        <button className="tool-btn primary" onClick={handleOpenFile} id="btn-open-file">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          開く
        </button>
        <button className="tool-btn" onClick={handlePasteImageFromClipboard} id="btn-paste-clipboard" title={`クリップボードから画像を取り込む (${mod}⇧V)`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="2" width="6" height="4" rx="1"/><path d="M17 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
          </svg>
          画像を貼り付け
        </button>
        <button className="tool-btn" onClick={addTextLayer} id="btn-add-text">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>
          </svg>
          テキスト
        </button>

        <div className="toolbar-divider" />

        {/* Undo/Redo */}
        <button className="tool-btn icon-only" onClick={() => { undo(); showToast('↩ 元に戻した') }} title={`元に戻す (${mod}Z)`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
          </svg>
        </button>
        <button className="tool-btn icon-only" onClick={() => { redo(); showToast('↪ やり直した') }} title={`やり直す (${mod}⇧Z)`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-3.51"/>
          </svg>
        </button>

        <div className="toolbar-divider" />

        {/* 背景色 */}
        <div className="toolbar-bg-picker" title="背景色">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="13.5" cy="6.5" r="2.5"/><path d="M20.58 3.42l-1-1a2 2 0 0 0-2.83 0l-13 13a2 2 0 0 0 0 2.83l1 1a2 2 0 0 0 2.83 0l13-13a2 2 0 0 0 0-2.83z"/>
          </svg>
          <input type="color" value={state.bgColor}
            onChange={(e) => setBgColor(e.target.value)} id="input-bg-color" title="背景色" />
        </div>

        {/* キャンバスサイズ変更 */}
        <button className="tool-btn icon-only" onClick={() => setShowCanvasSizeDialog(true)} title={`キャンバスサイズ変更 (現在: ${state.canvasWidth}×${state.canvasHeight})`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>
          </svg>
        </button>

        <div className="toolbar-spacer" />

        {/* 出力系 */}
        <label className="toolbar-bg-picker" style={{ fontSize: '11px', gap: '4px', cursor: 'pointer' }} title="背景を透過して保存する">
          <input type="checkbox" checked={transparentBg} onChange={(e) => setTransparentBg(e.target.checked)} />
          背景透過
        </label>
        <button className="tool-btn" onClick={handleCopyCanvasToClipboard} id="btn-copy-canvas" title="完成画像をクリップボードにコピー">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          コピー
        </button>
        <button className="tool-btn accent" onClick={handleSaveImage} id="btn-save-image" title="ファイルに保存">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          保存
        </button>
      </div>

      {/* メインエリア */}
      <div className="main-area">
        {/* キャンバス */}
        <main className="canvas-area">
          <div className="canvas-scroll">
            <CanvasView
              layers={state.layers}
              selectedIds={state.selectedIds}
              canvasWidth={state.canvasWidth}
              canvasHeight={state.canvasHeight}
              bgColor={state.bgColor}
              onSelectLayer={selectLayer}
              onSelectLayers={selectLayers}
              onUpdateLayer={(id, c) => updateLayer(id, c as Partial<AnyLayer>)}
              onUpdateLayerImmediate={(id, c) => updateLayerImmediate(id, c as Partial<AnyLayer>)}
              onContextMenu={(e, layerId) => {
                setContextMenu({ x: e.clientX, y: e.clientY, layerId })
                if (layerId && !state.selectedIds.includes(layerId)) {
                  selectLayer(layerId)
                }
              }}
              stageRef={stageRef}
            />
          </div>
          {state.layers.length === 0 && (
            <div className="canvas-empty-hint">
              <div className="hint-icon">✧</div>
              <p>ファイルを開くか<br/>画像をここにドロップ</p>
              <div className="shortcut-grid">
                <div className="shortcut-row"><kbd>{mod}Z</kbd> <span>元に戻す</span></div>
                <div className="shortcut-row"><kbd>{mod}⇧Z</kbd> <span>やり直す</span></div>
                <div className="shortcut-row"><kbd>{mod}C</kbd> <span>コピー</span></div>
                <div className="shortcut-row"><kbd>{mod}X</kbd> <span>カット</span></div>
                <div className="shortcut-row"><kbd>{mod}V</kbd> <span>ペースト</span></div>
                <div className="shortcut-row"><kbd>{mod}⇧V</kbd> <span>画像ペースト</span></div>
                <div className="shortcut-row"><kbd>{mod}A</kbd> <span>全選択</span></div>
                <div className="shortcut-row"><kbd>Del</kbd> <span>削除</span></div>
                <div className="shortcut-row"><kbd>Ctrl+ホイール</kbd> <span>ズーム</span></div>
                <div className="shortcut-row"><kbd>Space+ドラッグ</kbd> <span>パン</span></div>
              </div>
            </div>
          )}
        </main>

        {/* 統合サイドバー */}
        <aside className="sidebar-right">
          <div className="sidebar-tabs">
            <button className={`tab-btn ${state.selectedIds.length === 0 ? 'active' : ''}`} onClick={() => selectLayers([])}>
              レイヤー
            </button>
            <button className={`tab-btn ${state.selectedIds.length > 0 ? 'active' : ''}`} onClick={() => {
              if (state.selectedIds.length === 0 && state.layers.length > 0) selectLayer(state.layers[state.layers.length-1].id)
            }}>
              プロパティ
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {state.selectedIds.length > 0 ? (
              <PropertiesPanel
                layers={state.layers}
                selectedIds={state.selectedIds}
                onUpdate={updateLayer}
                onMergeLayers={handleMergeLayers}
                onBgRemove={handleBgRemoveLayer}
                isBgRemoving={isBgRemoving}
              />
            ) : (
              <LayerPanel
                layers={state.layers}
                selectedIds={state.selectedIds}
                onSelect={(id, shift) => {
                  if (shift) toggleSelectLayer(id)
                  else selectLayer(id)
                }}
                onDelete={deleteLayer}
                onMoveUp={moveLayerUp}
                onMoveDown={moveLayerDown}
                onToggleVisibility={toggleLayerVisibility}
                onRename={renameLayer}
              />
            )}
          </div>
        </aside>
      </div>

      {/* キャンバスサイズダイアログ */}
      {showCanvasSizeDialog && (
        <CanvasSizeDialog
          currentWidth={state.canvasWidth}
          currentHeight={state.canvasHeight}
          onApply={(w, h) => { setCanvasSize(w, h); showToast(`キャンバス: ${w}×${h}`) }}
          onClose={() => setShowCanvasSizeDialog(false)}
        />
      )}

      {/* ドラッグオーバーオーバーレイ */}
      {isDragOver && (
        <div className="drop-overlay">
          <div className="drop-overlay-inner">
            <div className="drop-icon">📂</div>
            <p>画像をドロップして追加</p>
          </div>
        </div>
      )}

      {/* コンテキストメニュー */}
      {contextMenu && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          {contextMenu.layerId ? (
            <>
              <button className="context-item" onClick={() => moveLayerUp(contextMenu.layerId!)}>手前に移動</button>
              <button className="context-item" onClick={() => moveLayerDown(contextMenu.layerId!)}>奥に移動</button>
              <div className="context-divider" />
              <button className="context-item" onClick={() => { copySelectedLayers(); pasteFromClipboard() }}>複製</button>
              {state.selectedIds.length > 1 && (
                <button className="context-item" onClick={handleMergeLayers}>レイヤーを結合</button>
              )}
              <div className="context-divider" />
              {/* 画像レイヤーの場合のみ背景削除を表示 */}
              {(() => {
                const ctxLayer = state.layers.find((l) => l.id === contextMenu.layerId)
                if (ctxLayer?.type === 'image') {
                  return (
                    <button
                      className="context-item ai-context-item"
                      onClick={() => {
                        setContextMenu(null)
                        handleBgRemoveLayer(contextMenu.layerId!)
                      }}
                      disabled={isBgRemoving}
                    >
                      {isBgRemoving ? '⏳ AI処理中...' : '✨ 背景を削除 (AI)'}
                    </button>
                  )
                }
                return null
              })()}
              <div className="context-divider" />
              <button className="context-item danger" onClick={() => deleteSelectedLayers()}>削除</button>
            </>
          ) : (
            <>
              <button className="context-item" onClick={handlePasteImageFromClipboard}>クリップボードから貼り付け</button>
              <button className="context-item" onClick={addTextLayer}>テキストを追加</button>
              <div className="context-divider" />
              <button className="context-item" onClick={() => selectLayers([])}>選択を解除</button>
            </>
          )}
        </div>
      )}

      {/* トースト通知 */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
