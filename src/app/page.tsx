'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ClayWebhook, EMPLOYEE_RANGES, getMaxCompaniesForRange } from '@/types'

export default function Dashboard() {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [sentCounts, setSentCounts] = useState<Record<string, number>>({})
  const [webhooks, setWebhooks] = useState<ClayWebhook[]>([])
  const [selectedRange, setSelectedRange] = useState<string>('')
  const [batchSize, setBatchSize] = useState<number>(100)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  // New webhook form
  const [newWebhookName, setNewWebhookName] = useState('')
  const [newWebhookUrl, setNewWebhookUrl] = useState('')
  const [newWebhookRange, setNewWebhookRange] = useState('')
  const [showWebhookForm, setShowWebhookForm] = useState(false)

  // Bulk webhook admin panel
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [adminRange, setAdminRange] = useState('')
  const [webhookInputs, setWebhookInputs] = useState<{name: string, url: string}[]>([
    { name: '', url: '' }
  ])
  const [savingBulk, setSavingBulk] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  // Auto-select webhooks when range changes
  const webhooksForRange = webhooks.filter(w => w.employee_range === selectedRange)

  async function loadData() {
    setLoading(true)

    // Get company counts
    const countsRes = await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'counts' }),
    })
    const countsData = await countsRes.json()
    setCounts(countsData.counts || {})
    setSentCounts(countsData.sentCounts || {})

    // Get webhooks
    const webhooksRes = await fetch('/api/webhooks')
    const webhooksData = await webhooksRes.json()
    setWebhooks(webhooksData.webhooks || [])

    setLoading(false)
  }

  async function addWebhook() {
    if (!newWebhookName || !newWebhookUrl || !newWebhookRange) return

    const res = await fetch('/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newWebhookName,
        webhook_url: newWebhookUrl,
        employee_range: newWebhookRange
      }),
    })

    if (res.ok) {
      setNewWebhookName('')
      setNewWebhookUrl('')
      setNewWebhookRange('')
      setShowWebhookForm(false)
      loadData()
    }
  }

  async function deleteWebhook(id: string) {
    if (!confirm('Delete this webhook?')) return
    await fetch(`/api/webhooks?id=${id}`, { method: 'DELETE' })
    loadData()
  }

  async function saveBulkWebhooks() {
    const validInputs = webhookInputs.filter(w => w.name.trim() && w.url.trim())
    if (!adminRange || validInputs.length === 0) return

    setSavingBulk(true)
    let saved = 0

    for (const webhook of validInputs) {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: webhook.name.trim(),
          webhook_url: webhook.url.trim(),
          employee_range: adminRange
        }),
      })
      if (res.ok) saved++
    }

    setSavingBulk(false)
    setWebhookInputs([{ name: '', url: '' }])
    setShowAdminPanel(false)
    loadData()
    alert(`Saved ${saved} webhooks for ${adminRange}`)
  }

  function addWebhookInput() {
    setWebhookInputs([...webhookInputs, { name: '', url: '' }])
  }

  function updateWebhookInput(index: number, field: 'name' | 'url', value: string) {
    const updated = [...webhookInputs]
    updated[index][field] = value
    setWebhookInputs(updated)
  }

  function removeWebhookInput(index: number) {
    if (webhookInputs.length > 1) {
      setWebhookInputs(webhookInputs.filter((_, i) => i !== index))
    }
  }

  async function deleteAllWebhooksForRange(range: string) {
    if (!confirm(`Delete ALL webhooks for ${range}?`)) return

    const toDelete = webhooks.filter(w => w.employee_range === range)
    for (const webhook of toDelete) {
      await fetch(`/api/webhooks?id=${webhook.id}`, { method: 'DELETE' })
    }
    loadData()
  }

  async function sendBatch() {
    if (!selectedRange || webhooksForRange.length === 0) {
      setResult('Please select an employee range with configured webhooks')
      return
    }

    setSending(true)
    setResult(null)

    try {
      // Calculate total capacity and how many companies to fetch
      const maxPerWebhook = getMaxCompaniesForRange(selectedRange)
      const totalCapacity = maxPerWebhook * webhooksForRange.length
      const companiesToSend = Math.min(batchSize, totalCapacity)

      // Fetch companies for the selected range
      const companiesRes = await fetch(
        `/api/companies?employee_range=${encodeURIComponent(selectedRange)}&exclude_sent=true&limit=${companiesToSend}`
      )
      const companiesData = await companiesRes.json()

      if (!companiesData.companies?.length) {
        setResult('No companies available for this range')
        setSending(false)
        return
      }

      // Send to Clay - API will distribute across webhooks
      const sendRes = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyIds: companiesData.companies.map((c: { id: string }) => c.id),
          webhooks: webhooksForRange.map(w => ({
            id: w.id,
            webhook_url: w.webhook_url,
            name: w.name,
          })),
          employeeRange: selectedRange,
        }),
      })

      const sendData = await sendRes.json()

      if (sendData.success) {
        const distSummary = sendData.distribution
          .map((d: { webhook: string; sent: number; failed: number }) =>
            `${d.webhook}: ${d.sent} sent, ${d.failed} failed`)
          .join('\n')
        setResult(`Success! Sent ${sendData.totalCompanies} companies:\n${distSummary}`)
        loadData()
      } else {
        setResult(`Error: ${sendData.error}`)
      }
    } catch (err) {
      setResult(`Error: ${err}`)
    }

    setSending(false)
  }

  // Calculate stats for selected range
  const maxPerWebhook = selectedRange ? getMaxCompaniesForRange(selectedRange) : 0
  const totalCapacity = maxPerWebhook * webhooksForRange.length
  const availableCompanies = selectedRange
    ? (counts[selectedRange] || 0) - (sentCounts[selectedRange] || 0)
    : 0

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">HQ Data Warehouse - Clay Batch Sender</h1>
          <button
            onClick={() => setShowAdminPanel(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm font-medium"
          >
            Admin: Setup Webhooks
          </button>
        </div>
      </header>

      {/* Admin Panel Modal */}
      {showAdminPanel && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Webhook Admin Panel</h2>
                <button
                  onClick={() => setShowAdminPanel(false)}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  &times;
                </button>
              </div>

              {/* Bulk Add Section */}
              <div className="mb-8">
                <h3 className="font-semibold mb-3">Add Webhooks to Range</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Employee Range</label>
                    <select
                      value={adminRange}
                      onChange={(e) => setAdminRange(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                    >
                      <option value="">Select Range</option>
                      {EMPLOYEE_RANGES.map(range => (
                        <option key={range} value={range}>{range}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Webhooks</label>
                    <div className="space-y-2">
                      {webhookInputs.map((input, idx) => (
                        <div key={idx} className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Table name"
                            value={input.name}
                            onChange={(e) => updateWebhookInput(idx, 'name', e.target.value)}
                            className="w-32 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                          />
                          <input
                            type="url"
                            placeholder="Webhook URL"
                            value={input.url}
                            onChange={(e) => updateWebhookInput(idx, 'url', e.target.value)}
                            className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm font-mono"
                          />
                          <button
                            onClick={() => removeWebhookInput(idx)}
                            className="px-2 text-red-400 hover:text-red-300"
                            disabled={webhookInputs.length === 1}
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={addWebhookInput}
                      className="mt-2 text-sm text-blue-400 hover:text-blue-300"
                    >
                      + Add another webhook
                    </button>
                  </div>

                  <button
                    onClick={saveBulkWebhooks}
                    disabled={!adminRange || webhookInputs.every(w => !w.name.trim() || !w.url.trim()) || savingBulk}
                    className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded font-medium"
                  >
                    {savingBulk ? 'Saving...' : 'Save Webhooks'}
                  </button>
                </div>
              </div>

              {/* Existing Webhooks by Range */}
              <div>
                <h3 className="font-semibold mb-3">Webhooks by Range</h3>
                <div className="space-y-3">
                  {EMPLOYEE_RANGES.map(range => {
                    const rangeWebhooks = webhooks.filter(w => w.employee_range === range)
                    return (
                      <div key={range} className="bg-gray-700 p-3 rounded">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium">{range}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-400">
                              {rangeWebhooks.length} webhook{rangeWebhooks.length !== 1 ? 's' : ''}
                            </span>
                            {rangeWebhooks.length > 0 && (
                              <button
                                onClick={() => deleteAllWebhooksForRange(range)}
                                className="text-xs text-red-400 hover:text-red-300"
                              >
                                Delete All
                              </button>
                            )}
                          </div>
                        </div>
                        {rangeWebhooks.length > 0 && (
                          <div className="text-xs text-gray-400 space-y-1">
                            {rangeWebhooks.map((w, i) => (
                              <div key={w.id} className="truncate">
                                {i + 1}. {w.name}: {w.webhook_url.substring(0, 50)}...
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="p-6 max-w-7xl mx-auto">
        {/* Company Counts by Range */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">1. Select Employee Range</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {EMPLOYEE_RANGES.map((range) => {
              const total = counts[range] || 0
              const sent = sentCounts[range] || 0
              const remaining = total - sent
              const maxPer = getMaxCompaniesForRange(range)
              const webhookCount = webhooks.filter(w => w.employee_range === range).length

              return (
                <div
                  key={range}
                  onClick={() => setSelectedRange(range)}
                  className={`p-3 rounded-lg cursor-pointer transition ${
                    selectedRange === range
                      ? 'bg-blue-600 ring-2 ring-blue-400'
                      : 'bg-gray-800 hover:bg-gray-700'
                  }`}
                >
                  <div className="text-xl font-bold">{remaining.toLocaleString()}</div>
                  <div className="text-sm text-gray-300">{range}</div>
                  <div className="text-xs text-gray-400">
                    {sent.toLocaleString()}/{total.toLocaleString()} sent
                  </div>
                  <div className="text-xs text-gray-500">
                    {webhookCount} webhook{webhookCount !== 1 ? 's' : ''} | {maxPer.toLocaleString()}/ea
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Webhooks for Selected Range */}
        <section className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">
              2. Webhooks {selectedRange && `for ${selectedRange}`}
            </h2>
            <button
              onClick={() => setShowWebhookForm(!showWebhookForm)}
              className="text-sm bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded"
            >
              + Add Webhook
            </button>
          </div>

          {showWebhookForm && (
            <div className="bg-gray-800 p-4 rounded-lg mb-4">
              <div className="flex gap-3 flex-wrap">
                <select
                  value={newWebhookRange}
                  onChange={(e) => setNewWebhookRange(e.target.value)}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                >
                  <option value="">Select Range</option>
                  {EMPLOYEE_RANGES.map(range => (
                    <option key={range} value={range}>{range}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Name (e.g., Table 1)"
                  value={newWebhookName}
                  onChange={(e) => setNewWebhookName(e.target.value)}
                  className="flex-1 min-w-[150px] px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
                <input
                  type="url"
                  placeholder="Webhook URL"
                  value={newWebhookUrl}
                  onChange={(e) => setNewWebhookUrl(e.target.value)}
                  className="flex-2 min-w-[300px] px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
                <button
                  onClick={addWebhook}
                  disabled={!newWebhookRange || !newWebhookName || !newWebhookUrl}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {!selectedRange ? (
            <div className="text-gray-400 bg-gray-800 p-4 rounded-lg">
              Select an employee range above to see its webhooks
            </div>
          ) : webhooksForRange.length === 0 ? (
            <div className="text-gray-400 bg-gray-800 p-4 rounded-lg">
              No webhooks configured for {selectedRange}. Add one above.
            </div>
          ) : (
            <div className="space-y-2">
              {webhooksForRange.map((webhook, idx) => (
                <div
                  key={webhook.id}
                  className="p-3 rounded-lg bg-blue-600 flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium">
                      #{idx + 1} - {webhook.name}
                    </div>
                    <div className="text-sm text-blue-200 truncate max-w-lg">
                      {webhook.webhook_url}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteWebhook(webhook.id)}
                    className="text-red-300 hover:text-red-100 px-2"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Batch Builder */}
        <section className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-lg font-semibold mb-4">3. Send Batch</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Batch Size (companies to send)
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={batchSize}
                  onChange={(e) => setBatchSize(parseInt(e.target.value) || 100)}
                  min={1}
                  max={Math.max(totalCapacity, availableCompanies) || 10000}
                  className="w-40 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
                {selectedRange && webhooksForRange.length > 0 && (
                  <button
                    onClick={() => setBatchSize(Math.min(availableCompanies, totalCapacity))}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                  >
                    Send All ({Math.min(availableCompanies, totalCapacity).toLocaleString()})
                  </button>
                )}
              </div>
            </div>

            {selectedRange && (
              <div className="bg-gray-700 p-4 rounded-lg space-y-1">
                <div className="text-sm">
                  <span className="text-gray-400">Range:</span>{' '}
                  <span className="text-white font-medium">{selectedRange}</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-400">Available companies:</span>{' '}
                  <span className="text-white font-medium">{availableCompanies.toLocaleString()}</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-400">Webhooks:</span>{' '}
                  <span className="text-white font-medium">{webhooksForRange.length}</span>
                  {' '}({maxPerWebhook.toLocaleString()} companies each max)
                </div>
                <div className="text-sm">
                  <span className="text-gray-400">Total capacity:</span>{' '}
                  <span className="text-white font-medium">{totalCapacity.toLocaleString()}</span>
                </div>
                <div className="text-sm mt-2 pt-2 border-t border-gray-600">
                  <span className="text-gray-400">Will send:</span>{' '}
                  <span className="text-green-400 font-bold text-lg">
                    {Math.min(batchSize, availableCompanies, totalCapacity).toLocaleString()}
                  </span>{' '}
                  companies distributed across {webhooksForRange.length} webhook(s)
                </div>
              </div>
            )}

            <button
              onClick={sendBatch}
              disabled={sending || !selectedRange || webhooksForRange.length === 0}
              className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium text-lg"
            >
              {sending ? 'Sending...' : 'Send Batch to Clay'}
            </button>

            {result && (
              <div className={`p-4 rounded-lg whitespace-pre-wrap ${
                result.startsWith('Success') ? 'bg-green-900' : 'bg-red-900'
              }`}>
                {result}
              </div>
            )}
          </div>
        </section>

        {/* All Webhooks Overview */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-4">All Configured Webhooks</h2>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-700">
                <tr>
                  <th className="text-left p-3">Range</th>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">URL</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {webhooks.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-gray-400 text-center">
                      No webhooks configured yet
                    </td>
                  </tr>
                ) : (
                  webhooks.map(webhook => (
                    <tr key={webhook.id} className="border-t border-gray-700">
                      <td className="p-3">
                        <span className="px-2 py-1 bg-gray-700 rounded text-xs">
                          {webhook.employee_range || 'Unassigned'}
                        </span>
                      </td>
                      <td className="p-3">{webhook.name}</td>
                      <td className="p-3 text-gray-400 truncate max-w-xs">
                        {webhook.webhook_url}
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => deleteWebhook(webhook.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}
