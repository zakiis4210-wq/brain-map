import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// PATCH /api/nodes/bulk  → 複数ノードの位置・順序などを一括更新
// body: { updates: [{ id, position_x?, position_y?, sort_order?, parent_id?, side?, collapsed? }, ...] }
export async function PATCH(request: Request) {
  const body = await request.json()
  const updates = body.updates

  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: 'updates array is required' }, { status: 400 })
  }

  const results = await Promise.all(
    updates.map(async (u: Record<string, unknown>) => {
      if (!u.id || typeof u.id !== 'string') return { id: null, ok: false }
      const patch: Record<string, unknown> = {}
      if (u.position_x !== undefined) patch.position_x = u.position_x
      if (u.position_y !== undefined) patch.position_y = u.position_y
      if (u.sort_order !== undefined) patch.sort_order = u.sort_order
      if (u.parent_id !== undefined) patch.parent_id = u.parent_id
      if (u.side !== undefined) patch.side = u.side
      if (u.collapsed !== undefined) patch.collapsed = u.collapsed
      if (u.text !== undefined) patch.text = u.text

      const { error } = await supabase.from('nodes').update(patch).eq('id', u.id)
      return { id: u.id, ok: !error, error: error?.message }
    })
  )

  const failed = results.filter(r => !r.ok)
  if (failed.length > 0) {
    return NextResponse.json({ ok: false, failed }, { status: 500 })
  }
  return NextResponse.json({ ok: true, count: results.length })
}
