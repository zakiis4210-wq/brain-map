import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/nodes?map_id=xxx  → 指定マップのノード取得 (parent_id, sort_order 含む)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mapId = searchParams.get('map_id')
  if (!mapId) {
    return NextResponse.json({ error: 'map_id is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('nodes')
    .select('*')
    .eq('map_id', mapId)
    .order('sort_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

// POST /api/nodes  → 新規ノード作成 (parent_id, sort_order, side, collapsed 対応)
export async function POST(request: Request) {
  const body = await request.json()

  if (!body.map_id) {
    return NextResponse.json({ error: 'map_id is required' }, { status: 400 })
  }

  const insertPayload: Record<string, unknown> = {
    map_id: body.map_id,
    text: body.text ?? '',
    position_x: body.position_x ?? 0,
    position_y: body.position_y ?? 0,
    parent_id: body.parent_id ?? null,
    sort_order: body.sort_order ?? 0,
    collapsed: body.collapsed ?? false,
  }
  if (body.side === 'left' || body.side === 'right') {
    insertPayload.side = body.side
  }
  if (body.color !== undefined) insertPayload.color = body.color
  if (body.icon !== undefined) insertPayload.icon = body.icon

  const { data, error } = await supabase
    .from('nodes')
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

// DELETE /api/nodes?map_id=xxx  → 指定マップのノードを全削除(edgesはCASCADEで自動削除)
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const mapId = searchParams.get('map_id')
  if (!mapId) {
    return NextResponse.json({ error: 'map_id is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('nodes')
    .delete()
    .eq('map_id', mapId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
