import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Stage, Layer, Image as KonvaImage, Text, Transformer, Rect, Line } from 'react-konva'
import Konva from 'konva'
import * as htmlToImage from 'html-to-image'
import { AnyLayer, ImageLayer, TextLayer } from '../types'

interface CanvasViewProps {
  layers: AnyLayer[]
  selectedIds: string[]
  canvasWidth: number
  canvasHeight: number
  bgColor: string
  onSelectLayer: (id: string | null) => void
  onSelectLayers: (ids: string[]) => void
  onUpdateLayer: (id: string, changes: Partial<AnyLayer>) => void
  onUpdateLayerImmediate: (id: string, changes: Partial<AnyLayer>) => void
  onContextMenu: (e: React.MouseEvent, layerId?: string) => void
  stageRef: React.RefObject<Konva.Stage | null>
  showGrid?: boolean
  cropLayerId?: string | null
  onCropDone?: (layerId: string, x: number, y: number, w: number, h: number) => void
  onCropCancel?: () => void
}

// 画像をロードするhook
function useImage(src: string): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!src) return
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.src = src
    img.onload = () => setImage(img)
    return () => { img.onload = null }
  }, [src])
  return image
}

// ─── 画像レイヤーノード ────────────────────────────────────────
function ImageLayerNode({
  layer, isSelected, onSelect, onUpdate, onUpdateImmediate, onContextMenu
}: {
  layer: ImageLayer
  isSelected: boolean
  onSelect: (shift: boolean) => void
  onUpdate: (c: Partial<ImageLayer>) => void
  onUpdateImmediate: (c: Partial<ImageLayer>) => void
  onContextMenu: (e: Konva.KonvaEventObject<MouseEvent>) => void
}) {
  const imageEl = useImage(layer.src)
  const nodeRef = useRef<Konva.Image>(null)
  const trRef = useRef<Konva.Transformer>(null)

  useEffect(() => {
    if (isSelected && trRef.current && nodeRef.current) {
      trRef.current.nodes([nodeRef.current])
      trRef.current.getLayer()?.batchDraw()
    }
  }, [isSelected])

  if (!imageEl || !layer.visible) return null

  return (
    <>
      <KonvaImage
        ref={nodeRef}
        id={layer.id}
        name="layer-node"
        image={imageEl}
        x={layer.x} y={layer.y}
        width={layer.width} height={layer.height}
        opacity={layer.opacity}
        draggable
        onClick={(e) => onSelect(e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey)}
        onTap={() => onSelect(false)}
        onContextMenu={onContextMenu}
        onDragEnd={(e) => onUpdate({ x: e.target.x(), y: e.target.y() })}
        onDragMove={(e) => onUpdateImmediate({ x: e.target.x(), y: e.target.y() })}
        onTransformEnd={() => {
          const node = nodeRef.current!
          const sx = node.scaleX(), sy = node.scaleY()
          node.scaleX(1); node.scaleY(1)
          onUpdate({ x: node.x(), y: node.y(), width: Math.max(5, node.width() * sx), height: Math.max(5, node.height() * sy) })
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          keepRatio={false}
          boundBoxFunc={(old, n) => (n.width < 10 || n.height < 10 ? old : n)}
        />
      )}
    </>
  )
}

// ─── テキストレイヤーノード ───────────────────────────────────
function TextLayerNode({
  layer, isSelected, onSelect, onUpdate, onUpdateImmediate, onDoubleClick, onContextMenu
}: {
  layer: TextLayer
  isSelected: boolean
  onSelect: (shift: boolean) => void
  onUpdate: (c: Partial<TextLayer>) => void
  onUpdateImmediate: (c: Partial<TextLayer>) => void
  onDoubleClick: (node: Konva.Text) => void
  onContextMenu: (e: Konva.KonvaEventObject<MouseEvent>) => void
}) {
  const nodeRef = useRef<any>(null) // Text | Image
  const trRef = useRef<Konva.Transformer>(null)
  
  // リッチテキストの場合に使う画像フック
  const richImageEl = useImage(layer.isRichText && layer.richDataUrl ? layer.richDataUrl : '')

  useEffect(() => {
    if (isSelected && trRef.current && nodeRef.current) {
      trRef.current.nodes([nodeRef.current])
      trRef.current.getLayer()?.batchDraw()
    }
  }, [isSelected, layer.isRichText, layer.richDataUrl])

  if (!layer.visible) return null

  // リッチテキスト（画像化済み）の描画
  if (layer.isRichText && layer.richDataUrl && richImageEl) {
    return (
      <>
        <KonvaImage
          ref={nodeRef}
          id={layer.id}
          name="layer-node"
          image={richImageEl}
          x={layer.x} y={layer.y}
          width={layer.width} height={layer.height}
          opacity={layer.opacity}
          draggable
          onClick={(e) => onSelect(e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey)}
          onTap={() => onSelect(false)}
          onDblClick={(e) => onDoubleClick(e.target as any)}
          onContextMenu={onContextMenu}
          onDragEnd={(e) => onUpdate({ x: e.target.x(), y: e.target.y() })}
          onDragMove={(e) => onUpdateImmediate({ x: e.target.x(), y: e.target.y() })}
          onTransformEnd={() => {
            const node = nodeRef.current!
            const sx = node.scaleX(), sy = node.scaleY()
            node.scaleX(1); node.scaleY(1)
            // リッチテキスト（画像）のスケール変更は幅高さに反映（文字サイズというより全体のサイズ変更になる）
            onUpdate({ x: node.x(), y: node.y(), width: Math.max(10, node.width() * sx), height: Math.max(10, node.height() * sy) })
          }}
        />
        {isSelected && (
          <Transformer
            ref={trRef}
            keepRatio={false}
            boundBoxFunc={(old, n) => (n.width < 10 || n.height < 10 ? old : n)}
          />
        )}
      </>
    )
  }

  // 通常のプレーンテキスト描画
  return (
    <>
      <Text
        ref={nodeRef}
        id={layer.id}
        name="layer-node"
        text={layer.text}
        x={layer.x} y={layer.y}
        fontSize={layer.fontSize}
        fontFamily={layer.fontFamily}
        fontStyle={([layer.bold ? 'bold' : '', layer.italic ? 'italic' : ''].filter(Boolean).join(' ')) || 'normal'}
        fill={layer.fill}
        opacity={layer.opacity}
        align={layer.align}
        stroke={layer.strokeWidth > 0 ? layer.strokeColor : undefined}
        strokeWidth={layer.strokeWidth > 0 ? layer.strokeWidth : undefined}
        shadowColor={layer.shadowBlur > 0 ? layer.shadowColor : undefined}
        shadowBlur={layer.shadowBlur > 0 ? layer.shadowBlur : undefined}
        shadowOffsetX={layer.shadowBlur > 0 ? layer.shadowOffsetX : undefined}
        shadowOffsetY={layer.shadowBlur > 0 ? layer.shadowOffsetY : undefined}
        draggable
        onClick={(e) => onSelect(e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey)}
        onTap={() => onSelect(false)}
        onDblClick={(e) => onDoubleClick(e.target as Konva.Text)}
        onContextMenu={onContextMenu}
        onDragEnd={(e) => onUpdate({ x: e.target.x(), y: e.target.y() })}
        onDragMove={(e) => onUpdateImmediate({ x: e.target.x(), y: e.target.y() })}
        onTransformEnd={() => {
          const node = nodeRef.current!
          const newFontSize = Math.max(8, layer.fontSize * node.scaleX())
          node.scaleX(1); node.scaleY(1)
          onUpdate({ x: node.x(), y: node.y(), fontSize: newFontSize })
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          enabledAnchors={['middle-left', 'middle-right']}
          boundBoxFunc={(old, n) => (n.width < 20 ? old : n)}
        />
      )}
    </>
  )
}

// ─── メインキャンバスビュー ────────────────────────────────────
export default function CanvasView({
  layers, selectedIds, canvasWidth, canvasHeight, bgColor,
  onSelectLayer, onSelectLayers, onUpdateLayer, onUpdateLayerImmediate, onContextMenu, stageRef,
  showGrid = false, cropLayerId = null, onCropDone, onCropCancel
}: CanvasViewProps) {
  // クロップ矩形の状態
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const cropStart = useRef<{ x: number; y: number } | null>(null)
  const isCroppingRef = useRef(false)
  // 通常ドラッグで開始した内部クロップの小笠 layerId
  const [internalCropLayerId, setInternalCropLayerId] = useState<string | null>(null)
  // 有効な cropLayerId（外部 props または内部自動）
  const activeCropLayerId = cropLayerId ?? internalCropLayerId
  // マーキー選択の状態
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const marqueeStart = useRef<{ x: number; y: number } | null>(null)
  const isDraggingLayer = useRef(false)

  // ズーム / パン 状態
  const [scale, setScale] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const isPanning = useRef(false)
  const panStart = useRef<{ x: number; y: number; stageX: number; stageY: number } | null>(null)
  const [isSpaceDown, setIsSpaceDown] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // インラインテキスト編集の状態
  const [editingText, setEditingText] = useState<{
    id: string; text: string; htmlContent: string; x: number; y: number;
    width: number; height: number; fontSize: number;
    fontFamily: string; fill: string; bold: boolean; italic: boolean;
    isRichText: boolean;
  } | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const [isRendering, setIsRendering] = useState(false)
  const isCommittingRef = useRef(false)

  // ── スペースキーでパンモード ──────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (e.code === 'Space' && !target.matches('input, textarea') && !target.isContentEditable) {
        e.preventDefault()
        setIsSpaceDown(true)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpaceDown(false)
        isPanning.current = false
        panStart.current = null
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // ── Ctrl+ホイールでズーム ─────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const scaleBy = 1.08
      const oldScale = scale
      const newScale = e.deltaY < 0
        ? Math.min(oldScale * scaleBy, 10)
        : Math.max(oldScale / scaleBy, 0.1)

      // マウス位置を基準にズーム
      const rect = el.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const newX = mouseX - (mouseX - stagePos.x) * (newScale / oldScale)
      const newY = mouseY - (mouseY - stagePos.y) * (newScale / oldScale)

      setScale(newScale)
      setStagePos({ x: newX, y: newY })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [scale, stagePos])

  // ズームリセット
  const resetZoom = useCallback(() => {
    setScale(1)
    setStagePos({ x: 0, y: 0 })
  }, [])

  const getPos = () => {
    const stage = stageRef.current!
    const pos = stage.getPointerPosition()!
    return pos
  }

  const handleStageMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    // 明示クロップモード（プロパティパネルボタンから）
    if (activeCropLayerId) {
      isCroppingRef.current = true
      const pos = getPos()
      cropStart.current = pos
      setCropRect({ x: pos.x, y: pos.y, w: 0, h: 0 })
      return
    }
    // パンモード
    if (isSpaceDown) {
      isPanning.current = true
      panStart.current = {
        x: e.evt.clientX,
        y: e.evt.clientY,
        stageX: stagePos.x,
        stageY: stagePos.y
      }
      return
    }
    // レイヤー上は除外
    const isOnLayer = e.target !== e.target.getStage() && !(e.target instanceof Konva.Rect && e.target.name() === 'bg')
    if (isOnLayer) {
      isDraggingLayer.current = true
      return
    }
    isDraggingLayer.current = false
    const pos = getPos()
    // 通常のマーキー選択（以前の自動クロップ判定は削除し、必ず範囲選択になるようにする）
    if (!e.evt.shiftKey && !e.evt.metaKey && !e.evt.ctrlKey) {
      onSelectLayer(null)
    }
    marqueeStart.current = pos
    setMarquee({ x: pos.x, y: pos.y, w: 0, h: 0 })
  }, [onSelectLayer, isSpaceDown, stagePos, activeCropLayerId, selectedIds, layers])

  const handleStageMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    // クロップ描画
    if (isCroppingRef.current && cropStart.current) {
      const pos = getPos()
      const sx = cropStart.current.x
      const sy = cropStart.current.y
      setCropRect({
        x: Math.min(sx, pos.x), y: Math.min(sy, pos.y),
        w: Math.abs(pos.x - sx), h: Math.abs(pos.y - sy)
      })
      return
    }
    // パン処理
    if (isPanning.current && panStart.current) {
      const dx = e.evt.clientX - panStart.current.x
      const dy = e.evt.clientY - panStart.current.y
      setStagePos({ x: panStart.current.stageX + dx, y: panStart.current.stageY + dy })
      return
    }

    if (!marqueeStart.current || isDraggingLayer.current) return
    const pos = getPos()
    const sx = marqueeStart.current.x
    const sy = marqueeStart.current.y
    setMarquee({
      x: Math.min(sx, pos.x),
      y: Math.min(sy, pos.y),
      w: Math.abs(pos.x - sx),
      h: Math.abs(pos.y - sy)
    })
  }, [])

  const handleStageMouseUp = useCallback(() => {
    if (isCroppingRef.current) {
      isCroppingRef.current = false
      return
    }
    if (isPanning.current) {
      isPanning.current = false
      panStart.current = null
      return
    }
    if (!marqueeStart.current || isDraggingLayer.current) {
      marqueeStart.current = null
      return
    }
    if (marquee && marquee.w > 4 && marquee.h > 4) {
      // 範囲選択完了（メニューを表示するため marquee は維持する）
    } else {
      setMarquee(null)
    }
    marqueeStart.current = null
  }, [marquee, layers, onSelectLayers])

  // ── テキストダブルクリック編集（ズーム補正付き） ──────────
  const handleTextDoubleClick = useCallback((node: any, layer: TextLayer) => {
    const stage = stageRef.current!
    const container = stage.container()
    const containerRect = container.getBoundingClientRect()

    // Stage座標 → スクリーン座標（ズーム・パンを考慮）
    const textAbsPos = node.absolutePosition()
    const x = containerRect.left + textAbsPos.x * scale + stagePos.x
    const y = containerRect.top + textAbsPos.y * scale + stagePos.y

    setEditingText({
      id: layer.id,
      text: layer.text,
      htmlContent: layer.htmlContent || layer.text.replace(/\n/g, '<br>'),
      x,
      y,
      width: Math.max(120, node.width() * node.scaleX() * scale),
      height: Math.max(layer.fontSize * 1.5 * scale, node.height() * node.scaleY() * scale),
      fontSize: layer.fontSize * scale,
      fontFamily: layer.fontFamily,
      fill: layer.fill,
      bold: layer.bold,
      italic: layer.italic,
      isRichText: !!layer.isRichText
    })
  }, [stageRef, scale, stagePos])

  // editor にフォーカス後に全選択（プレーンテキストの場合）
  useEffect(() => {
    if (editingText && editorRef.current && !editingText.isRichText) {
      editorRef.current.focus()
      // 全選択
      const range = document.createRange()
      range.selectNodeContents(editorRef.current)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    } else if (editingText && editorRef.current && editingText.isRichText) {
      editorRef.current.focus()
    }
  }, [editingText?.id])

  const commitTextEdit = useCallback(async () => {
    if (!editingText || !editorRef.current || isRendering) return
    // 二重実行を防止
    if (isCommittingRef.current) return
    isCommittingRef.current = true
    setIsRendering(true)
    
    try {
      const el = editorRef.current
      const newHtml = el.innerHTML
      const newText = el.innerText || ''
      
      // 画像化用のクローンをオフスクリーンに作成
      // モーダル枠の制約（幅やminHeight）を受けず、純粋なテキストのサイズで画像化するため
      const clone = document.createElement('div')
      clone.innerHTML = newHtml
      Object.assign(clone.style, {
        position: 'fixed',
        left: '-9999px',
        top: '-9999px',
        display: 'inline-block',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontSize: `${editingText.fontSize}px`, // 元のキャンバススケールのサイズ
        fontFamily: editingText.fontFamily,
        color: editingText.fill,
        fontWeight: editingText.bold ? 'bold' : 'normal',
        fontStyle: editingText.italic ? 'italic' : 'normal',
        lineHeight: '1.4',
        padding: '0',
        margin: '0',
        border: 'none',
        outline: 'none',
        background: 'transparent'
      })
      document.body.appendChild(clone)

      // 要素の実際のサイズを取得
      const rect = clone.getBoundingClientRect()

      const dataUrl = await htmlToImage.toPng(clone, {
        pixelRatio: 2,
        backgroundColor: 'rgba(0,0,0,0)',
        skipFonts: false,
        style: {
          margin: '0',
          padding: '0'
        }
      })
      
      document.body.removeChild(clone)

      onUpdateLayer(editingText.id, { 
        text: newText,
        htmlContent: newHtml,
        isRichText: true,
        richDataUrl: dataUrl,
        width: rect.width, // cloneはズーム適用前の元のフォントサイズで計算しているためそのまま
        height: rect.height
      } as Partial<TextLayer>)
    } catch (err) {
      console.error('テキストの画像化に失敗しました:', err)
      onUpdateLayer(editingText.id, { text: editorRef.current?.innerText || editingText.text } as Partial<TextLayer>)
    } finally {
      setIsRendering(false)
      setEditingText(null)
      isCommittingRef.current = false
    }
  }, [editingText, onUpdateLayer, isRendering, scale])

  // リッチテキストツールバーのアクション
  const execCmd = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val)
    editorRef.current?.focus()
  }

  const handleContextMenu = useCallback((e: Konva.KonvaEventObject<MouseEvent>, layerId?: string) => {
    e.evt.preventDefault()
    onContextMenu(e.evt as any as React.MouseEvent, layerId)
  }, [onContextMenu])

  // カーソルスタイル
  const cursor = activeCropLayerId
    ? 'crosshair'
    : isSpaceDown
      ? isPanning.current ? 'grabbing' : 'grab'
      : marqueeStart.current ? 'crosshair' : 'default'

  return (
    <div ref={containerRef} className="canvas-viewport" style={{ position: 'relative' }}>
      {/* ズームコントロール */}
      <div className="zoom-controls">
        <button className="zoom-btn" onClick={() => { setScale(s => Math.min(s * 1.2, 10)) }} title="拡大">+</button>
        <button className="zoom-level" onClick={resetZoom} title="リセット">{Math.round(scale * 100)}%</button>
        <button className="zoom-btn" onClick={() => { setScale(s => Math.max(s / 1.2, 0.1)) }} title="縮小">−</button>
      </div>

      <Stage
        ref={stageRef}
        width={canvasWidth}
        height={canvasHeight}
        scaleX={scale}
        scaleY={scale}
        x={stagePos.x}
        y={stagePos.y}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onContextMenu={(e) => handleContextMenu(e)}
        style={{ borderRadius: '4px', cursor }}
      >
        <Layer>
          {/* 背景 */}
          <Rect name="bg" width={canvasWidth} height={canvasHeight} fill={bgColor} />

          {/* レイヤー群 */}
          {layers.map((layer) => {
            const isSelected = selectedIds.includes(layer.id)
            if (layer.type === 'image') {
              return (
                <ImageLayerNode
                  key={layer.id}
                  layer={layer}
                  isSelected={isSelected}
                  onSelect={(shift) => {
                    if (shift) {
                      onSelectLayers(
                        isSelected
                          ? selectedIds.filter((x) => x !== layer.id)
                          : [...selectedIds, layer.id]
                      )
                    } else {
                      onSelectLayer(layer.id)
                    }
                  }}
                  onUpdate={(c) => onUpdateLayer(layer.id, c)}
                  onUpdateImmediate={(c) => onUpdateLayerImmediate(layer.id, c)}
                  onContextMenu={(e) => handleContextMenu(e, layer.id)}
                />
              )
            }
            if (layer.type === 'text') {
              return (
                <TextLayerNode
                  key={layer.id}
                  layer={layer}
                  isSelected={isSelected}
                  onSelect={(shift) => {
                    if (shift) {
                      onSelectLayers(
                        isSelected
                          ? selectedIds.filter((x) => x !== layer.id)
                          : [...selectedIds, layer.id]
                      )
                    } else {
                      onSelectLayer(layer.id)
                    }
                  }}
                  onUpdate={(c) => onUpdateLayer(layer.id, c)}
                  onUpdateImmediate={(c) => onUpdateLayerImmediate(layer.id, c)}
                  onDoubleClick={(node) => handleTextDoubleClick(node, layer)}
                  onContextMenu={(e) => handleContextMenu(e, layer.id)}
                />
              )
            }
            return null
          })}

          {/* グリッドオーバーレイ */}
          {showGrid && (() => {
            const step = 50
            const lines: React.ReactNode[] = []
            for (let x = 0; x <= canvasWidth; x += step) {
              lines.push(<Line key={`gv${x}`} points={[x, 0, x, canvasHeight]} stroke="rgba(255,255,255,0.12)" strokeWidth={x % 100 === 0 ? 0.8 : 0.4} listening={false} />)
            }
            for (let y = 0; y <= canvasHeight; y += step) {
              lines.push(<Line key={`gh${y}`} points={[0, y, canvasWidth, y]} stroke="rgba(255,255,255,0.12)" strokeWidth={y % 100 === 0 ? 0.8 : 0.4} listening={false} />)
            }
            return lines
          })()}

          {/* クロップ矩形 */}
          {activeCropLayerId && cropRect && cropRect.w > 2 && (
            <Rect
              x={cropRect.x} y={cropRect.y}
              width={cropRect.w} height={cropRect.h}
              fill="rgba(255,200,0,0.08)"
              stroke="#FFD700"
              strokeWidth={1.5}
              dash={[6, 4]}
              listening={false}
            />
          )}

          {/* マーキー選択矩形 */}
          {marquee && marquee.w > 2 && (
            <Rect
              x={marquee.x} y={marquee.y}
              width={marquee.w} height={marquee.h}
              fill="rgba(124,106,247,0.1)"
              stroke="#7c6af7"
              strokeWidth={1}
              dash={[4, 3]}
              listening={false}
            />
          )}
        </Layer>
      </Stage>

      {/* クロップモードUI (明示的なクロップ開始時) */}
      {activeCropLayerId && (
        <div style={{
          position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 8, zIndex: 100,
          background: 'rgba(20,20,30,0.92)', borderRadius: 10,
          padding: '8px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,215,0,0.4)'
        }}>
          <span style={{ color: '#FFD700', fontSize: 13, alignSelf: 'center' }}>✂ クロップ範囲を選択してください</span>
          <button className="tool-btn accent" disabled={!cropRect || cropRect.w < 4 || cropRect.h < 4}
            onClick={() => {
              if (cropRect && onCropDone) {
                const layer = layers.find(l => l.id === activeCropLayerId)
                if (layer) onCropDone(activeCropLayerId, cropRect.x - layer.x, cropRect.y - layer.y, cropRect.w, cropRect.h)
              }
              setCropRect(null); cropStart.current = null; isCroppingRef.current = false; setInternalCropLayerId(null)
            }}
          >✓ 確定</button>
          <button className="tool-btn" onClick={() => {
            setCropRect(null); cropStart.current = null; isCroppingRef.current = false; setInternalCropLayerId(null); onCropCancel?.()
          }}>✕ キャンセル</button>
        </div>
      )}

      {/* 範囲選択(マーキー)後のフローティングメニュー */}
      {marquee && !marqueeStart.current && (
        <div style={{
          position: 'absolute',
          top: Math.min(marquee.y * scale + stagePos.y + marquee.h * scale + 10, canvasHeight * scale + stagePos.y - 50),
          left: marquee.x * scale + stagePos.x + (marquee.w * scale) / 2,
          transform: 'translateX(-50%)',
          display: 'flex', gap: 6, zIndex: 100,
          background: 'rgba(30,30,40,0.95)', borderRadius: 8,
          padding: '6px', boxShadow: '0 4px 15px rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <button className="tool-btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => {
            // オブジェクト選択
            const { x, y, w, h } = marquee
            const hits = layers.filter((l) => {
              if (!l.visible) return false
              return l.x < x + w && l.x + l.width > x && l.y < y + h && l.y + l.height > y
            })
            onSelectLayers(hits.map((l) => l.id))
            setMarquee(null)
          }}>
            🤚 選択
          </button>
          <button className="tool-btn accent" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => {
            // クロップ処理（領域内の最前面の画像を対象とする、または選択中の画像）
            const { x, y, w, h } = marquee
            let targetImgId: string | null = null
            
            // 単一選択中の画像があればそれを優先
            if (selectedIds.length === 1) {
              const selLayer = layers.find(l => l.id === selectedIds[0])
              if (selLayer?.type === 'image') targetImgId = selLayer.id
            }
            // なければ矩形内の最前面の画像を探す（背面から前面の順で格納されていると仮定して後ろから探す）
            if (!targetImgId) {
              for (let i = layers.length - 1; i >= 0; i--) {
                const l = layers[i]
                if (l.type === 'image' && l.visible && l.x < x + w && l.x + l.width > x && l.y < y + h && l.y + l.height > y) {
                  targetImgId = l.id
                  break
                }
              }
            }
            
            if (targetImgId && onCropDone) {
              const layer = layers.find(l => l.id === targetImgId)!
              onCropDone(targetImgId, x - layer.x, y - layer.y, w, h)
            } else {
              // 画像がない場合のフィードバック（ここは簡単なアラート代わり）
              console.warn("クロップ対象の画像が見つかりません")
            }
            setMarquee(null)
          }}>
            ✂ カット(切り抜き)
          </button>
          <button className="tool-btn" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setMarquee(null)}>
            ✕
          </button>
        </div>
      )}

      {/* テキスト編集モーダル */}
      {editingText && (
        <>
          {/* 背景オーバーレイ（クリックで確定） */}
          <div
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(2px)',
              zIndex: 200,
            }}
            onMouseDown={() => commitTextEdit()}
          />
          {/* 編集ダイアログ本体 */}
          <div
            className="text-edit-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* タイトルバー */}
            <div className="text-edit-modal-header">
              <span>テキスト編集</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="tool-btn accent" onClick={commitTextEdit} disabled={isRendering} style={{ padding: '4px 12px', fontSize: 12 }}>
                  {isRendering ? '⏳ 処理中...' : '✓ 確定 (⌘Enter)'}
                </button>
                <button className="tool-btn" onClick={() => setEditingText(null)} style={{ padding: '4px 10px', fontSize: 12 }}>✕</button>
              </div>
            </div>

            {/* フォーマットツールバー */}
            <div className="text-edit-modal-toolbar" onMouseDown={(e) => e.preventDefault()}>
              <button className="tool-btn icon-only" onClick={() => execCmd('bold')} title="太字 (Ctrl+B)"><strong>B</strong></button>
              <button className="tool-btn icon-only" onClick={() => execCmd('italic')} title="斜体 (Ctrl+I)"><em>I</em></button>
              <button className="tool-btn icon-only" onClick={() => execCmd('underline')} title="下線 (Ctrl+U)"><u>U</u></button>
              <button className="tool-btn icon-only" onClick={() => execCmd('strikeThrough')} title="取り消し線"><s>S</s></button>
              <div className="toolbar-divider" />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                文字色
                <input
                  type="color"
                  defaultValue={editingText.fill}
                  onChange={(e) => execCmd('foreColor', e.target.value)}
                  title="文字色"
                  style={{ width: 28, height: 28, padding: 2, border: '1px solid var(--border-light)', borderRadius: 4, background: 'none', cursor: 'pointer' }}
                />
              </label>
              <div className="toolbar-divider" />
              <select
                onChange={(e) => execCmd('fontName', e.target.value)}
                defaultValue={editingText.fontFamily}
                className="prop-select"
                style={{ width: 130, height: 28, fontSize: 12 }}
              >
                <option value="Noto Sans JP">Noto Sans JP</option>
                <option value="Arial">Arial</option>
                <option value="Georgia">Georgia</option>
                <option value="Courier New">Courier New</option>
                <option value="Impact">Impact</option>
                <option value="Comic Sans MS">Comic Sans MS</option>
                <option value="Times New Roman">Times New Roman</option>
              </select>
            </div>

            {/* エディタ本体 */}
            <div className="text-edit-modal-body">
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                className="text-edit-editor"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setEditingText(null)
                    e.preventDefault()
                    return
                  }
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    commitTextEdit()
                    e.preventDefault()
                    return
                  }
                }}
                onBlur={(e) => {
                  const related = e.relatedTarget as HTMLElement | null
                  if (related && related.closest('.text-edit-modal')) {
                    setTimeout(() => editorRef.current?.focus(), 0)
                    return
                  }
                  // モーダル外にフォーカスが出た場合のみ確定
                  // （オーバーレイのonMouseDownが処理するので何もしない）
                }}
                dangerouslySetInnerHTML={{ __html: editingText.htmlContent || editingText.text }}
                style={{
                  minHeight: 80,
                  fontSize: `${Math.min(editingText.fontSize, 48)}px`,
                  fontFamily: editingText.fontFamily,
                  color: editingText.fill,
                  fontWeight: editingText.bold ? 'bold' : 'normal',
                  fontStyle: editingText.italic ? 'italic' : 'normal',
                  lineHeight: '1.4',
                  outline: 'none',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  opacity: isRendering ? 0.5 : 1,
                  pointerEvents: isRendering ? 'none' : 'auto',
                }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
