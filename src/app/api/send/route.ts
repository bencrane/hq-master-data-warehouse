import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { Company, EMPLOYEE_RANGE_MAX, SAFE_PEOPLE_LIMIT } from '@/types'

// Rate limiting: 10 requests per second
const RATE_LIMIT = 10
const RATE_INTERVAL = 1000

interface SendRequest {
  companyIds: string[]
  webhooks: { id: string; webhook_url: string; name: string }[]
  employeeRange: string
  skipWebhooks?: boolean // For testing - skip actual webhook calls
}

export async function POST(request: Request) {
  try {
    // Parse request body
    const body: SendRequest = await request.json()
    const { companyIds, webhooks, employeeRange, skipWebhooks } = body

    // Validate required fields
    if (!companyIds?.length || !webhooks?.length) {
      return NextResponse.json(
        { error: 'companyIds and webhooks are required' },
        { status: 400 }
      )
    }

    // Use admin client for server-side operations (no cookie dependency)
    const supabase = createAdminClient()

    // Fetch companies by IDs in batches (to avoid URL length limits)
    const BATCH_SIZE = 100
    const companies: Company[] = []

    for (let i = 0; i < companyIds.length; i += BATCH_SIZE) {
      const batchIds = companyIds.slice(i, i + BATCH_SIZE)
      const { data, error } = await supabase
        .from('companies_basic_crunchbase_data')
        .select('*')
        .in('id', batchIds)

      if (error) {
        return NextResponse.json(
          { error: 'Failed to fetch companies: ' + error.message },
          { status: 500 }
        )
      }

      if (data) {
        companies.push(...data)
      }
    }

    if (companies.length === 0) {
      return NextResponse.json(
        { error: 'No companies found for the given IDs' },
        { status: 404 }
      )
    }

    // Calculate max companies per webhook based on employee range
    const maxEmployees = EMPLOYEE_RANGE_MAX[employeeRange] || 10
    const maxCompaniesPerWebhook = Math.floor(SAFE_PEOPLE_LIMIT / maxEmployees)

    // Distribute companies across webhooks
    const distribution: { webhook: typeof webhooks[0]; companies: Company[] }[] = []
    let companyIndex = 0

    for (const webhook of webhooks) {
      const webhookCompanies = companies.slice(
        companyIndex,
        companyIndex + maxCompaniesPerWebhook
      )
      if (webhookCompanies.length > 0) {
        distribution.push({ webhook, companies: webhookCompanies })
        companyIndex += webhookCompanies.length
      }
      if (companyIndex >= companies.length) break
    }

    // Generate batch ID and timestamp for tracking
    const batchId = crypto.randomUUID()
    const batchTimestamp = new Date().toISOString()

    // Send to each webhook with rate limiting
    const results: { webhook: string; sent: number; failed: number }[] = []

    for (const { webhook, companies: webhookCompanies } of distribution) {
      let sent = 0
      let failed = 0

      if (!skipWebhooks) {
        // Actually send to webhooks
        for (let i = 0; i < webhookCompanies.length; i += RATE_LIMIT) {
          const batch = webhookCompanies.slice(i, i + RATE_LIMIT)

          const batchResults = await Promise.all(
            batch.map(async (company) => {
              try {
                const companyWithMetadata = {
                  ...company,
                  _batch_metadata: {
                    batch_id: batchId,
                    batch_timestamp: batchTimestamp,
                    employee_range: employeeRange,
                    webhook_name: webhook.name,
                    source: 'hq-data-warehouse'
                  }
                }

                const response = await fetch(webhook.webhook_url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(companyWithMetadata),
                })
                return response.ok
              } catch {
                return false
              }
            })
          )

          for (const success of batchResults) {
            if (success) sent++
            else failed++
          }

          // Rate limit delay
          if (i + RATE_LIMIT < webhookCompanies.length) {
            await new Promise((resolve) => setTimeout(resolve, RATE_INTERVAL))
          }
        }
      } else {
        // Skip webhooks - just count as sent for testing
        sent = webhookCompanies.length
      }

      // Record sends in database
      const sendRecords = webhookCompanies.map((company) => ({
        company_id: company.id,
        webhook_id: webhook.id,
        employee_range: employeeRange,
        batch_id: batchId,
        status: 'sent',
      }))

      const { error: insertError } = await supabase
        .from('company_sends')
        .insert(sendRecords)

      if (insertError) {
        return NextResponse.json(
          { error: 'Failed to record sends: ' + insertError.message },
          { status: 500 }
        )
      }

      results.push({ webhook: webhook.name, sent, failed })
    }

    return NextResponse.json({
      success: true,
      batchId,
      batchTimestamp,
      employeeRange,
      totalCompanies: companies.length,
      distribution: results,
      companiesNotAssigned: companies.length - companyIndex,
    })

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Server error: ' + errorMessage },
      { status: 500 }
    )
  }
}
