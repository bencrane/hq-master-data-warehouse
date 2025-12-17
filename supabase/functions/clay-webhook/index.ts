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
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json()

    // Handle both single object and array of objects
    const records: ClayPersonData[] = Array.isArray(body) ? body : [body]

    if (records.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No data provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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
      return new Response(
        JSON.stringify({ error: 'Failed to insert: ' + error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, inserted: data?.length || 0 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Server error: ' + (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
