import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

// Safe client creation
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null

const safeNum = (val, fallback = 0) => {
  const n = parseFloat(val)
  return isNaN(n) ? fallback : n
}

export default function ClinicRevenueArch() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [clinic, setClinic] = useState(null)
  const [services, setServices] = useState([])
  const [capacityData, setCapacityData] = useState([])
  const [governanceHistory, setGovernanceHistory] = useState([])
  const [experiments, setExperiments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentWeek, setCurrentWeek] = useState(1)

  const [newService, setNewService] = useState({ name: '', price: '', cost: '', time: '' })
  const [newExperiment, setNewExperiment] = useState({ target_service: '', experiment: '', hypothesis: '', change: '', date: '', duration: '', result: '' })

  useEffect(() => {
    if (!supabase) {
      setError('Missing Supabase configuration')
      setLoading(false)
      return
    }
    fetchAllData()
  }, [])

  async function fetchAllData() {
    setLoading(true)
    setError(null)
    try {
      let { data: clinicData, error: clinicError } = await supabase.from('clinics').select('*').maybeSingle()
      
      if (clinicError) throw clinicError
      
      if (!clinicData) {
        const { data: newClinic, error: createError } = await supabase
          .from('clinics')
          .insert([{ name: 'My Clinic', current_week: 1 }])
          .select()
          .single()
        if (createError) throw createError
        clinicData = newClinic
      }
      
      if (!clinicData) {
        setLoading(false)
        return
      }

      setClinic(clinicData)
      setCurrentWeek(clinicData.current_week || 1)

      const [
        { data: servicesData },
        { data: capacity },
        { data: history },
        { data: exps }
      ] = await Promise.all([
        supabase.from('services').select('*').eq('clinic_id', clinicData.id),
        supabase.from('capacity_mapping').select('*, services(name, price)').eq('clinic_id', clinicData.id),
        supabase.from('governance').select('*').eq('clinic_id', clinicData.id).order('week', { ascending: false }),
        supabase.from('experiments').select('*, services(name)').eq('clinic_id', clinicData.id).order('created_at', { ascending: false })
      ])

      setServices(servicesData || [])
      setCapacityData(capacity || [])
      setGovernanceHistory(history || [])
      setExperiments(exps || [])
    } catch (err) {
      console.error('Error:', err)
      setError(err.message)
    }
    setLoading(false)
  }

  async function addService(e) {
    e.preventDefault()
    if (!clinic || !supabase) return
    
    const name = newService.name.trim()
    const price = safeNum(newService.price)
    const cost = safeNum(newService.cost)
    const time = parseInt(newService.time)
    
    if (!name || price <= 0 || time <= 0) {
      alert('Please fill all fields with valid values')
      return
    }

    const { error } = await supabase.from('services').insert([{
      clinic_id: clinic.id,
      name,
      price,
      cost,
      time_minutes: time
    }])
    
    if (!error) {
      setNewService({ name: '', price: '', cost: '', time: '' })
      fetchAllData()
    }
  }

  async function updateCapacity(serviceId, field, value) {
    if (!clinic || !supabase) return
    
    const numVal = safeNum(value)
    const existing = capacityData.find(c => c.service_id === serviceId)
    
    if (existing) {
      await supabase.from('capacity_mapping').update({ [field]: numVal }).eq('id', existing.id)
    } else {
      await supabase.from('capacity_mapping').insert([{
        clinic_id: clinic.id,
        service_id: serviceId,
        [field]: numVal
      }])
    }
    fetchAllData()
  }

  async function saveWeek() {
    if (!clinic || !supabase) return
    
    const status = gapPercent <= 30 ? 'Healthy Performance' : gapPercent <= 60 ? 'Needs Attention' : 'Immediate Action Required'
    const priority = status === 'Healthy Performance' ? 'Low' : status === 'Needs Attention' ? 'Medium' : 'High'
    
    await supabase.from('governance').insert([{
      clinic_id: clinic.id,
      week: currentWeek,
      total_weekly_revenue: totalWeeklyRevenue,
      total_max_revenue: totalMaxRevenue,
      gap,
      status,
      priority
    }])
    
    await supabase.from('clinics').update({ current_week: currentWeek + 1 }).eq('id', clinic.id)
    setCurrentWeek(prev => prev + 1)
    fetchAllData()
  }

  async function addExperiment(e) {
    e.preventDefault()
    if (!clinic || !supabase) return
    
    if (!newExperiment.experiment.trim() || !newExperiment.target_service) {
      alert('Please fill in experiment name and select a service')
      return
    }
    
    await supabase.from('experiments').insert([{
      clinic_id: clinic.id,
      service_id: newExperiment.target_service,
      experiment_name: newExperiment.experiment.trim(),
      hypothesis: newExperiment.hypothesis,
      change_made: newExperiment.change,
      start_date: newExperiment.date || null,
      duration_days: parseInt(newExperiment.duration) || null,
      result: newExperiment.result || null
    }])
    
    setNewExperiment({ target_service: '', experiment: '', hypothesis: '', change: '', date: '', duration: '', result: '' })
    fetchAllData()
  }

  // Calculations
  const servicesWithMetrics = services.map(s => {
    const price = safeNum(s.price)
    const cost = safeNum(s.cost)
    const time = safeNum(s.time_minutes, 1)
    const profit = price - cost
    const profitPerMinute = time > 0 ? (profit / time).toFixed(2) : '0.00'
    return { ...s, price, cost, time_minutes: time, profit, profitPerMinute: safeNum(profitPerMinute) }
  }).sort((a, b) => b.profitPerMinute - a.profitPerMinute)

  const top3Services = servicesWithMetrics.slice(0, 3)
  const leastProfitable = servicesWithMetrics.length > 0 ? servicesWithMetrics[servicesWithMetrics.length - 1] : null

  const cashFlowData = services.map(service => {
    const cap = capacityData.find(c => c.service_id === service.id) || {}
    const sessions = safeNum(cap.sessions_per_week)
    const price = safeNum(service.price)
    const cost = safeNum(service.cost)
    const revenue = price * sessions
    const varCost = cost * sessions
    const profit = revenue - varCost
    const margin = revenue > 0 ? safeNum(((profit / revenue) * 100).toFixed(1)) : 0
    const insight = margin >= 70 ? 'Scale' : margin >= 40 ? 'Healthy' : 'Rethink'
    return { ...service, sessions, revenue, varCost, profit, margin, insight }
  })

  const totalWeeklyRevenue = cashFlowData.reduce((sum, s) => sum + s.revenue, 0)
  const totalMaxRevenue = capacityData.reduce((sum, c) => {
    const service = services.find(s => s.id === c.service_id)
    return sum + (service ? safeNum(service.price) * safeNum(c.max_capacity) : 0)
  }, 0)
  
  const gap = Math.max(0, totalMaxRevenue - totalWeeklyRevenue)
  const gapPercent = totalMaxRevenue > 0 ? safeNum(((gap / totalMaxRevenue) * 100).toFixed(1)) : 0
  const gapResult = gap === 0 ? 'Strong' : gapPercent > 30 ? 'Underperforming' : 'Good'

  const underPotentialService = services.map(service => {
    const cap = capacityData.find(c => c.service_id === service.id) || {}
    const price = safeNum(service.price)
    const maxRev = price * safeNum(cap.max_capacity)
    const actualRev = price * safeNum(cap.sessions_per_week)
    return { ...service, gap: maxRev - actualRev, maxRev, actualRev }
  }).sort((a, b) => b.gap - a.gap)[0] || null

  const getStatusColor = (status) => {
    if (['Healthy Performance', 'Strong', 'Success', 'Healthy'].includes(status)) return '#10b981'
    if (['Needs Attention', 'Good', 'Neutral'].includes(status)) return '#f59e0b'
    return '#ef4444'
  }

  const getStatusBg = (status) => {
    if (['Healthy Performance', 'Strong', 'Success', 'Healthy'].includes(status)) return '#d1fae5'
    if (['Needs Attention', 'Good', 'Neutral'].includes(status)) return '#fef3c7'
    return '#fee2e2'
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }}></div>
        <p style={{ color: '#64748b', fontSize: '16px' }}>Loading your clinic data...</p>
      </div>
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: '20px' }}>
      <div style={{ background: 'white', padding: '32px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', maxWidth: '400px', textAlign: 'center' }}>
        <div style={{ width: '48px', height: '48px', background: '#fee2e2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '24px' }}>⚠️</div>
        <h2 style={{ margin: '0 0 8px 0', color: '#1e293b', fontSize: '20px' }}>Configuration Error</h2>
        <p style={{ margin: '0 0 16px 0', color: '#64748b', fontSize: '14px' }}>{error}</p>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px' }}>Please check your environment variables in Vercel</p>
      </div>
    </div>
  )

  const noServices = services.length === 0

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif' }}>
      {/* Header */}
      <header style={{ background: 'white', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>Clinic Revenue Arch</h1>
              <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#64748b' }}>Operating System for Predictable Profit</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Current Week</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#3b82f6' }}>Week {currentWeek}</div>
            </div>
          </div>
          
          {/* Navigation */}
          <nav style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '4px' }}>
            {[
              { id: 'dashboard', label: 'Dashboard', icon: '📊' },
              { id: 'revenue', label: 'Revenue Audit', icon: '💰' },
              { id: 'capacity', label: 'Capacity', icon: '📅' },
              { id: 'cash', label: 'Cash & Margin', icon: '💵' },
              { id: 'governance', label: 'Governance', icon: '📈' },
              { id: 'experiments', label: 'Experiments', icon: '🧪' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '10px 16px',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: activeTab === tab.id ? '#3b82f6' : 'transparent',
                  color: activeTab === tab.id ? 'white' : '#64748b',
                  fontWeight: activeTab === tab.id ? '600' : '500',
                  fontSize: '14px',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
        
        {/* DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div>
            {noServices ? (
              <div style={{ background: 'white', borderRadius: '16px', padding: '64px 24px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <div style={{ width: '80px', height: '80px', background: '#eff6ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: '40px' }}>🏥</div>
                <h2 style={{ margin: '0 0 8px 0', color: '#1e293b', fontSize: '24px' }}>Welcome to Clinic Revenue Arch</h2>
                <p style={{ margin: '0 0 24px 0', color: '#64748b', fontSize: '16px', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>Start by adding your first service to begin tracking your clinic's profitability</p>
                <button 
                  onClick={() => setActiveTab('revenue')}
                  style={{
                    padding: '12px 24px',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'transform 0.2s'
                  }}
                >
                  + Add Your First Service
                </button>
              </div>
            ) : (
              <>
                {/* Stats Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>Weekly Revenue</div>
                    <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b' }}>${totalWeeklyRevenue.toLocaleString()}</div>
                    <div style={{ fontSize: '12px', color: '#10b981', marginTop: '4px' }}>↑ Active</div>
                  </div>
                  
                  <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>Max Potential</div>
                    <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b' }}>${totalMaxRevenue.toLocaleString()}</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Full capacity</div>
                  </div>
                  
                  <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>Revenue Gap</div>
                    <div style={{ fontSize: '32px', fontWeight: '700', color: gapPercent > 30 ? '#ef4444' : '#10b981' }}>{gapPercent}%</div>
                    <div style={{ fontSize: '12px', color: gapPercent > 30 ? '#ef4444' : '#10b981', marginTop: '4px' }}>{gapResult}</div>
                  </div>
                  
                  <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>Status</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: getStatusColor(gapPercent <= 30 ? 'Healthy' : gapPercent <= 60 ? 'Needs Attention' : 'Immediate Action Required') }}></span>
                      <span style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
                        {gapPercent <= 30 ? 'Healthy' : gapPercent <= 60 ? 'Attention' : 'Action'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Under Potential Alert */}
                {underPotentialService && underPotentialService.gap > 0 && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '12px', padding: '20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', background: '#f59e0b', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>⚠️</div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: '0 0 4px 0', color: '#92400e', fontSize: '16px', fontWeight: '600' }}>Revenue Opportunity</h3>
                      <p style={{ margin: 0, color: '#92400e', fontSize: '14px' }}>
                        <strong>{underPotentialService.name}</strong> has ${underPotentialService.gap.toLocaleString()} untapped potential 
                        ({((underPotentialService.actualRev / underPotentialService.maxRev) * 100).toFixed(0)}% utilized)
                      </p>
                    </div>
                    <button 
                      onClick={() => setActiveTab('capacity')}
                      style={{ padding: '8px 16px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', flexShrink: 0 }}
                    >
                      Fix
                    </button>
                  </div>
                )}

                {/* Top Performers */}
                <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  <h3 style={{ margin: '0 0 16px 0', color: '#1e293b', fontSize: '18px', fontWeight: '600' }}>Top Performers</h3>
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {top3Services.slice(0, 3).map((s, i) => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: i === 0 ? '#eff6ff' : '#f8fafc', borderRadius: '8px', border: i === 0 ? '1px solid #3b82f6' : '1px solid #e2e8f0' }}>
                        <div style={{ width: '32px', height: '32px', background: i === 0 ? '#3b82f6' : '#cbd5e1', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px' }}>{i + 1}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', color: '#1e293b' }}>{s.name}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>${s.profitPerMinute}/min profit rate</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: '700', color: '#10b981' }}>${s.profit.toFixed(0)}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>profit/session</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* REVENUE AUDIT */}
        {activeTab === 'revenue' && (
          <div>
            <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <h2 style={{ margin: '0 0 20px 0', color: '#1e293b', fontSize: '20px', fontWeight: '600' }}>Add New Service</h2>
              <form onSubmit={addService}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Service Name</label>
                    <input 
                      placeholder="e.g., Teeth Whitening"
                      value={newService.name}
                      onChange={e => setNewService({ ...newService, name: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Price ($)</label>
                    <input 
                      type="number"
                      placeholder="0.00"
                      value={newService.price}
                      onChange={e => setNewService({ ...newService, price: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Cost ($)</label>
                    <input 
                      type="number"
                      placeholder="0.00"
                      value={newService.cost}
                      onChange={e => setNewService({ ...newService, cost: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Duration (min)</label>
                    <input 
                      type="number"
                      placeholder="30"
                      value={newService.time}
                      onChange={e => setNewService({ ...newService, time: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                <button 
                  type="submit"
                  style={{ padding: '12px 24px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                >
                  + Add Service
                </button>
              </form>
            </div>

            {noServices ? (
              <div style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
                <p>No services yet. Add your first service above.</p>
              </div>
            ) : (
              <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <h3 style={{ margin: '0 0 16px 0', color: '#1e293b', fontSize: '18px', fontWeight: '600' }}>Service Rankings</h3>
                <div style={{ display: 'grid', gap: '12px' }}>
                  {servicesWithMetrics.map((s, i) => (
                    <div key={s.id} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '16px', 
                      padding: '16px', 
                      background: i === 0 ? '#ecfdf5' : i === servicesWithMetrics.length - 1 ? '#fef2f2' : '#f9fafb',
                      borderRadius: '8px',
                      border: i === 0 ? '1px solid #10b981' : i === servicesWithMetrics.length - 1 ? '1px solid #ef4444' : '1px solid #e5e7eb'
                    }}>
                      <div style={{ 
                        width: '32px', 
                        height: '32px', 
                        background: i === 0 ? '#10b981' : i === servicesWithMetrics.length - 1 ? '#ef4444' : '#6b7280', 
                        color: 'white', 
                        borderRadius: '50%', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        fontWeight: '700', 
                        fontSize: '14px' 
                      }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', color: '#1e293b' }}>{s.name}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          ${s.price} price · ${s.cost} cost · {s.time_minutes}min
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: '700', color: i === 0 ? '#10b981' : i === servicesWithMetrics.length - 1 ? '#ef4444' : '#1e293b' }}>
                          ${s.profitPerMinute}/min
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          ${s.profit.toFixed(0)} profit
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CAPACITY MAPPING */}
        {activeTab === 'capacity' && (
          <div>
            {noServices ? (
              <div style={{ background: 'white', borderRadius: '12px', padding: '48px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <p style={{ color: '#64748b' }}>No services yet. Add services first in the Revenue Audit tab.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '16px' }}>
                {services.map(service => {
                  const cap = capacityData.find(c => c.service_id === service.id) || {}
                  const maxCap = safeNum(cap.max_capacity)
                  const sessions = safeNum(cap.sessions_per_week)
                  const price = safeNum(service.price)
                  const maxRevenue = price * maxCap
                  const actualRevenue = price * sessions
                  const utilization = maxCap > 0 ? Math.round((sessions / maxCap) * 100) : 0

                  return (
                    <div key={service.id} style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ margin: 0, color: '#1e293b', fontSize: '18px', fontWeight: '600' }}>{service.name}</h3>
                        <span style={{ 
                          padding: '6px 12px', 
                          borderRadius: '20px', 
                          background: utilization >= 100 ? '#d1fae5' : utilization >= 50 ? '#fef3c7' : '#fee2e2',
                          color: utilization >= 100 ? '#065f46' : utilization >= 50 ? '#92400e' : '#991b1b',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}>
                          {utilization >= 100 ? 'Full Capacity' : utilization >= 50 ? 'Demanding' : 'Underutilized'}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Max Capacity</label>
                          <input 
                            type="number"
                            defaultValue={maxCap || ''}
                            onBlur={e => updateCapacity(service.id, 'max_capacity', e.target.value)}
                            style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Weekly Sessions</label>
                          <input 
                            type="number"
                            defaultValue={sessions || ''}
                            onBlur={e => updateCapacity(service.id, 'sessions_per_week', e.target.value)}
                            style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', padding: '16px', background: '#f8fafc', borderRadius: '8px' }}>
                        <div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Utilization</div>
                          <div style={{ fontSize: '20px', fontWeight: '700', color: utilization >= 100 ? '#10b981' : utilization >= 50 ? '#f59e0b' : '#ef4444' }}>{utilization}%</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Max Revenue</div>
                          <div style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b' }}>${maxRevenue.toLocaleString()}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Actual Revenue</div>
                          <div style={{ fontSize: '20px', fontWeight: '700', color: '#10b981' }}>${actualRevenue.toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* CASH & MARGIN */}
        {activeTab === 'cash' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>Total Revenue</div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b' }}>${totalWeeklyRevenue.toLocaleString()}</div>
              </div>
              <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>Total Profit</div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#10b981' }}>
                  ${cashFlowData.reduce((sum, s) => sum + s.profit, 0).toLocaleString()}
                </div>
              </div>
              <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>Avg Margin</div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#3b82f6' }}>
                  {cashFlowData.length > 0 ? (cashFlowData.reduce((sum, s) => sum + s.margin, 0) / cashFlowData.length).toFixed(1) : 0}%
                </div>
              </div>
            </div>

            {noServices ? (
              <div style={{ background: 'white', borderRadius: '12px', padding: '48px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <p style={{ color: '#64748b' }}>No services yet. Add services first.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '16px' }}>
                {cashFlowData.map(service => (
                  <div key={service.id} style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h3 style={{ margin: 0, color: '#1e293b', fontSize: '18px', fontWeight: '600' }}>{service.name}</h3>
                      <span style={{ 
                        padding: '6px 12px', 
                        borderRadius: '20px', 
                        background: getStatusBg(service.insight),
                        color: getStatusColor(service.insight),
                        fontSize: '12px',
                        fontWeight: '600'
                      }}>
                        {service.insight}
                      </span>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '16px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Sessions</div>
                        <div style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>{service.sessions}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Revenue</div>
                        <div style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>${service.revenue.toLocaleString()}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Cost</div>
                        <div style={{ fontSize: '18px', fontWeight: '600', color: '#64748b' }}>${service.varCost.toLocaleString()}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Profit</div>
                        <div style={{ fontSize: '18px', fontWeight: '600', color: '#10b981' }}>${service.profit.toLocaleString()}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Margin</div>
                        <div style={{ fontSize: '18px', fontWeight: '600', color: service.margin >= 40 ? '#10b981' : '#ef4444' }}>{service.margin}%</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* GOVERNANCE */}
        {activeTab === 'governance' && (
          <div>
            <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                  <h2 style={{ margin: '0 0 4px 0', color: '#1e293b', fontSize: '20px', fontWeight: '600' }}>Week {currentWeek}</h2>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>Current reporting period</p>
                </div>
                <button 
                  onClick={saveWeek}
                  style={{ padding: '12px 24px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Save & Advance Week
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
                <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Revenue</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>${totalWeeklyRevenue.toLocaleString()}</div>
                </div>
                <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Gap</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: '#ef4444' }}>${gap.toLocaleString()}</div>
                </div>
                <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: getStatusColor(gapPercent <= 30 ? 'Healthy' : gapPercent <= 60 ? 'Needs Attention' : 'Immediate Action Required') }}>
                    {gapPercent <= 30 ? 'Healthy' : gapPercent <= 60 ? 'Needs Attention' : 'Action Required'}
                  </div>
                </div>
                <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Priority</div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>
                    {gapPercent <= 30 ? 'Low' : gapPercent <= 60 ? 'Medium' : 'High'}
                  </div>
                </div>
              </div>
            </div>

            <h3 style={{ margin: '0 0 16px 0', color: '#1e293b', fontSize: '18px', fontWeight: '600' }}>Weekly History</h3>
            {governanceHistory.length === 0 ? (
              <div style={{ background: 'white', borderRadius: '12px', padding: '48px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <p style={{ color: '#64748b' }}>No history yet. Save your first week above.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '12px' }}>
                {governanceHistory.map(record => (
                  <div key={record.id} style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '16px', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Week</div>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>{record.week}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Revenue</div>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>${safeNum(record.total_weekly_revenue).toLocaleString()}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Gap</div>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: '#ef4444' }}>${safeNum(record.gap).toLocaleString()}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Status</div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: getStatusColor(record.status) }}>{record.status}</div>
                    </div>
                    <div>
                      <span style={{ padding: '4px 12px', borderRadius: '12px', background: getStatusBg(record.priority), color: getStatusColor(record.priority), fontSize: '12px', fontWeight: '600' }}>
                        {record.priority}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* EXPERIMENTS */}
        {activeTab === 'experiments' && (
          <div>
            <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <h2 style={{ margin: '0 0 20px 0', color: '#1e293b', fontSize: '20px', fontWeight: '600' }}>Log New Experiment</h2>
              <form onSubmit={addExperiment}>
                <div style={{ display: 'grid', gap: '16px', marginBottom: '20px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Target Service</label>
                    <select 
                      value={newExperiment.target_service}
                      onChange={e => setNewExperiment({ ...newExperiment, target_service: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', background: 'white' }}
                    >
                      <option value="">Select a service</option>
                      {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Experiment Name</label>
                    <input 
                      placeholder="e.g., 10% Price Increase Test"
                      value={newExperiment.experiment}
                      onChange={e => setNewExperiment({ ...newExperiment, experiment: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Start Date</label>
                      <input 
                        type="date"
                        value={newExperiment.date}
                        onChange={e => setNewExperiment({ ...newExperiment, date: e.target.value })}
                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Duration (days)</label>
                      <input 
                        type="number"
                        placeholder="7"
                        value={newExperiment.duration}
                        onChange={e => setNewExperiment({ ...newExperiment, duration: e.target.value })}
                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Result</label>
                      <select 
                        value={newExperiment.result}
                        onChange={e => setNewExperiment({ ...newExperiment, result: e.target.value })}
                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', background: 'white' }}
                      >
                        <option value="">Select result</option>
                        <option value="Success">✅ Success</option>
                        <option value="Neutral">⚪ Neutral</option>
                        <option value="Fail">❌ Fail</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Hypothesis</label>
                    <input 
                      placeholder="What do you expect to happen?"
                      value={newExperiment.hypothesis}
                      onChange={e => setNewExperiment({ ...newExperiment, hypothesis: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>Change Made</label>
                    <input 
                      placeholder="What exactly did you change?"
                      value={newExperiment.change}
                      onChange={e => setNewExperiment({ ...newExperiment, change: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' }}
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  style={{ padding: '12px 24px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Save Experiment
                </button>
              </form>
            </div>

            <h3 style={{ margin: '0 0 16px 0', color: '#1e293b', fontSize: '18px', fontWeight: '600' }}>Experiment History</h3>
            {experiments.length === 0 ? (
              <div style={{ background: 'white', borderRadius: '12px', padding: '48px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <p style={{ color: '#64748b' }}>No experiments yet. Log your first one above.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '16px' }}>
                {experiments.map(exp => (
                  <div key={exp.id} style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: `4px solid ${getStatusColor(exp.result || 'Neutral')}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div>
                        <h4 style={{ margin: '0 0 4px 0', color: '#1e293b', fontSize: '18px', fontWeight: '600' }}>{exp.experiment_name}</h4>
                        <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>Target: {exp.services?.name || 'Unknown'}</p>
                      </div>
                      <span style={{ 
                        padding: '6px 12px', 
                        borderRadius: '20px', 
                        background: getStatusBg(exp.result || 'Neutral'),
                        color: getStatusColor(exp.result || 'Neutral'),
                        fontSize: '12px',
                        fontWeight: '600'
                      }}>
                        {exp.result || 'Pending'}
                      </span>
                    </div>
                    
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {exp.hypothesis && (
                        <div style={{ fontSize: '14px', color: '#4b5563' }}>
                          <strong>Hypothesis:</strong> {exp.hypothesis}
                        </div>
                      )}
                      {exp.change_made && (
                        <div style={{ fontSize: '14px', color: '#4b5563' }}>
                          <strong>Change:</strong> {exp.change_made}
                        </div>
                      )}
                      <div style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>
                        {exp.start_date && `📅 ${exp.start_date}`}
                        {exp.duration_days && ` · ⏱️ ${exp.duration_days} days`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
