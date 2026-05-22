'use client'

import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'

// MindMeister 風の枝: 滑らかな水平ベジエ曲線
// React Flow 標準の getBezierPath を使い、親→子の方向を自動推定
export default function MindMapEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
  } = props

  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.4,
  })

  return (
    <BaseEdge
      id={id}
      path={path}
      style={{
        stroke: 'var(--edge-color, #9ca3af)',
        strokeWidth: 2,
        fill: 'none',
        ...style,
      }}
    />
  )
}
