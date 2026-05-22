// MindMeister 風の左右放射状レイアウト
// ルート(parent_id=null)を中心に、子は左右に振り分けて広がる
// サブツリーの高さを再帰計算し、兄弟が重ならないよう縦位置を決める

export type LayoutNode = {
  id: string
  parent_id: string | null
  sort_order: number
  side: 'left' | 'right' | null
  collapsed: boolean
  text: string
}

export type LayoutResult = {
  id: string
  position_x: number
  position_y: number
  side: 'left' | 'right' | null
}

// 1ノードあたりの推定サイズ(レイアウト計算用)
const NODE_WIDTH = 160 // ノード横幅(余白込み)
const NODE_VGAP = 24 // 兄弟間の縦余白
const NODE_HEIGHT = 40 // ノードの高さ目安
const LEVEL_HGAP = 80 // 親子間の横余白

type TreeNode = LayoutNode & {
  children: TreeNode[]
  subtreeHeight: number
}

function buildTree(nodes: LayoutNode[]): { root: TreeNode | null; byId: Map<string, TreeNode> } {
  const byId = new Map<string, TreeNode>()
  for (const n of nodes) {
    byId.set(n.id, { ...n, children: [], subtreeHeight: 0 })
  }
  let root: TreeNode | null = null
  for (const n of byId.values()) {
    if (n.parent_id) {
      const p = byId.get(n.parent_id)
      if (p) p.children.push(n)
    } else {
      // 最初に見つかった(または sort_order が最小の)ルートを採用
      if (!root || n.sort_order < root.sort_order) root = n
    }
  }
  // 子を sort_order で並べる
  for (const n of byId.values()) {
    n.children.sort((a, b) => a.sort_order - b.sort_order)
  }
  return { root, byId }
}

// サブツリーの縦方向の合計高さを計算 (折りたたみ時は本人のみ)
function calcSubtreeHeight(node: TreeNode): number {
  if (node.collapsed || node.children.length === 0) {
    node.subtreeHeight = NODE_HEIGHT
    return node.subtreeHeight
  }
  let total = 0
  for (const c of node.children) {
    total += calcSubtreeHeight(c) + NODE_VGAP
  }
  total -= NODE_VGAP
  node.subtreeHeight = Math.max(NODE_HEIGHT, total)
  return node.subtreeHeight
}

// 子を左右に振り分け(side が指定済みならそれを尊重、未指定なら sort_order で交互振り分け)
function partitionSides(root: TreeNode): { left: TreeNode[]; right: TreeNode[] } {
  const left: TreeNode[] = []
  const right: TreeNode[] = []
  root.children.forEach((c, i) => {
    if (c.side === 'left') left.push(c)
    else if (c.side === 'right') right.push(c)
    else if (i % 2 === 0) right.push(c)
    else left.push(c)
  })
  return { left, right }
}

// 再帰配置: 指定方向(+1=右, -1=左)に子を展開
function placeChildren(
  parent: TreeNode,
  children: TreeNode[],
  dir: 1 | -1,
  side: 'left' | 'right',
  results: Map<string, LayoutResult>,
  parentX: number,
  parentY: number
) {
  if (parent.collapsed || children.length === 0) return
  const totalH = children.reduce((acc, c, i) => acc + c.subtreeHeight + (i > 0 ? NODE_VGAP : 0), 0)
  let cursorY = parentY - totalH / 2
  for (const c of children) {
    const cY = cursorY + c.subtreeHeight / 2
    const cX = parentX + dir * (NODE_WIDTH + LEVEL_HGAP)
    results.set(c.id, { id: c.id, position_x: cX, position_y: cY, side })
    placeChildren(c, c.children, dir, side, results, cX, cY)
    cursorY += c.subtreeHeight + NODE_VGAP
  }
}

// メイン: ノード配列を受け取り、各ノードの新しい座標を返す
// originX, originY: ルートノードを置きたい位置
export function computeLayout(
  nodes: LayoutNode[],
  originX = 0,
  originY = 0
): LayoutResult[] {
  const { root } = buildTree(nodes)
  if (!root) return []
  calcSubtreeHeight(root)
  const results = new Map<string, LayoutResult>()
  results.set(root.id, { id: root.id, position_x: originX, position_y: originY, side: null })
  const { left, right } = partitionSides(root)
  // 左右それぞれ独立に高さを再計算(全体に対する縦中心を合わせる)
  placeChildren(root, right, 1, 'right', results, originX, originY)
  placeChildren(root, left, -1, 'left', results, originX, originY)
  return Array.from(results.values())
}
