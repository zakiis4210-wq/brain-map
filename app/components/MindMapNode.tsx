'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import styles from './MindMapNode.module.css'

type MindMapNodeData = {
  label: string
  onLabelChange: (id: string, newText: string) => void
  onEditingChange: (id: string, isEditing: boolean) => void
}

function MindMapNodeComponent({ id, data }: NodeProps) {
  const { label, onLabelChange, onEditingChange } = data as unknown as MindMapNodeData

  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(label)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // 編集外の時は外側 label と draft を同期(保存後やリロード後の反映)
  useEffect(() => {
    if (!isEditing) setDraft(label)
  }, [label, isEditing])

  // 編集開始時に input にフォーカス + 全選択
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
      // その他のキーは入力に通すが、外側のグローバル handler に届かないよう止める
      e.stopPropagation()
    }
  }

  const handleBlur = () => {
    if (isEditing) commit()
  }

  return (
    <div className={styles.node}>
      <Handle type="source" position={Position.Top} id="top" className={styles.handle} />
      <Handle type="source" position={Position.Right} id="right" className={styles.handle} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={styles.handle} />
      <Handle type="source" position={Position.Left} id="left" className={styles.handle} />

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
          {label || ' '}
        </div>
      )}
    </div>
  )
}

export default memo(MindMapNodeComponent)
