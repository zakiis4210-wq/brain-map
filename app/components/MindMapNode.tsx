'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, DragEvent } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import styles from './MindMapNode.module.css'

type MindMapNodeData = {
  label: string
  isRoot?: boolean
  side?: 'left' | 'right' | null
  childCount?: number
  collapsed?: boolean
  color?: string | null
  icon?: string | null
  dropTarget?: boolean
  onLabelChange: (id: string, newText: string) => void
  onEditingChange: (id: string, isEditing: boolean) => void
  onToggleCollapse?: (id: string) => void
  onReparentDragStart?: (id: string) => void
  onReparentDragEnd?: () => void
  onReparentDragOver?: (id: string) => void
  onReparentDrop?: (id: string) => void
}

function MindMapNodeComponent({ id, data, selected }: NodeProps) {
  const {
    label,
    isRoot,
    side,
    childCount,
    collapsed,
    color,
    icon,
    dropTarget,
    onLabelChange,
    onEditingChange,
    onToggleCollapse,
    onReparentDragStart,
    onReparentDragEnd,
    onReparentDragOver,
    onReparentDrop,
  } = data as unknown as MindMapNodeData

  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(label)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!isEditing) setDraft(label)
  }, [label, isEditing])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const enterEdit = useCallback(() => {
    setDraft(label)
    setIsEditing(true)
    onEditingChange(id, true)
  }, [id, label, onEditingChange])

  const commit = useCallback(() => {
    setIsEditing(false)
    onEditingChange(id, false)
    if (draft !== label) {
      onLabelChange(id, draft)
    }
  }, [id, draft, label, onLabelChange, onEditingChange])

  const cancel = useCallback(() => {
    setDraft(label)
    setIsEditing(false)
    onEditingChange(id, false)
  }, [id, label, onEditingChange])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      cancel()
    } else {
      e.stopPropagation()
    }
  }

  const handleBlur = () => {
    if (isEditing) commit()
  }

  // HTML5 D&D で親付け替え(react-flow のノードドラッグと競合しないよう専用ハンドルで)
  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/x-mindmap-node-id', id)
    onReparentDragStart?.(id)
  }
  const handleDragEnd = (e: DragEvent<HTMLDivElement>) => {
    e.stopPropagation()
    onReparentDragEnd?.()
  }
  const handleNodeDragOver = (e: DragEvent<HTMLDivElement>) => {
    // ドロップ対象として受け入れ
    if (e.dataTransfer.types.includes('application/x-mindmap-node-id')) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      onReparentDragOver?.(id)
    }
  }
  const handleNodeDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('application/x-mindmap-node-id')) return
    e.preventDefault()
    e.stopPropagation()
    onReparentDrop?.(id)
  }

  const nodeClass = [
    styles.node,
    isRoot ? styles.root : '',
    selected ? styles.selected : '',
    dropTarget ? styles.dropTarget : '',
  ]
    .filter(Boolean)
    .join(' ')

  // 配色: data.color があれば優先 (CSS 変数を上書き)
  const nodeStyle = color ? { background: color } : undefined

  return (
    <div
      className={nodeClass}
      style={nodeStyle}
      onDragOver={handleNodeDragOver}
      onDrop={handleNodeDrop}
    >
      {isRoot ? (
        <>
          <Handle
            type="source"
            position={Position.Left}
            id="left"
            className={styles.handle}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="right"
            className={styles.handle}
          />
        </>
      ) : side === 'left' ? (
        <>
          <Handle
            type="target"
            position={Position.Right}
            id="target-right"
            className={styles.handle}
          />
          <Handle
            type="source"
            position={Position.Left}
            id="left"
            className={styles.handle}
          />
        </>
      ) : (
        <>
          <Handle
            type="target"
            position={Position.Left}
            id="target-left"
            className={styles.handle}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="right"
            className={styles.handle}
          />
        </>
      )}

      <div className={styles.body}>
        {icon && <span className={styles.icon}>{icon}</span>}
        {isEditing ? (
          <input
            ref={inputRef}
            className={`nodrag nopan ${styles.input}`}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
          />
        ) : (
          <div className={styles.label} onDoubleClick={enterEdit}>
            {label || ' '}
          </div>
        )}
      </div>

      {/* 折りたたみバッジ */}
      {!isRoot && !!childCount && childCount > 0 && !!onToggleCollapse && (
        <button
          type="button"
          className={`nodrag ${styles.collapseBadge} ${
            side === 'left' ? styles.badgeLeft : styles.badgeRight
          }`}
          onClick={e => {
            e.stopPropagation()
            onToggleCollapse(id)
          }}
          title={collapsed ? '展開' : '折りたたみ'}
        >
          {collapsed ? `+${childCount}` : '−'}
        </button>
      )}

      {/* ルート以外に親付け替え用ドラッグハンドルを表示 */}
      {!isRoot && (
        <div
          className={`nodrag ${styles.moveHandle}`}
          draggable
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          title="ドラッグで親を変更"
        >
          ⤴
        </div>
      )}
    </div>
  )
}

export default memo(MindMapNodeComponent)
