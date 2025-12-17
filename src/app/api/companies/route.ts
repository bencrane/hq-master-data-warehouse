import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const employeeRange = searchParams.get('employee_range')
  const excludeSent = searchParams.get('exclude_sent') === 'true'
  const limit = parseInt(searchParams.get('limit') || '100')
  const offset = parseInt(searchParams.get('offset') || '0')

  const supabase = await createClient()

  let query = supabase
    .from('companies_basic_crunchbase_data')
    .select('*', { count: 'exact' })

  // Filter by employee range if provided
  if (employeeRange) {
    if (employeeRange === 'not sure') {
      // Fuzzy match for "not sure" - matches any value containing "not sure"
      query = query.ilike('employee_range', '%not sure%')
    } else {
      query = query.eq('employee_range', employeeRange)
    }
  }

  // Exclude companies that have already been sent
  if (excludeSent) {
    const { data: sentIds } = await supabase
      .from('company_sends')
      .select('company_id')

    if (sentIds && sentIds.length > 0) {
      const ids = sentIds.map(s => s.company_id)
      query = query.not('id', 'in', `(${ids.join(',')})`)
    }
  }

  const { data, error, count } = await query
    .order('company_name')
    .range(offset, offset + limit - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ companies: data, total: count })
}

// Get counts by employee range
export async function POST(request: Request) {
  const supabase = await createClient()
  const { action } = await request.json()

  if (action === 'counts') {
    const ranges = [
      '1-10', '11-50', '51-100', '101-250', '251-500',
      '501-1000', '1001-5000', '5001-10000', '10001+',
      'not sure', null
    ]
    const counts: Record<string, number> = {}

    for (const range of ranges) {
      let query = supabase
        .from('companies_basic_crunchbase_data')
        .select('*', { count: 'exact', head: true })

      if (range === null) {
        query = query.is('employee_range', null)
      } else if (range === 'not sure') {
        // Fuzzy match for "not sure"
        query = query.ilike('employee_range', '%not sure%')
      } else {
        query = query.eq('employee_range', range)
      }

      const { count } = await query
      counts[range || 'unknown'] = count || 0
    }

    // Get sent counts
    const { data: sentData } = await supabase
      .from('company_sends')
      .select('employee_range')

    const sentCounts: Record<string, number> = {}
    if (sentData) {
      for (const item of sentData) {
        const range = item.employee_range || 'unknown'
        sentCounts[range] = (sentCounts[range] || 0) + 1
      }
    }

    return NextResponse.json({ counts, sentCounts })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
