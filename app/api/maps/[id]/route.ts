import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// DELETE /api/maps/<id>  → 指定マップを削除(nodes/edges は CASCADE で自動削除)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { error } = await supabase
    .from('maps')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
