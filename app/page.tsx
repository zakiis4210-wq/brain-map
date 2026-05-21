'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { MouseEvent } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  ConnectionMode,
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
import MindMapNode from './components/MindMapNode'

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
  source_handle: string | null
  target_handle: string | null
}

const nodeTypes = { mindmap: MindMapNode }
type HandleId = 'top' | 'right' | 'bottom' | 'left'

// 旧データ(handle=null)用フォールバック: 相対位置から最も自然なハンドルを推測
function inferHandles(
  sx: number,
  sy: number,
  tx: number,
  ty: number
): { source: HandleId; target: HandleId } {
  const dx = tx - sx
  const dy = ty - sy
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { source: 'right', target: 'left' }
      : { source: 'left', target: 'right' }
  }
  return dy >= 0
    ? { source: 'bottom', target: 'top' }
    : { source: 'top', target: 'bottom' }
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
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)

  // 直列化キュー / activeNodeId・nodes・edges を最新値で読むための ref
  const pendingCreateRef = useRef<Promise<unknown>>(Promise.resolve())
  const activeIdRef = useRef<string | null>(null)
  const nodesRef = useRef<Node[]>([])
  const edgesRef = useRef<Edge[]>([])
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])
  useEffect(() => {
    edgesRef.current = edges
  }, [edges])
  const updateActive = useCallback((id: string | null) => {
    activeIdRef.current = id
    setActiveNodeId(id)
  }, [])

  // currentMapId を ref でも保持(stable な data コールバックから読むため)
  const currentMapIdRef = useRef<string | null>(null)
  useEffect(() => {
    currentMapIdRef.current = currentMapId
  }, [currentMapId])

  // インライン編集: ラベル変更 (data 経由で MindMapNode から呼ばれる)
  const handleNodeLabelChange = useCallback((nodeId: string, newText: string) => {
    setNodes(nds =>
      nds.map(n =>
        n.id === nodeId ? { ...n, data: { ...n.data, label: newText } } : n
      )
    )
    const mapId = currentMapIdRef.current
    if (!mapId) return
    void fetch(`/api/nodes/${nodeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map_id: mapId, text: newText }),
    })
  }, [])

  // インライン編集: 編集モード切替時に対象ノードの draggable を反転
  const handleEditingChange = useCallback((nodeId: string, isEditing: boolean) => {
    setNodes(nds =>
      nds.map(n => (n.id === nodeId ? { ...n, draggable: !isEditing } : n))
    )
  }, [])

  // DbNode → ReactFlow Node 変換 (type と data コールバックを統一して付与)
  const toFlowNode = useCallback(
    (n: DbNode): Node => ({
      id: n.id,
      type: 'mindmap',
      position: { x: n.position_x, y: n.position_y },
      data: {
        label: n.text,
        onLabelChange: handleNodeLabelChange,
        onEditingChange: handleEditingChange,
      },
    }),
    [handleNodeLabelChange, handleEditingChange]
  )

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
      setNodes(dbNodes.map(toFlowNode))
      const posMap = new Map(dbNodes.map(n => [n.id, n]))
      setEdges(
        dbEdges.map(e => {
          let sourceHandle: HandleId | string | null = e.source_handle
          let targetHandle: HandleId | string | null = e.target_handle
          // どちらかが null なら、ソース/ターゲットノードの相対位置から推測して埋める
          if (!sourceHandle || !targetHandle) {
            const sn = posMap.get(e.source_node_id)
            const tn = posMap.get(e.target_node_id)
            if (sn && tn) {
              const inferred = inferHandles(sn.position_x, sn.position_y, tn.position_x, tn.position_y)
              if (!sourceHandle) sourceHandle = inferred.source
              if (!targetHandle) targetHandle = inferred.target
            }
          }
          return {
            id: e.id,
            source: e.source_node_id,
            target: e.target_node_id,
            ...(sourceHandle ? { sourceHandle } : {}),
            ...(targetHandle ? { targetHandle } : {}),
          }
        })
      )
      // マップ切替時に active をリセット
      updateActive(null)
      setLoading(false)
    }
    load(currentMapId)
    return () => {
      cancelled = true
    }
  }, [currentMapId, updateActive, toFlowNode])

  // 3. ノード作成の共通処理(API + state + 任意でエッジ自動作成)
  //    opts.activate: false にすると active は更新しない(Tab/Enterで親を維持するため)
  const createNode = useCallback(
    async (
      x: number,
      y: number,
      opts: {
        connectFromId?: string | null
        fromHandle?: HandleId
        toHandle?: HandleId
        text?: string
        activate?: boolean
      } = {}
    ) => {
      if (!currentMapId) return null
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          map_id: currentMapId,
          text: opts.text ?? '新しい思考',
          position_x: x,
          position_y: y,
        }),
      })
      if (!res.ok) return null
      const newNode: DbNode = await res.json()
      setNodes(nds => [...nds, toFlowNode(newNode)])
      if (opts.activate !== false) {
        activeIdRef.current = newNode.id
        setActiveNodeId(newNode.id)
      }

      if (opts.connectFromId) {
        const edgeRes = await fetch('/api/edges', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            map_id: currentMapId,
            source_node_id: opts.connectFromId,
            target_node_id: newNode.id,
            source_handle: opts.fromHandle ?? null,
            target_handle: opts.toHandle ?? null,
          }),
        })
        if (edgeRes.ok) {
          const newEdge: DbEdge = await edgeRes.json()
          const newRfEdge: Edge = {
            id: newEdge.id,
            source: newEdge.source_node_id,
            target: newEdge.target_node_id,
            ...(newEdge.source_handle ? { sourceHandle: newEdge.source_handle } : {}),
            ...(newEdge.target_handle ? { targetHandle: newEdge.target_handle } : {}),
          }
          setEdges(eds => addEdge(newRfEdge, eds))
          // 連打時の兄弟数カウントを正しくするため edgesRef も即時更新
          edgesRef.current = addEdge(newRfEdge, edgesRef.current)
        }
      }
      return newNode
    },
    [currentMapId, toFlowNode]
  )

  // 3b. 「+ ノード追加」ボタン (ランダム配置)
  const handleAddNode = useCallback(() => {
    void createNode(Math.random() * 300 + 200, Math.random() * 300 + 100)
  }, [createNode])

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
          source_handle: connection.sourceHandle ?? null,
          target_handle: connection.targetHandle ?? null,
        }),
      })
      const newEdge: DbEdge = await res.json()
      setEdges(eds =>
        addEdge(
          {
            id: newEdge.id,
            source: newEdge.source_node_id,
            target: newEdge.target_node_id,
            ...(newEdge.source_handle ? { sourceHandle: newEdge.source_handle } : {}),
            ...(newEdge.target_handle ? { targetHandle: newEdge.target_handle } : {}),
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
    edgesRef.current = []
    updateActive(null)
  }

  // 7. (旧 onNodeDoubleClick は MindMapNode 内のインライン編集に置換済み)

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

  // 10. Tab/Enterキーでアクティブノードから連続作成 (Tab=右, Enter=下)
  useEffect(() => {
    if (!currentMapId) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' && e.key !== 'Enter') return
      const focused = document.activeElement as HTMLElement | null
      if (focused) {
        const tag = focused.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || focused.isContentEditable) return
      }
      e.preventDefault()
      const direction: 'right' | 'down' = e.key === 'Tab' ? 'right' : 'down'
      pendingCreateRef.current = pendingCreateRef.current
        .then(() => {
          const activeId = activeIdRef.current
          const activeNode = activeId
            ? nodesRef.current.find(n => n.id === activeId)
            : null
          if (activeNode) {
            const { x, y } = activeNode.position
            const fromHandle: HandleId = direction === 'right' ? 'right' : 'bottom'
            const toHandle: HandleId = direction === 'right' ? 'left' : 'top'
            // 親から同じ方向に既に出ているエッジ数 = 兄弟数
            const siblingCount = edgesRef.current.filter(
              e => e.source === activeNode.id && e.sourceHandle === fromHandle
            ).length
            const newPos =
              direction === 'right'
                ? { x: x + 200, y: y + 80 * siblingCount }
                : { x: x + 220 * siblingCount, y: y + 150 }
            return createNode(newPos.x, newPos.y, {
              connectFromId: activeNode.id,
              fromHandle,
              toHandle,
              activate: false, // 親(active)を維持して放射状に枝分かれさせる
            })
          }
          // active 無し → 画面中央付近に作成、エッジ無し、active には設定(以降の枝分かれ起点に)
          return createNode(400, 300)
        })
        .catch(() => {})
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentMapId, createNode])

  // 11. ノードクリックで active 更新
  const onNodeClick = useCallback(
    (_event: MouseEvent, node: Node) => {
      updateActive(node.id)
    },
    [updateActive]
  )

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
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}
