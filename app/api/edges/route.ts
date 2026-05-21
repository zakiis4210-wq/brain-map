import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/edges → 全エッジ取得
export async function GET() {
  const { data, error } = await supabase
    .from('edges')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

// POST /api/edges → 新規エッジ作成
export async function POST(request: Request) {
  const body = await request.json()

  if (!body.source_node_id || !body.target_node_id) {
    return NextResponse.json(
      { error: 'source_node_id and target_node_id are required' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('edges')
    .insert({
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