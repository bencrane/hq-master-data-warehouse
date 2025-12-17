-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)

-- Table to store Clay webhook configurations
CREATE TABLE IF NOT EXISTS clay_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Simple table to track which companies were sent to which webhooks
CREATE TABLE IF NOT EXISTS company_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  webhook_id UUID REFERENCES clay_webhooks(id),
  employee_range TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'sent'
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_company_sends_company_id ON company_sends(company_id);
CREATE INDEX IF NOT EXISTS idx_company_sends_webhook_id ON company_sends(webhook_id);

-- Enable Row Level Security (but allow all for now - prototype)
ALTER TABLE clay_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_sends ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (prototype - tighten later)
CREATE POLICY "Allow all for authenticated users" ON clay_webhooks
  FOR ALL USING (true);

CREATE POLICY "Allow all for authenticated users" ON company_sends
  FOR ALL USING (true);
