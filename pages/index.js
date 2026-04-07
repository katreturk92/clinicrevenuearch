import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

// Environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null

export default function ClinicRevenueArch() {
  const [loading, setLoading] = useState(true)
  const [clinic, setClinic] = useState(null)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    fetchData()
  }, [])

  async function fetchData() {
    const { data } = await supabase.from('clinics').select('*').maybeSingle()
    setClinic(data)
    setLoading(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>

  if (!supabase) return <div style={{ padding: 40, color: 'red' }}>Missing Supabase config</div>

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 800, margin: '0 auto', padding: 20 }}>
      <h1 style={{ color: '#1e293b', fontSize: 32, marginBottom: 8 }}>🏥 Clinic Revenue Arch</h1>
      <p style={{ color: '#64748b', marginBottom: 32 }}>Operating System for Predictable Profit</p>
      
      <div style={{ background: '#f8fafc', padding: 24, borderRadius: 12, marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>Clinic</h2>
        <p style={{ margin: 0, fontSize: 18, color: '#3b82f6', fontWeight: 600 }}>
          {clinic?.name || 'No clinic found'}
        </p>
        <p style={{ margin: '8px 0 0 0', color: '#64748b', fontSize: 14 }}>
          Week {clinic?.current_week || 1}
        </p>
      </div>

      <div style={{ background: 'white', padding: 24, borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>Quick Stats</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ padding: 16, background: '#eff6ff', borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase' }}>Status</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#3b82f6' }}>Active</div>
          </div>
          <div style={{ padding: 16, background: '#ecfdf5', borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase' }}>Services</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>0</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <button 
          onClick={() => alert('More features coming!')}
          style={{ 
            padding: '12px 24px', 
            background: '#3b82f6', 
            color: 'white', 
            border: 'none', 
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          + Add Service
        </button>
      </div>
    </div>
  )
}
