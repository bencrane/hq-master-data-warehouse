export interface Company {
  id: string
  company_name: string
  company_domain: string | null
  company_linkedin_url: string | null
  full_description: string | null
  short_description: string | null
  employee_range: string | null
  city: string | null
  state: string | null
  country: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ClayWebhook {
  id: string
  name: string
  webhook_url: string
  description: string | null
  employee_range: string | null  // Which range this webhook is for
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface WebhookBatch {
  id: string
  webhook_id: string
  employee_range: string | null
  company_count: number
  estimated_people: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface CompanyWebhookQueue {
  id: string
  company_id: string
  webhook_id: string
  status: 'pending' | 'sent' | 'failed'
  batch_id: string | null
  sent_at: string | null
  error_message: string | null
  created_at: string
}

// Employee range batching constants
export const EMPLOYEE_RANGES = [
  '1-10',
  '11-50',
  '51-100',
  '101-250',
  '251-500',
  '501-1000',
  '1001-5000',
  '5001-10000',
  '10001+',
  'not sure'
] as const
export type EmployeeRange = typeof EMPLOYEE_RANGES[number]

// Safe limit (40k instead of 50k for buffer)
export const SAFE_PEOPLE_LIMIT = 40000

export const EMPLOYEE_RANGE_MAX: Record<string, number> = {
  '1-10': 10,
  '11-50': 50,
  '51-100': 100,
  '101-250': 250,
  '251-500': 500,
  '501-1000': 1000,
  '1001-5000': 5000,
  '5001-10000': 10000,
  '10001+': 15000, // estimate for 10k+
  'not sure': 50000, // conservative - assume max, so only 1 company per webhook
}

export function getMaxCompaniesForRange(range: string): number {
  const maxEmployees = EMPLOYEE_RANGE_MAX[range] || 10
  return Math.floor(SAFE_PEOPLE_LIMIT / maxEmployees)
}
