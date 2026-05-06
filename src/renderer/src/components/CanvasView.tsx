import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Stage, Layer, Image as KonvaImage, Text, Transformer, Rect } from 'react-konva'
import Konva from 'konva'
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
  const nodeRef = useRef<Konva.Text>(null)
  const trRef = useRef<Konva.Transformer>(null)

  useEffect(() => {
    if (isSelected && trRef.current && nodeRef.current) {
      trRef.current.nodes([nodeRef.current])
      trRef.current.getLayer()?.batchDraw()
    }
  }, [isSelected])

  if (!layer.visible) return null

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
  onSelectLayer, onSelectLayers, onUpdateLayer, onUpdateLayerImmediate, onContextMenu, stageRef
}: CanvasViewProps) {
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
    id: string; text: string; x: number; y: number;
    width: number; height: number; fontSize: number;
    fontFamily: string; fill: string; bold: boolean; italic: boolean;
  } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── スペースキーでパンモード ──────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement).matches('input, textarea')) {
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

    // レイヤー上クリックは除外
    if (e.target !== e.target.getStage() && !(e.target instanceof Konva.Rect && e.target.name() === 'bg')) {
      isDraggingLayer.current = true
      return
    }
    isDraggingLayer.current = false
    // ⌘/Ctrl なし → 選択解除して矩形選択開始
    if (!e.evt.shiftKey && !e.evt.metaKey && !e.evt.ctrlKey) {
      onSelectLayer(null)
    }
    const pos = getPos()
    marqueeStart.current = pos
    setMarquee({ x: pos.x, y: pos.y, w: 0, h: 0 })
  }, [onSelectLayer, isSpaceDown, stagePos])

  const handleStageMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
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
      // 矩形内のレイヤーを選択
      const { x, y, w, h } = marquee
      const hits = layers.filter((l) => {
        if (!l.visible) return false
        return l.x < x + w && l.x + l.width > x && l.y < y + h && l.y + l.height > y
      })
      onSelectLayers(hits.map((l) => l.id))
    }
    marqueeStart.current = null
    setMarquee(null)
  }, [marquee, layers, onSelectLayers])

  // ── テキストダブルクリック編集（ズーム補正付き） ──────────
  const handleTextDoubleClick = useCallback((node: Konva.Text, layer: TextLayer) => {
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
      x,
      y,
      width: Math.max(120, node.width() * node.scaleX() * scale),
      height: Math.max(layer.fontSize * 1.5 * scale, node.height() * node.scaleY() * scale),
      fontSize: layer.fontSize * scale,
      fontFamily: layer.fontFamily,
      fill: layer.fill,
      bold: layer.bold,
      italic: layer.italic
    })
  }, [stageRef, scale, stagePos])

  // textarea にフォーカス後に全選択
  useEffect(() => {
    if (editingText && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
    }
  }, [editingText?.id])

  const commitTextEdit = useCallback(() => {
    if (!editingText) return
    onUpdateLayer(editingText.id, { text: editingText.text } as Partial<TextLayer>)
    setEditingText(null)
  }, [editingText, onUpdateLayer])

  const handleContextMenu = useCallback((e: Konva.KonvaEventObject<MouseEvent>, layerId?: string) => {
    e.evt.preventDefault()
    onContextMenu(e.evt as any as React.MouseEvent, layerId)
  }, [onContextMenu])

  // カーソルスタイル
  const cursor = isSpaceDown
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

      {/* インラインテキスト編集エリア */}
      {editingText && (
        <textarea
          ref={textareaRef}
          className="inline-text-edit"
          value={editingText.text}
          onChange={(e) => setEditingText({ ...editingText, text: e.target.value })}
          onKeyDown={(e) => {
            // Escape → キャンセル（変更を破棄）
            if (e.key === 'Escape') {
              setEditingText(null)
              e.preventDefault()
              return
            }
            // Ctrl+Enter / Cmd+Enter → 確定
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              commitTextEdit()
              e.preventDefault()
              return
            }
          }}
          onBlur={commitTextEdit}
          style={{
            position: 'fixed',
            left: editingText.x,
            top: editingText.y,
            minWidth: editingText.width,
            minHeight: editingText.height,
            fontSize: `${editingText.fontSize}px`,
            fontFamily: editingText.fontFamily,
            color: editingText.fill,
            fontWeight: editingText.bold ? 'bold' : 'normal',
            fontStyle: editingText.italic ? 'italic' : 'normal',
            lineHeight: '1.2',
            background: 'rgba(0,0,0,0.4)',
            border: '1px dashed var(--accent-main)',
            outline: 'none',
            padding: '2px 4px',
            margin: 0,
            overflow: 'hidden',
            resize: 'none',
            zIndex: 100,
            borderRadius: '2px',
          }}
        />
      )}
    </div>
  )
}
