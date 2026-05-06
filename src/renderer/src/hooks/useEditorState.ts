import { useState, useCallback, useRef } from 'react'
import { AnyLayer, ImageLayer, TextLayer, EditorState } from '../types'

const DEFAULT_CANVAS_W = 1200
const DEFAULT_CANVAS_H = 800
const HISTORY_LIMIT = 50

const createId = () => `layer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

function cloneState(s: EditorState): EditorState {
  return { ...s, layers: s.layers.map((l) => ({ ...l })) }
}

// 背景色の輝度を計算して白か黒かを返す
function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  // W3C輝度計算
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000000' : '#ffffff'
}

export function useEditorState() {
  const [state, setState] = useState<EditorState>({
    layers: [],
    selectedIds: [],
    canvasWidth: DEFAULT_CANVAS_W,
    canvasHeight: DEFAULT_CANVAS_H,
    bgColor: '#1a1a2e'
  })

  // Undo/Redo スタック
  const undoStack = useRef<EditorState[]>([])
  const redoStack = useRef<EditorState[]>([])

  // 選択状態のみ更新（履歴に積まない）
  const setSelectionOnly = useCallback((ids: string[]) => {
    setState((prev) => ({ ...prev, selectedIds: ids }))
  }, [])

  // ─── Undo / Redo ───────────────────────────────────────
  const undo = useCallback(() => {
    setState((current) => {
      const prev = undoStack.current.pop()
      if (!prev) return current
      redoStack.current.push(cloneState(current))
      return prev
    })
  }, [])

  const redo = useCallback(() => {
    setState((current) => {
      const next = redoStack.current.pop()
      if (!next) return current
      undoStack.current.push(cloneState(current))
      return next
    })
  }, [])

  // ─── レイヤー選択 ─────────────────────────────────────
  const selectLayer = useCallback((id: string | null) => {
    setSelectionOnly(id ? [id] : [])
  }, [setSelectionOnly])

  const selectLayers = useCallback((ids: string[]) => {
    setSelectionOnly(ids)
  }, [setSelectionOnly])

  const toggleSelectLayer = useCallback((id: string) => {
    setState((prev) => {
      const already = prev.selectedIds.includes(id)
      return {
        ...prev,
        selectedIds: already
          ? prev.selectedIds.filter((x) => x !== id)
          : [...prev.selectedIds, id]
      }
    })
  }, [])

  // ─── 追加 ─────────────────────────────────────────────
  const addImageLayer = useCallback((src: string, name = '画像') => {
    const newLayer: ImageLayer = {
      id: createId(),
      type: 'image',
      name,
      src,
      originalSrc: src,
      x: 100 + Math.random() * 60,
      y: 100 + Math.random() * 60,
      width: 400,
      height: 300,
      visible: true,
      opacity: 1,
      filterType: 'none',
      filterStrength: 0.5,
      swirlCenterX: 0.5,
      swirlCenterY: 0.5,
      swirlRadius: 0.5,
      swirlDirection: 1,
      swirlRotations: 2
    }
    setState((prev) => {
      const next = cloneState(prev)
      undoStack.current.push(cloneState(prev))
      if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift()
      redoStack.current = []
      next.layers = [...next.layers, newLayer]
      next.selectedIds = [newLayer.id]
      return next
    })
  }, [])

  const addTextLayer = useCallback(() => {
    setState((prev) => {
      // 背景色に合わせてデフォルト文字色を決定
      const autoFill = getContrastColor(prev.bgColor)
      const newLayer: TextLayer = {
        id: createId(),
        type: 'text',
        name: 'テキスト',
        text: 'テキストを入力',
        x: 200 + Math.random() * 40,
        y: 200 + Math.random() * 40,
        width: 300,
        height: 60,
        fontSize: 36,
        fontFamily: 'Noto Sans JP',
        fill: autoFill,
        bold: false,
        italic: false,
        align: 'left',
        visible: true,
        opacity: 1
      }
      undoStack.current.push(cloneState(prev))
      if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift()
      redoStack.current = []
      return { ...cloneState(prev), layers: [...prev.layers, newLayer], selectedIds: [newLayer.id] }
    })
  }, [])

  // ─── 更新 ─────────────────────────────────────────────
  const updateLayer = useCallback((id: string, changes: Partial<AnyLayer>) => {
    setState((prev) => {
      undoStack.current.push(cloneState(prev))
      if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift()
      redoStack.current = []
      return {
        ...prev,
        layers: prev.layers.map((l) => (l.id === id ? ({ ...l, ...changes } as AnyLayer) : l))
      }
    })
  }, [])

  // ドラッグ中など頻繁な更新（履歴に積まない）
  const updateLayerImmediate = useCallback((id: string, changes: Partial<AnyLayer>) => {
    setState((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === id ? ({ ...l, ...changes } as AnyLayer) : l))
    }))
  }, [])

  // レイヤー名の更新（履歴に積む）
  const renameLayer = useCallback((id: string, newName: string) => {
    setState((prev) => {
      undoStack.current.push(cloneState(prev))
      if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift()
      redoStack.current = []
      return {
        ...prev,
        layers: prev.layers.map((l) => (l.id === id ? { ...l, name: newName } : l))
      }
    })
  }, [])

  // ─── 削除 ─────────────────────────────────────────────
  const deleteLayer = useCallback((id: string) => {
    setState((prev) => {
      undoStack.current.push(cloneState(prev))
      redoStack.current = []
      return {
        ...prev,
        layers: prev.layers.filter((l) => l.id !== id),
        selectedIds: prev.selectedIds.filter((x) => x !== id)
      }
    })
  }, [])

  const deleteSelectedLayers = useCallback(() => {
    setState((prev) => {
      if (prev.selectedIds.length === 0) return prev
      undoStack.current.push(cloneState(prev))
      redoStack.current = []
      return {
        ...prev,
        layers: prev.layers.filter((l) => !prev.selectedIds.includes(l.id)),
        selectedIds: []
      }
    })
  }, [])

  // ─── 順序変更 ──────────────────────────────────────────
  const moveLayerUp = useCallback((id: string) => {
    setState((prev) => {
      const idx = prev.layers.findIndex((l) => l.id === id)
      if (idx >= prev.layers.length - 1) return prev
      undoStack.current.push(cloneState(prev))
      redoStack.current = []
      const next = [...prev.layers]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return { ...prev, layers: next }
    })
  }, [])

  const moveLayerDown = useCallback((id: string) => {
    setState((prev) => {
      const idx = prev.layers.findIndex((l) => l.id === id)
      if (idx <= 0) return prev
      undoStack.current.push(cloneState(prev))
      redoStack.current = []
      const next = [...prev.layers]
      ;[next[idx], next[idx - 1]] = [next[idx - 1], next[idx]]
      return { ...prev, layers: next }
    })
  }, [])

  const toggleLayerVisibility = useCallback((id: string) => {
    setState((prev) => {
      undoStack.current.push(cloneState(prev))
      redoStack.current = []
      return {
        ...prev,
        layers: prev.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
      }
    })
  }, [])

  const setBgColor = useCallback((color: string) => {
    setState((prev) => {
      undoStack.current.push(cloneState(prev))
      redoStack.current = []
      return { ...prev, bgColor: color }
    })
  }, [])

  // ─── キャンバスサイズ変更 ──────────────────────────────
  const setCanvasSize = useCallback((width: number, height: number) => {
    setState((prev) => {
      undoStack.current.push(cloneState(prev))
      redoStack.current = []
      return { ...prev, canvasWidth: width, canvasHeight: height }
    })
  }, [])

  // ─── コピー / カット / ペースト ────────────────────────
  const clipboard = useRef<AnyLayer[]>([])

  const copySelectedLayers = useCallback(() => {
    setState((prev) => {
      const toCopy = prev.layers.filter((l) => prev.selectedIds.includes(l.id))
      clipboard.current = toCopy.map((l) => ({ ...l }))
      return prev
    })
  }, [])

  const cutSelectedLayers = useCallback(() => {
    setState((prev) => {
      if (prev.selectedIds.length === 0) return prev
      clipboard.current = prev.layers
        .filter((l) => prev.selectedIds.includes(l.id))
        .map((l) => ({ ...l }))
      undoStack.current.push(cloneState(prev))
      redoStack.current = []
      return {
        ...prev,
        layers: prev.layers.filter((l) => !prev.selectedIds.includes(l.id)),
        selectedIds: []
      }
    })
  }, [])

  const pasteFromClipboard = useCallback(() => {
    if (clipboard.current.length === 0) return false

    const offset = 20
    const pasted: AnyLayer[] = clipboard.current.map((l) => ({
      ...l,
      id: createId(),
      x: l.x + offset,
      y: l.y + offset,
      name: l.name + ' コピー'
    }))
    setState((prev) => {
      undoStack.current.push(cloneState(prev))
      redoStack.current = []
      return {
        ...prev,
        layers: [...prev.layers, ...pasted],
        selectedIds: pasted.map((p) => p.id)
      }
    })
    // 次回ペーストをさらにオフセット
    clipboard.current = pasted.map((p) => ({ ...p }))
    return true
  }, [])

  return {
    state,
    undo,
    redo,
    selectLayer,
    selectLayers,
    toggleSelectLayer,
    addImageLayer,
    addTextLayer,
    updateLayer,
    updateLayerImmediate,
    renameLayer,
    deleteLayer,
    deleteSelectedLayers,
    moveLayerUp,
    moveLayerDown,
    toggleLayerVisibility,
    setBgColor,
    setCanvasSize,
    copySelectedLayers,
    cutSelectedLayers,
    pasteFromClipboard
  }
}
