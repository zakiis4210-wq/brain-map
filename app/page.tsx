'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { MouseEvent } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  type Node,
  type Edge,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import MindMapNode from './components/MindMapNode'
import MindMapEdge from './components/MindMapEdge'
import { computeLayout, type LayoutNode } from './lib/layout'

// DBから来るデータの型
type DbNode = {
  id: string
  map_id: string
  text: string
  position_x: number
  position_y: number
  parent_id: string | null
  sort_order: number
  collapsed: boolean
  side: 'left' | 'right' | null
}
type DbMap = {
  id: string
  name: string
  created_at: string
  updated_at: string
}

const nodeTypes = { mindmap: MindMapNode }
const edgeTypes = { mindmap: MindMapEdge }

// 表示用の補助: collapsed 状態を尊重し、折りたたまれた親の子孫を非表示にする
function filterVisible(dbNodes: DbNode[]): Set<string> {
  const byParent = new Map<string | null, DbNode[]>()
  for (const n of dbNodes) {
    const arr = byParent.get(n.parent_id) ?? []
    arr.push(n)
    byParent.set(n.parent_id, arr)
  }
  const visible = new Set<string>()
  const roots = byParent.get(null) ?? []
  const stack: DbNode[] = [...roots]
  while (stack.length > 0) {
    const cur = stack.pop()!
    visible.add(cur.id)
    if (cur.collapsed) continue
    const cs = byParent.get(cur.id) ?? []
    stack.push(...cs)
  }
  return visible
}

export default function Home() {
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [maps, setMaps] = useState<DbMap[]>([])
  const [currentMapId, setCurrentMapId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)

  // ref 群
  const pendingCreateRef = useRef<Promise<unknown>>(Promise.resolve())
  const activeIdRef = useRef<string | null>(null)
  const dbNodesRef = useRef<DbNode[]>([])
  const currentMapIdRef = useRef<string | null>(null)

  useEffect(() => {
    currentMapIdRef.current = currentMapId
  }, [currentMapId])

  const updateActive = useCallback((id: string | null) => {
    activeIdRef.current = id
    setActiveNodeId(id)
  }, [])

  // ===== ラベル編集 =====
  const handleNodeLabelChange = useCallback((nodeId: string, newText: string) => {
    // DB ノードキャッシュ更新
    dbNodesRef.current = dbNodesRef.current.map(n =>
      n.id === nodeId ? { ...n, text: newText } : n
    )
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
      body: JSON.stringify({ text: newText }),
    })
  }, [])

  const handleEditingChange = useCallback((nodeId: string, isEditing: boolean) => {
    setNodes(nds =>
      nds.map(n => (n.id === nodeId ? { ...n, draggable: !isEditing } : n))
    )
  }, [])

  // ===== 折りたたみ =====
  const handleToggleCollapse = useCallback((nodeId: string) => {
    const target = dbNodesRef.current.find(n => n.id === nodeId)
    if (!target) return
    const newCollapsed = !target.collapsed
    dbNodesRef.current = dbNodesRef.current.map(n =>
      n.id === nodeId ? { ...n, collapsed: newCollapsed } : n
    )
    void fetch(`/api/nodes/${nodeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collapsed: newCollapsed }),
    })
    // 再描画
    rerenderFromDb()
  }, [])

  // ===== DB ノード → React Flow Node/Edge への変換 =====
  const rerenderFromDb = useCallback(() => {
    const dbNodes = dbNodesRef.current
    const visible = filterVisible(dbNodes)
    const childCountMap = new Map<string, number>()
    for (const n of dbNodes) {
      if (n.parent_id) {
        childCountMap.set(n.parent_id, (childCountMap.get(n.parent_id) ?? 0) + 1)
      }
    }
    const rfNodes: Node[] = dbNodes
      .filter(n => visible.has(n.id))
      .map(n => ({
        id: n.id,
        type: 'mindmap',
        position: { x: n.position_x, y: n.position_y },
        data: {
          label: n.text,
          isRoot: n.parent_id === null,
          side: n.side,
          childCount: childCountMap.get(n.id) ?? 0,
          collapsed: n.collapsed,
          onLabelChange: handleNodeLabelChange,
          onEditingChange: handleEditingChange,
          onToggleCollapse: handleToggleCollapse,
        },
      }))
    // 木構造のエッジ: parent → child
    const rfEdges: Edge[] = dbNodes
      .filter(n => n.parent_id !== null && visible.has(n.id) && visible.has(n.parent_id!))
      .map(n => {
        // 子の side で接続方向を決定
        const parentHandle = n.side === 'left' ? 'left' : 'right'
        const childHandle = n.side === 'left' ? 'target-right' : 'target-left'
        return {
          id: `e-${n.parent_id}-${n.id}`,
          source: n.parent_id!,
          target: n.id,
          sourceHandle: parentHandle,
          targetHandle: childHandle,
          type: 'mindmap',
        }
      })
    setNodes(rfNodes)
    setEdges(rfEdges)
  }, [handleNodeLabelChange, handleEditingChange, handleToggleCollapse])

  // ===== 自動レイアウトを実行して DB にも保存 =====
  const runAutoLayout = useCallback(async (mapId: string) => {
    const dbNodes = dbNodesRef.current
    if (dbNodes.length === 0) return
    const layoutInput: LayoutNode[] = dbNodes.map(n => ({
      id: n.id,
      parent_id: n.parent_id,
      sort_order: n.sort_order,
      side: n.side,
      collapsed: n.collapsed,
      text: n.text,
    }))
    // ルートを画面中央っぽい位置に
    const results = computeLayout(layoutInput, 0, 0)
    const byId = new Map(results.map(r => [r.id, r]))
    dbNodesRef.current = dbNodes.map(n => {
      const r = byId.get(n.id)
      if (!r) return n
      return { ...n, position_x: r.position_x, position_y: r.position_y, side: r.side }
    })
    rerenderFromDb()
    // バルク保存
    await fetch('/api/nodes/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        updates: results.map(r => ({
          id: r.id,
          position_x: r.position_x,
          position_y: r.position_y,
          side: r.side,
        })),
      }),
    })
    // mapId はバルク API では暗黙(id 指定なので不要)
    void mapId
  }, [rerenderFromDb])

  // ===== 初回起動: マップ取得 or 作成 =====
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

  // ===== マップ切替時: ノードを取得 + ルートが無ければ作成 =====
  useEffect(() => {
    if (!currentMapId) return
    let cancelled = false
    async function load(mapId: string) {
      setLoading(true)
      let dbNodes = (await fetch(`/api/nodes?map_id=${mapId}`).then(r => r.json())) as DbNode[]
      if (cancelled) return
      // ルート(parent_id = null)が無ければ自動作成
      const hasRoot = dbNodes.some(n => n.parent_id === null)
      if (!hasRoot) {
        const created = await fetch('/api/nodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            map_id: mapId,
            text: 'セントラルテーマ',
            position_x: 0,
            position_y: 0,
            parent_id: null,
            sort_order: 0,
          }),
        }).then(r => r.json())
        dbNodes = [created]
      }
      dbNodesRef.current = dbNodes
      rerenderFromDb()
      updateActive(null)
      setLoading(false)
    }
    load(currentMapId)
    return () => {
      cancelled = true
    }
  }, [currentMapId, updateActive, rerenderFromDb])

  // ===== ノード作成(親指定) =====
  const createChildNode = useCallback(
    async (parentId: string, opts: { text?: string; activate?: boolean } = {}) => {
      const mapId = currentMapIdRef.current
      if (!mapId) return null
      const dbNodes = dbNodesRef.current
      const parent = dbNodes.find(n => n.id === parentId)
      if (!parent) return null

      // side の決定: 親がルートなら左右バランス、それ以外は親の side を継承
      let side: 'left' | 'right' = 'right'
      if (parent.parent_id === null) {
        const rightCount = dbNodes.filter(n => n.parent_id === parent.id && n.side === 'right').length
        const leftCount = dbNodes.filter(n => n.parent_id === parent.id && n.side === 'left').length
        side = rightCount <= leftCount ? 'right' : 'left'
      } else {
        side = parent.side ?? 'right'
      }

      // sort_order: 兄弟の末尾
      const siblings = dbNodes.filter(n => n.parent_id === parent.id && n.side === side)
      const sortOrder = siblings.length

      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          map_id: mapId,
          text: opts.text ?? '新しい思考',
          position_x: parent.position_x + (side === 'right' ? 200 : -200),
          position_y: parent.position_y,
          parent_id: parent.id,
          sort_order: sortOrder,
          side,
        }),
      })
      if (!res.ok) return null
      const newNode: DbNode = await res.json()
      dbNodesRef.current = [...dbNodesRef.current, newNode]
      // 自動レイアウト → 描画
      await runAutoLayout(mapId)
      if (opts.activate !== false) {
        updateActive(newNode.id)
      }
      return newNode
    },
    [runAutoLayout, updateActive]
  )

  // ===== 兄弟ノード作成 =====
  const createSiblingNode = useCallback(
    async (nodeId: string, opts: { text?: string; activate?: boolean } = {}) => {
      const mapId = currentMapIdRef.current
      if (!mapId) return null
      const dbNodes = dbNodesRef.current
      const target = dbNodes.find(n => n.id === nodeId)
      if (!target) return null
      // ルートに兄弟は作れない(ルート自体が唯一)
      if (target.parent_id === null) return null
      // 同じ親・同じ side の末尾に追加
      const siblings = dbNodes.filter(
        n => n.parent_id === target.parent_id && n.side === target.side
      )
      const sortOrder = siblings.length
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          map_id: mapId,
          text: opts.text ?? '新しい思考',
          position_x: target.position_x,
          position_y: target.position_y + 80,
          parent_id: target.parent_id,
          sort_order: sortOrder,
          side: target.side,
        }),
      })
      if (!res.ok) return null
      const newNode: DbNode = await res.json()
      dbNodesRef.current = [...dbNodesRef.current, newNode]
      await runAutoLayout(mapId)
      if (opts.activate !== false) {
        updateActive(newNode.id)
      }
      return newNode
    },
    [runAutoLayout, updateActive]
  )

  // ===== ノードのドラッグ → 位置だけDBに保存(parent_id は維持) =====
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes(nds => applyNodeChanges(changes, nds))
      changes.forEach(change => {
        if (change.type === 'position' && change.dragging === false && change.position) {
          // dbNodesRef も同期
          dbNodesRef.current = dbNodesRef.current.map(n =>
            n.id === change.id
              ? { ...n, position_x: change.position!.x, position_y: change.position!.y }
              : n
          )
          void fetch(`/api/nodes/${change.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              position_x: change.position.x,
              position_y: change.position.y,
            }),
          })
        }
      })
    },
    []
  )

  // ===== サブツリー削除 =====
  const deleteSubtree = useCallback(async (nodeId: string) => {
    const target = dbNodesRef.current.find(n => n.id === nodeId)
    if (!target) return
    if (target.parent_id === null) {
      alert('ルートノードは削除できません')
      return
    }
    if (!window.confirm('このノードと子孫を全て削除しますか?')) return
    // DB は CASCADE で子孫も消える
    const res = await fetch(`/api/nodes/${nodeId}`, { method: 'DELETE' })
    if (!res.ok) {
      alert('削除に失敗しました')
      return
    }
    // クライアント側: 子孫を再帰収集して除外
    const toDelete = new Set<string>()
    const stack = [nodeId]
    while (stack.length > 0) {
      const cur = stack.pop()!
      toDelete.add(cur)
      for (const n of dbNodesRef.current) {
        if (n.parent_id === cur) stack.push(n.id)
      }
    }
    dbNodesRef.current = dbNodesRef.current.filter(n => !toDelete.has(n.id))
    updateActive(null)
    const mapId = currentMapIdRef.current
    if (mapId) await runAutoLayout(mapId)
  }, [runAutoLayout, updateActive])

  // ===== マップ全部消去(ルートは残す) =====
  const handleClearAll = async () => {
    if (!currentMapId) return
    if (!window.confirm('このマップの全ノード(ルート以外)を削除します。よろしいですか?')) return
    const res = await fetch(`/api/nodes?map_id=${currentMapId}`, { method: 'DELETE' })
    if (!res.ok) {
      alert('削除に失敗しました')
      return
    }
    // 再ロード(ルートを再生成)
    setCurrentMapId(currentMapId) // useEffect で reload はされないので明示再取得
    const dbNodes = (await fetch(`/api/nodes?map_id=${currentMapId}`).then(r => r.json())) as DbNode[]
    let nodes = dbNodes
    const hasRoot = nodes.some(n => n.parent_id === null)
    if (!hasRoot) {
      const created = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          map_id: currentMapId,
          text: 'セントラルテーマ',
          position_x: 0,
          position_y: 0,
          parent_id: null,
          sort_order: 0,
        }),
      }).then(r => r.json())
      nodes = [created]
    }
    dbNodesRef.current = nodes
    rerenderFromDb()
    updateActive(null)
  }

  // ===== マップ操作 =====
  const handleDeleteMap = async () => {
    if (!currentMapId) return
    const target = maps.find(m => m.id === currentMapId)
    if (!target) return
    if (!window.confirm(`『${target.name}』を削除しますか?中のノードもすべて消えます。`)) return
    const res = await fetch(`/api/maps/${currentMapId}`, { method: 'DELETE' })
    if (!res.ok) {
      alert('マップ削除に失敗しました')
      return
    }
    const remaining = maps.filter(m => m.id !== currentMapId)
    if (remaining.length === 0) {
      const createRes = await fetch('/api/maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '最初のマップ' }),
      })
      const created: DbMap = await createRes.json()
      setMaps([created])
      setCurrentMapId(created.id)
    } else {
      setMaps(remaining)
      setCurrentMapId(remaining[0].id)
    }
  }

  const handleCreateMap = async () => {
    const name = window.prompt('マップ名を入力', '新しいマップ')
    if (name === null) return
    const res = await fetch('/api/maps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || '新しいマップ' }),
    })
    if (!res.ok) {
      alert('マップ作成に失敗しました')
      return
    }
    const created: DbMap = await res.json()
    setMaps(ms => [...ms, created])
    setCurrentMapId(created.id)
  }

  // ===== キーボードショートカット =====
  // Tab: 子ノード追加, Enter: 兄弟ノード追加, Delete: サブツリー削除
  // 矢印: ノード間移動(親/子/兄弟)
  useEffect(() => {
    if (!currentMapId) return
    const handler = (e: KeyboardEvent) => {
      const focused = document.activeElement as HTMLElement | null
      if (focused) {
        const tag = focused.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || focused.isContentEditable) return
      }

      const activeId = activeIdRef.current
      const dbNodes = dbNodesRef.current

      if (e.key === 'Tab') {
        e.preventDefault()
        pendingCreateRef.current = pendingCreateRef.current
          .then(() => {
            const target = activeId ?? dbNodes.find(n => n.parent_id === null)?.id
            if (!target) return
            return createChildNode(target)
          })
          .catch(() => {})
      } else if (e.key === 'Enter') {
        e.preventDefault()
        pendingCreateRef.current = pendingCreateRef.current
          .then(() => {
            if (!activeId) return
            return createSiblingNode(activeId)
          })
          .catch(() => {})
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!activeId) return
        e.preventDefault()
        void deleteSubtree(activeId)
      } else if (e.key === 'F2') {
        if (!activeId) return
        e.preventDefault()
        // 編集モード起動: そのノードのラベルダブルクリック相当を模倣
        const el = document.querySelector(`[data-id="${activeId}"] .react-flow__node`)
        if (el) {
          ;(el as HTMLElement).dispatchEvent(
            new MouseEvent('dblclick', { bubbles: true })
          )
        }
      } else if (
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight'
      ) {
        if (!activeId) return
        const cur = dbNodes.find(n => n.id === activeId)
        if (!cur) return
        e.preventDefault()
        let nextId: string | null = null
        if (e.key === 'ArrowLeft') {
          if (cur.side === 'left') {
            // 左方向の子へ
            const child = dbNodes
              .filter(n => n.parent_id === cur.id && n.side === 'left')
              .sort((a, b) => a.sort_order - b.sort_order)[0]
            if (child) nextId = child.id
          } else if (cur.parent_id === null) {
            const child = dbNodes
              .filter(n => n.parent_id === cur.id && n.side === 'left')
              .sort((a, b) => a.sort_order - b.sort_order)[0]
            if (child) nextId = child.id
          } else {
            // 親へ
            nextId = cur.parent_id
          }
        } else if (e.key === 'ArrowRight') {
          if (cur.side === 'right' || cur.parent_id === null) {
            const child = dbNodes
              .filter(n => n.parent_id === cur.id && (n.side === 'right' || cur.parent_id === null))
              .sort((a, b) => a.sort_order - b.sort_order)[0]
            if (child) nextId = child.id
          } else {
            nextId = cur.parent_id
          }
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          // 兄弟間移動
          if (cur.parent_id) {
            const siblings = dbNodes
              .filter(n => n.parent_id === cur.parent_id && n.side === cur.side)
              .sort((a, b) => a.sort_order - b.sort_order)
            const idx = siblings.findIndex(s => s.id === cur.id)
            if (e.key === 'ArrowUp' && idx > 0) nextId = siblings[idx - 1].id
            if (e.key === 'ArrowDown' && idx < siblings.length - 1) nextId = siblings[idx + 1].id
          }
        }
        if (nextId) updateActive(nextId)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentMapId, createChildNode, createSiblingNode, deleteSubtree, updateActive])

  // ===== ノードクリックで active 更新 =====
  const onNodeClick = useCallback(
    (_event: MouseEvent, node: Node) => {
      updateActive(node.id)
    },
    [updateActive]
  )

  // ===== 選択状態を React Flow に反映 =====
  useEffect(() => {
    setNodes(nds => nds.map(n => ({ ...n, selected: n.id === activeNodeId })))
  }, [activeNodeId])

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
      {/* 上段: マップ操作 */}
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
        <button onClick={handleCreateMap} style={{ ...buttonBase, background: '#10b981' }}>
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

      {/* 下段: ノード操作 */}
      <div
        style={{
          position: 'absolute',
          top: 64,
          left: 16,
          zIndex: 10,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <button
          onClick={() => {
            const target = activeIdRef.current ?? dbNodesRef.current.find(n => n.parent_id === null)?.id
            if (target) void createChildNode(target)
          }}
          style={{ ...buttonBase, background: '#3b82f6' }}
          title="Tab"
        >
          + 子ノード (Tab)
        </button>
        <button
          onClick={() => {
            const id = activeIdRef.current
            if (id) void createSiblingNode(id)
          }}
          style={{ ...buttonBase, background: '#6366f1' }}
          title="Enter"
        >
          + 兄弟 (Enter)
        </button>
        <button
          onClick={() => currentMapId && void runAutoLayout(currentMapId)}
          style={{ ...buttonBase, background: '#8b5cf6' }}
          title="自動整列"
        >
          ⟳ 整列
        </button>
        <button onClick={handleClearAll} style={{ ...buttonBase, background: '#ef4444' }}>
          全部消去
        </button>
      </div>

      {/* ヘルプ表示 */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          zIndex: 10,
          background: 'rgba(0,0,0,0.6)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: 6,
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        Tab: 子追加 / Enter: 兄弟追加 / F2: 編集 / Delete: 削除 / 矢印: 移動
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        nodesConnectable={false}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  )
}
