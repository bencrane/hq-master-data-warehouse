import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
  _batch_metadata?: {
    batch_id?: string
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Get source IP for audit
  const sourceIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || null

  let recordsReceived = 0
  let recordsInserted = 0
  let batchId: string | null = null

  try {
    const body = await req.json()

    // Handle both single object and array of objects
    const records: ClayPersonData[] = Array.isArray(body) ? body : [body]
    recordsReceived = records.length

    // Extract batch_id from first record if present
    if (records[0]?._batch_metadata?.batch_id) {
      batchId = records[0]._batch_metadata.batch_id
    }

    if (records.length === 0) {
      // Log empty request
      await supabase.from('clay_enrichment_logs').insert({
        batch_id: batchId,
        records_received: 0,
        records_inserted: 0,
        status: 'error',
        error_message: 'No data provided',
        source_ip: sourceIp,
      })

      return new Response(
        JSON.stringify({ error: 'No data provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Map to allowed fields only (exclude _batch_metadata)
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
      // Log error
      await supabase.from('clay_enrichment_logs').insert({
        batch_id: batchId,
        records_received: recordsReceived,
        records_inserted: 0,
        status: 'error',
        error_message: error.message,
        source_ip: sourceIp,
      })

      return new Response(
        JSON.stringify({ error: 'Failed to insert: ' + error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    recordsInserted = data?.length || 0

    // Log success
    await supabase.from('clay_enrichment_logs').insert({
      batch_id: batchId,
      records_received: recordsReceived,
      records_inserted: recordsInserted,
      status: 'success',
      error_message: null,
      source_ip: sourceIp,
    })

    return new Response(
      JSON.stringify({ success: true, inserted: recordsInserted }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    // Log catch-all error
    await supabase.from('clay_enrichment_logs').insert({
      batch_id: batchId,
      records_received: recordsReceived,
      records_inserted: 0,
      status: 'error',
      error_message: (error as Error).message,
      source_ip: sourceIp,
    })

    return new Response(
      JSON.stringify({ error: 'Server error: ' + (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
