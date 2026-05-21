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
type DbMap = {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export default function Home() {
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [maps, setMaps] = useState<DbMap[]>([])
  const [currentMapId, setCurrentMapId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // 1. 初回起動: マップ一覧を取得し、無ければ作成 → 最初のマップを選択
  useEffect(() => {
    async function bootstrap() {
      let list = (await fetch('/api/maps').then(r => r.json())) as DbMap[]
      if (!Array.isArray(list) || list.length === 0) {
        const created = (await fetch('/api/maps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: '最初のマップ' }),
        }).then(r => r.json())) as DbMap
        list = [created]
      }
      setMaps(list)
      setCurrentMapId(list[0].id)
    }
    bootstrap()
  }, [])

  // 2. currentMapId が変わったら、そのマップのノード/エッジを再取得
  useEffect(() => {
    if (!currentMapId) return
    let cancelled = false
    async function load(mapId: string) {
      setLoading(true)
      const [dbNodes, dbEdges] = await Promise.all([
        fetch(`/api/nodes?map_id=${mapId}`).then(r => r.json()) as Promise<DbNode[]>,
        fetch(`/api/edges?map_id=${mapId}`).then(r => r.json()) as Promise<DbEdge[]>,
      ])
      if (cancelled) return
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
    load(currentMapId)
    return () => {
      cancelled = true
    }
  }, [currentMapId])

  // 3. 「+ ノード追加」ボタン
  const handleAddNode = async () => {
    if (!currentMapId) return
    const res = await fetch('/api/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        map_id: currentMapId,
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

  // 4. ノードのドラッグ → ドラッグ終了時に位置をDBに保存
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes(nds => applyNodeChanges(changes, nds))
      if (!currentMapId) return
      changes.forEach(change => {
        if (change.type === 'position' && change.dragging === false && change.position) {
          fetch(`/api/nodes/${change.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              map_id: currentMapId,
              position_x: change.position.x,
              position_y: change.position.y,
            }),
          })
        }
      })
    },
    [currentMapId]
  )

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges(eds => applyEdgeChanges(changes, eds))
  }, [])

  // 5. ノード同士を線で繋ぐ → DBにエッジを保存
  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target || !currentMapId) return
      const res = await fetch('/api/edges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          map_id: currentMapId,
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
    },
    [currentMapId]
  )

  // 6. 「全部消去」ボタン (現在のマップ内のみ)
  const handleClearAll = async () => {
    if (!currentMapId) return
    if (!window.confirm('このマップのノードとエッジを全て削除します。よろしいですか?')) return
    const res = await fetch(`/api/nodes?map_id=${currentMapId}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      alert(`削除に失敗しました: ${body.error ?? res.statusText}`)
      return
    }
    setNodes([])
    setEdges([])
  }

  // 7. ダブルクリックでテキスト編集
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
        body: JSON.stringify({ map_id: currentMapId, text: newText }),
      })
    },
    [currentMapId]
  )

  // 8. 「マップ削除」ボタン
  const handleDeleteMap = async () => {
    if (!currentMapId) return
    const target = maps.find(m => m.id === currentMapId)
    if (!target) return
    if (!window.confirm(`『${target.name}』を削除しますか?中のノードもすべて消えます。`)) return

    const res = await fetch(`/api/maps/${currentMapId}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      alert(`マップ削除に失敗しました: ${body.error ?? res.statusText}`)
      return
    }

    const remaining = maps.filter(m => m.id !== currentMapId)
    if (remaining.length === 0) {
      // 0件になったら新規マップを自動作成 (Phase 2 初回起動と同じロジック)
      const createRes = await fetch('/api/maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '最初のマップ' }),
      })
      if (!createRes.ok) {
        const body = await createRes.json().catch(() => ({}))
        alert(`マップ作成に失敗しました: ${body.error ?? createRes.statusText}`)
        return
      }
      const created: DbMap = await createRes.json()
      setMaps([created])
      setCurrentMapId(created.id)
    } else {
      setMaps(remaining)
      setCurrentMapId(remaining[0].id)
    }
  }

  // 9. 「+ 新規マップ」ボタン
  const handleCreateMap = async () => {
    const name = window.prompt('マップ名を入力', '新しいマップ')
    if (name === null) return
    const res = await fetch('/api/maps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || '新しいマップ' }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      alert(`マップ作成に失敗しました: ${body.error ?? res.statusText}`)
      return
    }
    const created: DbMap = await res.json()
    setMaps(ms => [...ms, created])
    setCurrentMapId(created.id)
  }

  if (loading || !currentMapId) {
    return <div style={{ padding: 20 }}>Loading...</div>
  }

  const buttonBase = {
    zIndex: 10,
    padding: '8px 16px',
    color: 'white',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14,
  } as const

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* マップ選択UI (上段) */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 10,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <select
          value={currentMapId}
          onChange={e => setCurrentMapId(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            background: 'white',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          {maps.map(m => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleCreateMap}
          style={{ ...buttonBase, background: '#10b981' }}
        >
          + 新規マップ
        </button>
        <button
          onClick={handleDeleteMap}
          style={{
            ...buttonBase,
            background: '#f3f4f6',
            color: '#ef4444',
            padding: '6px 12px',
            fontSize: 13,
            border: '1px solid #e5e7eb',
          }}
        >
          🗑 削除
        </button>
      </div>

      {/* 操作ボタン (下段) */}
      <button
        onClick={handleAddNode}
        style={{ ...buttonBase, position: 'absolute', top: 64, left: 16, background: '#3b82f6' }}
      >
        + ノード追加
      </button>
      <button
        onClick={handleClearAll}
        style={{ ...buttonBase, position: 'absolute', top: 64, left: 160, background: '#ef4444' }}
      >
        全部消去
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
