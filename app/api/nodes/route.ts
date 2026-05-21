import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/nodes  → 全ノード取得
export async function GET() {
  const { data, error } = await supabase
    .from('nodes')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

// POST /api/nodes  → 新規ノード作成
export async function POST(request: Request) {
  const body = await request.json()

  const { data, error } = await supabase
    .from('nodes')
    .insert({
      text: body.text ?? '',
      position_x: body.position_x ?? 0,
      position_y: body.position_y ?? 0,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}