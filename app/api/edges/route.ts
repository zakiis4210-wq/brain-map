import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/edges?map_id=xxx → 指定マップのエッジ取得
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mapId = searchParams.get('map_id')
  if (!mapId) {
    return NextResponse.json({ error: 'map_id is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('edges')
    .select('*')
    .eq('map_id', mapId)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

// POST /api/edges → 新規エッジ作成(body.map_id 必須)
export async function POST(request: Request) {
  const body = await request.json()

  if (!body.map_id) {
    return NextResponse.json({ error: 'map_id is required' }, { status: 400 })
  }
  if (!body.source_node_id || !body.target_node_id) {
    return NextResponse.json(
      { error: 'source_node_id and target_node_id are required' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('edges')
    .insert({
      map_id: body.map_id,
      source_node_id: body.source_node_id,
      target_node_id: body.target_node_id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
