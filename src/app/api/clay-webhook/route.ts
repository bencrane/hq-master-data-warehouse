import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface ClayPersonData {
  first_name?: string
  last_name?: string
  full_name?: string
  company_name?: string
  company_domain?: string
  job_title?: string
  location?: string
  domain?: string
  person_linkedin_url?: string
  last_experience_title?: string
  last_experience_company?: string
  last_experience_start_date?: string
  notes?: string
  company_linkedin_url?: string
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supabase = createAdminClient()

    // Handle both single object and array of objects
    const records: ClayPersonData[] = Array.isArray(body) ? body : [body]

    if (records.length === 0) {
      return NextResponse.json({ error: 'No data provided' }, { status: 400 })
    }

    // Map to allowed fields only
    const insertData = records.map((record) => ({
      first_name: record.first_name || null,
      last_name: record.last_name || null,
      full_name: record.full_name || null,
      company_name: record.company_name || null,
      company_domain: record.company_domain || null,
      job_title: record.job_title || null,
      location: record.location || null,
      domain: record.domain || null,
      person_linkedin_url: record.person_linkedin_url || null,
      last_experience_title: record.last_experience_title || null,
      last_experience_company: record.last_experience_company || null,
      last_experience_start_date: record.last_experience_start_date || null,
      notes: record.notes || null,
      company_linkedin_url: record.company_linkedin_url || null,
    }))

    const { data, error } = await supabase
      .from('clay_find_people')
      .insert(insertData)
      .select('id')

    if (error) {
      return NextResponse.json(
        { error: 'Failed to insert: ' + error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      inserted: data?.length || 0,
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Server error: ' + errorMessage },
      { status: 500 }
    )
  }
}
