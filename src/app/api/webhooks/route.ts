import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Get all webhooks
export async function GET() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('clay_webhooks')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ webhooks: data })
}

// Create a new webhook
export async function POST(request: Request) {
  const supabase = await createClient()
  const body = await request.json()

  const { name, webhook_url, description, employee_range } = body

  if (!name || !webhook_url) {
    return NextResponse.json(
      { error: 'Name and webhook_url are required' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('clay_webhooks')
    .insert({ name, webhook_url, description, employee_range })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ webhook: data })
}

// Update a webhook
export async function PUT(request: Request) {
  const supabase = await createClient()
  const body = await request.json()

  const { id, name, webhook_url, description, is_active } = body

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('clay_webhooks')
    .update({ name, webhook_url, description, is_active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ webhook: data })
}

// Delete a webhook
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('clay_webhooks')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
