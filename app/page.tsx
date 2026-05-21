'use client'

import { useEffect, useState, useCallback } from 'react'
import type { MouseEvent } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

// DBから来るデータの型
type DbNode = {
  id: string
  text: string
  position_x: number
  position_y: number
}
type DbEdge = {
  id: string
  source_node_id: string
  target_node_id: string
}

export default function Home() {
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [loading, setLoading] = useState(true)

  // 1. 初回ロード: DBから既存データを取得して画面に反映
  useEffect(() => {
    async function load() {
      const [dbNodes, dbEdges] = await Promise.all([
        fetch('/api/nodes').then(r => r.json()) as Promise<DbNode[]>,
        fetch('/api/edges').then(r => r.json()) as Promise<DbEdge[]>,
      ])
      setNodes(
        dbNodes.map(n => ({
          id: n.id,
          position: { x: n.position_x, y: n.position_y },
          data: { label: n.text },
        }))
      )
      setEdges(
        dbEdges.map(e => ({
          id: e.id,
          source: e.source_node_id,
          target: e.target_node_id,
        }))
      )
      setLoading(false)
    }
    load()
  }, [])

  // 2. 「+ ノード追加」ボタン
  const handleAddNode = async () => {
    const res = await fetch('/api/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: '新しい思考',
        position_x: Math.random() * 300 + 200,
        position_y: Math.random() * 300 + 100,
      }),
    })
    const newNode: DbNode = await res.json()
    setNodes(nds => [
      ...nds,
      {
        id: newNode.id,
        position: { x: newNode.position_x, y: newNode.position_y },
        data: { label: newNode.text },
      },
    ])
  }

  // 3. ノードのドラッグ → ドラッグ終了時に位置をDBに保存
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes(nds => applyNodeChanges(changes, nds))
    changes.forEach(change => {
      if (change.type === 'position' && change.dragging === false && change.position) {
        fetch(`/api/nodes/${change.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            position_x: change.position.x,
            position_y: change.position.y,
          }),
        })
      }
    })
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges(eds => applyEdgeChanges(changes, eds))
  }, [])

  // 4. ノード同士を線で繋ぐ → DBにエッジを保存
  const onConnect = useCallback(async (connection: Connection) => {
    if (!connection.source || !connection.target) return
    const res = await fetch('/api/edges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_node_id: connection.source,
        target_node_id: connection.target,
      }),
    })
    const newEdge: DbEdge = await res.json()
    setEdges(eds =>
      addEdge(
        {
          id: newEdge.id,
          source: newEdge.source_node_id,
          target: newEdge.target_node_id,
        },
        eds
      )
    )
  }, [])

  // 5. ダブルクリックでテキスト編集
  const onNodeDoubleClick = useCallback(
    async (_event: MouseEvent, node: Node) => {
      const newText = window.prompt('テキストを編集', String(node.data.label ?? ''))
      if (newText === null) return // キャンセル時
      setNodes(nds =>
        nds.map(n =>
          n.id === node.id ? { ...n, data: { ...n.data, label: newText } } : n
        )
      )
      await fetch(`/api/nodes/${node.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newText }),
      })
    },
    []
  )

  if (loading) {
    return <div style={{ padding: 20 }}>Loading...</div>
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <button
        onClick={handleAddNode}
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 10,
          padding: '8px 16px',
          background: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 14,
        }}
      >
        + ノード追加
      </button>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDoubleClick={onNodeDoubleClick}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}