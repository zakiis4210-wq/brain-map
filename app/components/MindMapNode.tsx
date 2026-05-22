'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import styles from './MindMapNode.module.css'

type MindMapNodeData = {
  label: string
  isRoot?: boolean
  side?: 'left' | 'right' | null
  childCount?: number
  collapsed?: boolean
  onLabelChange: (id: string, newText: string) => void
  onEditingChange: (id: string, isEditing: boolean) => void
  onToggleCollapse?: (id: string) => void
}

function MindMapNodeComponent({ id, data, selected }: NodeProps) {
  const {
    label,
    isRoot,
    side,
    childCount,
    collapsed,
    onLabelChange,
    onEditingChange,
    onToggleCollapse,
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

  // ルートノードは円形、子は丸角矩形
  // ハンドル位置: ルートは左右両方、子は親側のみ target、反対側に source
  const nodeClass = [
    styles.node,
    isRoot ? styles.root : '',
    selected ? styles.selected : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={nodeClass}>
      {/* ルートは左右両方に target/source、子はsideに応じて配置 */}
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

      {/* 折りたたみバッジ: 子があるときだけ表示 */}
      {!isRoot && childCount && childCount > 0 && onToggleCollapse && (
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
    </div>
  )
}

export default memo(MindMapNodeComponent)
