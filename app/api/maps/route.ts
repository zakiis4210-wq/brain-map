import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/maps  → 全マップ取得
export async function GET() {
  const { data, error } = await supabase
    .from('maps')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

// POST /api/maps  → 新規マップ作成
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))

  const { data, error } = await supabase
    .from('maps')
    .insert({ name: body.name ?? '新しいマップ' })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
