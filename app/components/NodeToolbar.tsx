'use client'

import { useState } from 'react'

// MindMeister 風のフローティング装飾ツールバー
// 選択中のノードに対して 色 / 絵文字 を適用

export const COLOR_PRESETS: { key: string; label: string; value: string | null }[] = [
  { key: 'default', label: '既定', value: null },
  { key: 'red', label: '赤', value: '#fee2e2' },
  { key: 'orange', label: '橙', value: '#ffedd5' },
  { key: 'yellow', label: '黄', value: '#fef9c3' },
  { key: 'green', label: '緑', value: '#dcfce7' },
  { key: 'blue', label: '青', value: '#dbeafe' },
  { key: 'purple', label: '紫', value: '#ede9fe' },
  { key: 'gray', label: '灰', value: '#f3f4f6' },
]

export const EMOJI_PRESETS = [
  '💡', '⭐', '❓', '✅', '⚠️', '🎯',
  '🔥', '📌', '🚀', '💬', '❤️', '🌟',
]

type Props = {
  visible: boolean
  currentColor: string | null
  currentIcon: string | null
  onChangeColor: (color: string | null) => void
  onChangeIcon: (icon: string | null) => void
}

export default function NodeToolbar({
  visible,
  currentColor,
  currentIcon,
  onChangeColor,
  onChangeIcon,
}: Props) {
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customDraft, setCustomDraft] = useState('')

  if (!visible) return null

  const submitCustom = () => {
    const v = customDraft.trim()
    if (v) onChangeIcon(v)
    setShowCustomInput(false)
    setCustomDraft('')
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 120,
        left: 16,
        zIndex: 10,
        background: 'var(--node-bg)',
        color: 'var(--node-fg)',
        border: '1px solid var(--node-border)',
        borderRadius: 8,
        padding: 12,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minWidth: 260,
      }}
    >
      {/* 配色 */}
      <div>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>配色</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {COLOR_PRESETS.map(c => (
            <button
              key={c.key}
              onClick={() => onChangeColor(c.value)}
              title={c.label}
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                cursor: 'pointer',
                background: c.value ?? 'transparent',
                border:
                  currentColor === c.value
                    ? '2px solid var(--node-border-active)'
                    : '1px solid var(--node-border)',
                position: 'relative',
              }}
            >
              {c.value === null && (
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    color: 'var(--node-fg)',
                  }}
                >
                  ⊘
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* アイコン */}
      <div>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>アイコン</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {EMOJI_PRESETS.map(e => (
            <button
              key={e}
              onClick={() => onChangeIcon(e)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                cursor: 'pointer',
                background: 'transparent',
                border:
                  currentIcon === e
                    ? '2px solid var(--node-border-active)'
                    : '1px solid var(--node-border)',
                fontSize: 16,
                lineHeight: 1,
                padding: 0,
                color: 'inherit',
              }}
            >
              {e}
            </button>
          ))}
          <button
            onClick={() => onChangeIcon(null)}
            title="クリア"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              cursor: 'pointer',
              background: 'transparent',
              border: '1px solid var(--node-border)',
              fontSize: 14,
              padding: 0,
              color: 'inherit',
            }}
          >
            ⊘
          </button>
          <button
            onClick={() => setShowCustomInput(v => !v)}
            title="自由入力"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              cursor: 'pointer',
              background: 'transparent',
              border: '1px solid var(--node-border)',
              fontSize: 16,
              padding: 0,
              color: 'inherit',
            }}
          >
            ＋
          </button>
        </div>
        {showCustomInput && (
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <input
              value={customDraft}
              onChange={e => setCustomDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submitCustom()
                } else if (e.key === 'Escape') {
                  setShowCustomInput(false)
                  setCustomDraft('')
                }
              }}
              placeholder="絵文字や記号を入力"
              autoFocus
              style={{
                flex: 1,
                padding: '4px 8px',
                fontSize: 14,
                border: '1px solid var(--node-border)',
                borderRadius: 4,
                background: 'var(--node-input-bg)',
                color: 'var(--node-input-fg)',
                outline: 'none',
              }}
            />
            <button
              onClick={submitCustom}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                background: 'var(--node-border-active)',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              適用
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
