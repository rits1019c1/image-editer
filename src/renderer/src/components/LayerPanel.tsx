import { useState, useRef } from 'react'
import { AnyLayer } from '../types'

interface LayerPanelProps {
  layers: AnyLayer[]
  selectedIds: string[]
  onSelect: (id: string, shift: boolean) => void
  onDelete: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  onToggleVisibility: (id: string) => void
  onRename: (id: string, newName: string) => void
}

export default function LayerPanel({
  layers, selectedIds, onSelect, onDelete, onMoveUp, onMoveDown, onToggleVisibility, onRename
}: LayerPanelProps) {
  const reversed = [...layers].reverse()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const startEditing = (id: string, name: string) => {
    setEditingId(id)
    setEditingName(name)
    // フォーカスは次のフレームで
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commitRename = () => {
    if (editingId && editingName.trim()) {
      onRename(editingId, editingName.trim())
    }
    setEditingId(null)
  }

  return (
    <div className="layer-panel">
      <div className="panel-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        レイヤー
        {selectedIds.length > 1 && (
          <span className="layer-count-badge">{selectedIds.length}</span>
        )}
      </div>
      <div className="layer-list">
        {reversed.length === 0 && (
          <div className="layer-empty">レイヤーがありません</div>
        )}
        {reversed.map((layer) => {
          const isSelected = selectedIds.includes(layer.id)
          const isEditing = editingId === layer.id
          return (
            <div
              key={layer.id}
              className={`layer-item ${isSelected ? 'selected' : ''} ${!layer.visible ? 'hidden-layer' : ''}`}
              onClick={(e) => onSelect(layer.id, e.shiftKey || e.metaKey || e.ctrlKey)}
            >
              {/* 表示/非表示 */}
              <button
                className={`layer-btn eye-btn ${!layer.visible ? 'dimmed' : ''}`}
                onClick={(e) => { e.stopPropagation(); onToggleVisibility(layer.id) }}
                title={layer.visible ? '非表示' : '表示'}
              >
                {layer.visible ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                )}
              </button>

              {/* タイプアイコン */}
              <span className="layer-type-icon">
                {layer.type === 'image' ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>
                  </svg>
                )}
              </span>

              {/* 名前（ダブルクリックでインライン編集） */}
              {isEditing ? (
                <input
                  ref={inputRef}
                  className="layer-name-input"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { commitRename(); e.preventDefault() }
                    if (e.key === 'Escape') { setEditingId(null); e.preventDefault() }
                    e.stopPropagation()
                  }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span
                  className="layer-name"
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    startEditing(layer.id, layer.name)
                  }}
                  title="ダブルクリックで名前を変更"
                >
                  {layer.name}
                </span>
              )}

              {/* 順序変更 */}
              <div className="layer-order-btns">
                <button className="layer-btn" onClick={(e) => { e.stopPropagation(); onMoveUp(layer.id) }} title="前面へ">↑</button>
                <button className="layer-btn" onClick={(e) => { e.stopPropagation(); onMoveDown(layer.id) }} title="背面へ">↓</button>
              </div>

              {/* 削除 */}
              <button className="layer-btn delete-btn"
                onClick={(e) => { e.stopPropagation(); onDelete(layer.id) }}
                title="削除">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
