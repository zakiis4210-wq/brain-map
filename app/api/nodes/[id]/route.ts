import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// PATCH /api/nodes/<id>  → 指定IDのノードを部分更新
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  // 受け取った項目だけ更新する
  const updates: Record<string, unknown> = {}
  if (body.text !== undefined) updates.text = body.text
  if (body.position_x !== undefined) updates.position_x = body.position_x
  if (body.position_y !== undefined) updates.position_y = body.position_y

  const { data, error } = await supabase
    .from('nodes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}