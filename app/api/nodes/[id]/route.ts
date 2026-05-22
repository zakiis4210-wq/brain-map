import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// PATCH /api/nodes/<id>  → 指定IDのノードを部分更新
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  const updates: Record<string, unknown> = {}
  if (body.text !== undefined) updates.text = body.text
  if (body.position_x !== undefined) updates.position_x = body.position_x
  if (body.position_y !== undefined) updates.position_y = body.position_y
  if (body.parent_id !== undefined) updates.parent_id = body.parent_id
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order
  if (body.collapsed !== undefined) updates.collapsed = body.collapsed
  if (body.side !== undefined) updates.side = body.side

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

// DELETE /api/nodes/<id>  → 指定IDのノードを削除 (子孫は parent_id FK の CASCADE で自動削除)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { error } = await supabase
    .from('nodes')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
