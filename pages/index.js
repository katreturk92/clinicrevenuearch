import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function ClinicRevenueArch() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [clinic, setClinic] = useState(null)
  const [services, setServices] = useState([])
  const [capacityData, setCapacityData] = useState([])
  const [governanceHistory, setGovernanceHistory] = useState([])
  const [experiments, setExperiments] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentWeek, setCurrentWeek] = useState(1)

  // Form states
  const [newService, setNewService] = useState({ name: '', price: '', cost: '', time: '' })
  const [newExperiment, setNewExperiment] = useState({ target_service: '', experiment: '', hypothesis: '', change: '', date: '', duration: '', result: '' })

  useEffect(() => {
    fetchAllData()
  }, [])

  async function fetchAllData() {
    setLoading(true)
    
    // Get or create clinic
    let { data: clinicData } = await supabase.from('clinics').select('*').single()
    
    if (!clinicData) {
      const { data: newClinic } = await supabase.from('clinics').insert([{ name: 'My Clinic', current_week: 1 }]).select().single()
      clinicData = newClinic
    }
    
    setClinic(clinicData)
    setCurrentWeek(clinicData?.current_week || 1)

    // Get services with calculated fields
    const { data: servicesData } = await supabase
      .from('services')
      .select('*')
      .eq('clinic_id', clinicData?.id)
    
    setServices(servicesData || [])

    // Get capacity data
    const { data: capacity } = await supabase
      .from('capacity_mapping')
      .select('*, services(name, price)')
      .eq('clinic_id', clinicData?.id)
    
    setCapacityData(capacity || [])

    // Get governance history
    const { data: history } = await supabase
      .from('governance')
      .select('*')
      .eq('clinic_id', clinicData?.id)
      .order('week', { ascending: false })
    
    setGovernanceHistory(history || [])

    // Get experiments
    const { data: exps } = await supabase
      .from('experiments')
      .select('*, services(name)')
      .eq('clinic_id', clinicData?.id)
      .order('created_at', { ascending: false })
    
    setExperiments(exps || [])
    setLoading(false)
  }

  // TAB 1: Revenue Audit - Add Service
  async function addService(e) {
    e.preventDefault()
    if (!clinic) return
    
    const { error } = await supabase.from('services').insert([{
      clinic_id: clinic.id,
      name: newService.name,
      price: parseFloat(newService.price),
      cost: parseFloat(newService.cost),
      time_minutes: parseInt(newService.time)
    }])
    
    if (!error) {
      setNewService({ name: '', price: '', cost: '', time: '' })
      fetchAllData()
    }
  }

  // Calculate profit metrics for display
  const servicesWithMetrics = services.map(s => ({
    ...s,
    profit: s.price - s.cost,
    profitPerMinute: ((s.price - s.cost) / s.time_minutes).toFixed(2)
  })).sort((a, b) => b.profitPerMinute - a.profitPerMinute)

  const top3Services = servicesWithMetrics.slice(0, 3)
  const leastProfitable = servicesWithMetrics[servicesWithMetrics.length - 1]

  // TAB 2: Capacity Mapping - Update Capacity
  async function updateCapacity(serviceId, field, value) {
    const existing = capacityData.find(c => c.service_id === serviceId)
    
    if (existing) {
      await supabase.from('capacity_mapping').update({ [field]: parseFloat(value) }).eq('id', existing.id)
    } else {
      await supabase.from('capacity_mapping').insert([{
        clinic_id: clinic.id,
        service_id: serviceId,
        [field]: parseFloat(value)
      }])
    }
    fetchAllData()
  }

  // TAB 3: Cash & Margin Calculations
  const cashFlowData = services.map(service => {
    const capacity = capacityData.find(c => c.service_id === service.id) || {}
    const sessions = capacity.sessions_per_week || 0
    const revenue = service.price * sessions
    const varCost = service.cost * sessions
    const profit = revenue - varCost
    const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0
    
    let insight = ''
    if (margin >= 70) insight = 'Scale'
    else if (margin >= 40) insight = 'Healthy'
    else insight = 'Rethink'
    
    return { ...service, sessions, revenue, varCost, profit, margin, insight }
  })

  const totalWeeklyRevenue = cashFlowData.reduce((sum, s) => sum + s.revenue, 0)
  const totalMaxRevenue = capacityData.reduce((sum, c) => {
    const service = services.find(s => s.id === c.service_id)
    return sum + (service ? service.price * (c.max_capacity || 0) : 0)
  }, 0)
  const gap = totalMaxRevenue - totalWeeklyRevenue
  const gapPercent = totalMaxRevenue > 0 ? ((gap / totalMaxRevenue) * 100).toFixed(1) : 0

  let gapResult = ''
  if (gap === 0) gapResult = 'Strong'
  else if (gapPercent > 30) gapResult = 'Underperforming'
  else gapResult = 'Good'

  // TAB 4: Governance - Save Week
  async function saveWeek() {
    const status = gapPercent <= 30 ? 'Healthy Performance' : gapPercent <= 60 ? 'Needs Attention' : 'Immediate Action Required'
    const priority = status === 'Healthy Performance' ? 'Low' : status === 'Needs Attention' ? 'Medium' : 'High'
    
    await supabase.from('governance').insert([{
      clinic_id: clinic.id,
      week: currentWeek,
      total_weekly_revenue: totalWeeklyRevenue,
      total_max_revenue: totalMaxRevenue,
      gap: gap,
      status: status,
      priority: priority
    }])
    
    await supabase.from('clinics').update({ current_week: currentWeek + 1 }).eq('id', clinic.id)
    setCurrentWeek(currentWeek + 1)
    fetchAllData()
  }

  // TAB 6: Experiments - Add Experiment
  async function addExperiment(e) {
    e.preventDefault()
    if (!clinic) return
    
    await supabase.from('experiments').insert([{
      clinic_id: clinic.id,
      service_id: newExperiment.target_service,
      experiment_name: newExperiment.experiment,
      hypothesis: newExperiment.hypothesis,
      change_made: newExperiment.change,
      start_date: newExperiment.date,
      duration_days: parseInt(newExperiment.duration),
      result: newExperiment.result
    }])
    
    setNewExperiment({ target_service: '', experiment: '', hypothesis: '', change: '', date: '', duration: '', result: '' })
    fetchAllData()
  }

  // TAB 5: Dashboard - Under Potential Service
  const underPotentialService = services.map(service => {
    const capacity = capacityData.find(c => c.service_id === service.id) || {}
    const maxRev = service.price * (capacity.max_capacity || 0)
    const actualRev = service.price * (capacity.sessions_per_week || 0)
    return { ...service, gap: maxRev - actualRev, maxRev, actualRev }
  }).sort((a, b) => b.gap - a.gap)[0]

  // Status color helper
  const getStatusColor = (status) => {
    if (status === 'Healthy Performance' || status === 'Strong' || status === 'Success') return '#22c55e'
    if (status === 'Needs Attention' || status === 'Good' || status === 'Neutral') return '#f59e0b'
    return '#ef4444'
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
      {/* Header */}
      <div style={{ marginBottom: '30px', borderBottom: '2px solid #e5e7eb', paddingBottom: '20px' }}>
        <h1 style={{ margin: '0 0 10px 0', fontSize: '28px' }}>🏥 Clinic Revenue Arch</h1>
        <p style={{ color: '#6b7280', margin: 0 }}>Operating System for Predictable Clinic Profit</p>
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '30px', flexWrap: 'wrap' }}>
        {[
          { id: 'dashboard', label: '📊 Master Dashboard' },
          { id: 'revenue', label: '💰 Revenue Audit' },
          { id: 'capacity', label: '📅 Capacity Mapping' },
          { id: 'cash', label: '💵 Cash & Margin' },
          { id: 'governance', label: '📈 Governance' },
          { id: 'experiments', label: '🧪 Experiments' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 16px',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              background: activeTab === tab.id ? '#3b82f6' : '#f3f4f6',
              color: activeTab === tab.id ? 'white' : '#374151',
              fontWeight: activeTab === tab.id ? '600' : '400'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 5: MASTER DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div>
          <div style={{ 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
            color: 'white', 
            padding: '30px', 
            borderRadius: '16px',
            marginBottom: '30px'
          }}>
            <h2 style={{ margin: '0 0 20px 0' }}>Executive Summary</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
              <div style={{ background: 'rgba(255,255,255,0.2)', padding: '20px', borderRadius: '12px' }}>
                <div style={{ fontSize: '14px', opacity: 0.9 }}>Weekly Revenue</div>
                <div style={{ fontSize: '32px', fontWeight: 'bold' }}>${totalWeeklyRevenue.toLocaleString()}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.2)', padding: '20px', borderRadius: '12px' }}>
                <div style={{ fontSize: '14px', opacity: 0.9 }}>Max Potential</div>
                <div style={{ fontSize: '32px', fontWeight: 'bold' }}>${totalMaxRevenue.toLocaleString()}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.2)', padding: '20px', borderRadius: '12px' }}>
                <div style={{ fontSize: '14px', opacity: 0.9 }}>Gap</div>
                <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{gapPercent}%</div>
              </div>
            </div>
            <div style={{ 
              marginTop: '20px', 
              padding: '15px', 
              background: 'rgba(255,255,255,0.2)', 
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span>Status:</span>
              <span style={{ 
                padding: '5px 15px', 
                borderRadius: '20px', 
                background: getStatusColor(gapPercent <= 30 ? 'Healthy' : gapPercent <= 60 ? 'Needs Attention' : 'Immediate Action'),
                fontWeight: 'bold'
              }}>
                {gapPercent <= 30 ? '🟢 Healthy Performance' : gapPercent <= 60 ? '🟡 Needs Attention' : '🔴 Immediate Action Required'}
              </span>
            </div>
          </div>

          {underPotentialService && (
            <div style={{ background: '#fef3c7', padding: '20px', borderRadius: '12px', border: '2px solid #f59e0b' }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#92400e' }}>⚠️ Under Potential</h3>
              <p style={{ margin: 0, color: '#92400e' }}>
                <strong>{underPotentialService.name}</strong> has the largest revenue gap: 
                <strong> ${underPotentialService.gap.toLocaleString()}</strong> untapped potential
                (Max: ${underPotentialService.maxRevenue.toLocaleString()}, 
                Actual: ${underPotentialService.actualRev.toLocaleString()})
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 1: REVENUE AUDIT */}
      {activeTab === 'revenue' && (
        <div>
          <h2 style={{ marginBottom: '20px' }}>Revenue Audit</h2>
          
          <form onSubmit={addService} style={{ background: '#f9fafb', padding: '20px', borderRadius: '12px', marginBottom: '30px' }}>
            <h3 style={{ margin: '0 0 15px 0' }}>Add New Service</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
              <input 
                placeholder="Service Name" 
                value={newService.name} 
                onChange={e => setNewService({...newService, name: e.target.value})}
                style={{ padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
              <input 
                placeholder="Price ($)" 
                type="number" 
                value={newService.price} 
                onChange={e => setNewService({...newService, price: e.target.value})}
                style={{ padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
              <input 
                placeholder="Cost ($)" 
                type="number" 
                value={newService.cost} 
                onChange={e => setNewService({...newService, cost: e.target.value})}
                style={{ padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
              <input 
                placeholder="Time (min)" 
                type="number" 
                value={newService.time} 
                onChange={e => setNewService({...newService, time: e.target.value})}
                style={{ padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
            </div>
            <button type="submit" style={{ 
              marginTop: '15px', 
              padding: '10px 24px', 
              background: '#3b82f6', 
              color: 'white', 
              border: 'none', 
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}>
              Add Service
            </button>
          </form>

          {servicesWithMetrics.length > 0 && (
            <div>
              <h3>🏆 Top 3 Most Profitable (per minute)</h3>
              <div style={{ display: 'grid', gap: '10px', marginBottom: '30px' }}>
                {top3Services.map((s, i) => (
                  <div key={s.id} style={{ 
                    background: i === 0 ? '#fef3c7' : i === 1 ? '#f3f4f6' : '#fafaf9', 
                    padding: '15px', 
                    borderRadius: '8px',
                    border: i === 0 ? '2px solid #f59e0b' : '1px solid #e5e7eb'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: '600' }}>#{i+1} {s.name}</span>
                      <span style={{ color: '#059669', fontWeight: 'bold' }}>${s.profitPerMinute}/min</span>
                    </div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '5px' }}>
                      Profit: ${s.profit} | Time: {s.time_minutes}min | Price: ${s.price}
                    </div>
                  </div>
                ))}
              </div>

              {leastProfitable && (
                <div style={{ background: '#fee2e2', padding: '15px', borderRadius: '8px', border: '2px solid #ef4444' }}>
                  <strong>⚠️ Least Profitable:</strong> {leastProfitable.name} at ${leastProfitable.profitPerMinute}/min
                  <br /><span style={{ fontSize: '14px' }}>Consider rethinking this service</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CAPACITY MAPPING */}
      {activeTab === 'capacity' && (
        <div>
          <h2 style={{ marginBottom: '20px' }}>Capacity Mapping</h2>
          <div style={{ display: 'grid', gap: '15px' }}>
            {services.map(service => {
              const capacity = capacityData.find(c => c.service_id === service.id) || {}
              const maxRevenue = service.price * (capacity.max_capacity || 0)
              const actualRevenue = service.price * (capacity.sessions_per_week || 0)
              const utilization = capacity.max_capacity ? ((capacity.sessions_per_week || 0) / capacity.max_capacity * 100).toFixed(0) : 0
              
              let decision = ''
              if (utilization >= 100) decision = '✅ Full Capacity'
              else if (utilization >= 50) decision = '📊 Demanding'
              else decision = '⚠️ Failing'

              return (
                <div key={service.id} style={{ background: '#f9fafb', padding: '20px', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h3 style={{ margin: 0 }}>{service.name}</h3>
                    <span style={{ 
                      padding: '5px 12px', 
                      borderRadius: '20px', 
                      background: utilization >= 100 ? '#d1fae5' : utilization >= 50 ? '#fef3c7' : '#fee2e2',
                      color: utilization >= 100 ? '#065f46' : utilization >= 50 ? '#92400e' : '#991b1b',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}>
                      {decision}
                    </span>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '14px', color: '#6b7280', marginBottom: '5px' }}>Max Capacity (sessions/week)</label>
                      <input 
                        type="number" 
                        value={capacity.max_capacity || ''} 
                        onChange={e => updateCapacity(service.id, 'max_capacity', e.target.value)}
                        style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '14px', color: '#6b7280', marginBottom: '5px' }}>Actual Sessions/Week</label>
                      <input 
                        type="number" 
                        value={capacity.sessions_per_week || ''} 
                        onChange={e => updateCapacity(service.id, 'sessions_per_week', e.target.value)}
                        style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                      />
                    </div>
                  </div>
                  
                  <div style={{ marginTop: '15px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', fontSize: '14px' }}>
                    <div>Max Revenue: <strong>${maxRevenue.toLocaleString()}</strong></div>
                    <div>Actual Revenue: <strong>${actualRevenue.toLocaleString()}</strong></div>
                    <div>Utilization: <strong>{utilization}%</strong></div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* TAB 3: CASH & MARGIN */}
      {activeTab === 'cash' && (
        <div>
          <h2 style={{ marginBottom: '20px' }}>Cash & Margin</h2>
          
          <div style={{ 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
            color: 'white', 
            padding: '20px', 
            borderRadius: '12px',
            marginBottom: '30px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '20px'
          }}>
            <div>
              <div style={{ fontSize: '14px', opacity: 0.9 }}>Total Weekly Revenue</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>${totalWeeklyRevenue.toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: '14px', opacity: 0.9 }}>Total Max Revenue</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>${totalMaxRevenue.toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: '14px', opacity: 0.9 }}>Gap</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>${gap.toLocaleString()} ({gapPercent}%)</div>
            </div>
            <div>
              <div style={{ fontSize: '14px', opacity: 0.9 }}>Performance</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{gapResult}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '15px' }}>
            {cashFlowData.map(service => (
              <div key={service.id} style={{ 
                background: '#f9fafb', 
                padding: '20px', 
                borderRadius: '12px', 
                border: '1px solid #e5e7eb',
                borderLeft: `4px solid ${service.margin >= 70 ? '#22c55e' : service.margin >= 40 ? '#f59e0b' : '#ef4444'}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h3 style={{ margin: 0 }}>{service.name}</h3>
                  <span style={{ 
                    padding: '5px 12px', 
                    borderRadius: '20px', 
                    background: service.margin >= 70 ? '#d1fae5' : service.margin >= 40 ? '#fef3c7' : '#fee2e2',
                    color: service.margin >= 70 ? '#065f46' : service.margin >= 40 ? '#92400e' : '#991b1b',
                    fontWeight: '600'
                  }}>
                    {service.insight} ({service.margin}%)
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', fontSize: '14px' }}>
                  <div>Sessions: <strong>{service.sessions}</strong></div>
                  <div>Revenue: <strong>${service.revenue.toLocaleString()}</strong></div>
                  <div>Cost: <strong>${service.varCost.toLocaleString()}</strong></div>
                  <div>Profit: <strong style={{ color: '#059669' }}>${service.profit.toLocaleString()}</strong></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: GOVERNANCE */}
      {activeTab === 'governance' && (
        <div>
          <h2 style={{ marginBottom: '20px' }}>Governance</h2>
          
          <div style={{ background: '#f9fafb', padding: '20px', borderRadius: '12px', marginBottom: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: '0 0 5px 0' }}>Week {currentWeek}</h3>
                <p style={{ margin: 0, color: '#6b7280' }}>Current reporting period</p>
              </div>
              <button 
                onClick={saveWeek}
                style={{ 
                  padding: '12px 24px', 
                  background: '#3b82f6', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Save Week & Advance
              </button>
            </div>
            
            <div style={{ 
              padding: '15px', 
              background: 'white', 
              borderRadius: '8px',
              border: '2px solid #e5e7eb'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
                <div>
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>Current Value</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>${totalWeeklyRevenue.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>Gap to Max</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>${gap.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>Status</div>
                  <div style={{ 
                    fontSize: '14px', 
                    fontWeight: '600',
                    color: getStatusColor(gapPercent <= 30 ? 'Healthy' : gapPercent <= 60 ? 'Needs Attention' : 'Immediate Action')
                  }}>
                    {gapPercent <= 30 ? '🟢 Healthy Performance' : gapPercent <= 60 ? '🟡 Needs Attention' : '🔴 Immediate Action Required'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>Priority</div>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>
                    {gapPercent <= 30 ? 'Low' : gapPercent <= 60 ? 'Medium' : 'High'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <h3>Weekly History</h3>
          <div style={{ display: 'grid', gap: '10px' }}>
            {governanceHistory.map(record => (
              <div key={record.id} style={{ 
                background: 'white', 
                padding: '15px', 
                borderRadius: '8px', 
                border: '1px solid #e5e7eb',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: '10px',
                alignItems: 'center'
              }}>
                <div><strong>Week {record.week}</strong></div>
                <div>Revenue: ${record.total_weekly_revenue?.toLocaleString()}</div>
                <div>Gap: ${record.gap?.toLocaleString()}</div>
                <div style={{ 
                  color: getStatusColor(record.status),
                  fontWeight: '600'
                }}>
                  {record.status}
                </div>
                <div>
                  <span style={{ 
                    padding: '3px 10px', 
                    borderRadius: '12px', 
                    background: record.priority === 'High' ? '#fee2e2' : record.priority === 'Medium' ? '#fef3c7' : '#d1fae5',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}>
                    {record.priority}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: EXPERIMENTS */}
      {activeTab === 'experiments' && (
        <div>
          <h2 style={{ marginBottom: '20px' }}>Experiment System</h2>
          
          <form onSubmit={addExperiment} style={{ background: '#f9fafb', padding: '20px', borderRadius: '12px', marginBottom: '30px' }}>
            <h3 style={{ margin: '0 0 15px 0' }}>Log New Experiment</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              <select 
                value={newExperiment.target_service} 
                onChange={e => setNewExperiment({...newExperiment, target_service: e.target.value})}
                style={{ padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px' }}
              >
                <option value="">Select Target Service</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input 
                placeholder="Experiment Name" 
                value={newExperiment.experiment} 
                onChange={e => setNewExperiment({...newExperiment, experiment: e.target.value})}
                style={{ padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
              <input 
                placeholder="Hypothesis" 
                value={newExperiment.hypothesis} 
                onChange={e => setNewExperiment({...newExperiment, hypothesis: e.target.value})}
                style={{ padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
              <input 
                placeholder="Change Made" 
                value={newExperiment.change} 
                onChange={e => setNewExperiment({...newExperiment, change: e.target.value})}
                style={{ padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <input 
                  type="date" 
                  value={newExperiment.date} 
                  onChange={e => setNewExperiment({...newExperiment, date: e.target.value})}
                  style={{ padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
                <input 
                  placeholder="Duration (days)" 
                  type="number" 
                  value={newExperiment.duration} 
                  onChange={e => setNewExperiment({...newExperiment, duration: e.target.value})}
                  style={{ padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
                <select 
                  value={newExperiment.result} 
                  onChange={e => setNewExperiment({...newExperiment, result: e.target.value})}
                  style={{ padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                >
                  <option value="">Result</option>
                  <option value="Success">✅ Success</option>
                  <option value="Neutral">⚪ Neutral</option>
                  <option value="Fail">❌ Fail</option>
                </select>
              </div>
            </div>
            <button type="submit" style={{ 
              marginTop: '15px', 
              padding: '10px 24px', 
              background: '#3b82f6', 
              color: 'white', 
              border: 'none', 
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}>
              Save Experiment
            </button>
          </form>

          <h3>Experiment History</h3>
          <div style={{ display: 'grid', gap: '15px' }}>
            {experiments.map(exp => (
              <div key={exp.id} style={{ 
                background: 'white', 
                padding: '20px', 
                borderRadius: '12px', 
                border: '1px solid #e5e7eb',
                borderLeft: `4px solid ${exp.result === 'Success' ? '#22c55e' : exp.result === 'Neutral' ? '#f59e0b' : '#ef4444'}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div>
                    <h4 style={{ margin: '0 0 5px 0' }}>{exp.experiment_name}</h4>
                    <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Target: {exp.services?.name}</p>
                  </div>
                  <span style={{ 
                    padding: '5px 12px', 
                    borderRadius: '20px', 
                    background: exp.result === 'Success' ? '#d1fae5' : exp.result === 'Neutral' ? '#fef3c7' : '#fee2e2',
                    color: exp.result === 'Success' ? '#065f46' : exp.result === 'Neutral' ? '#92400e' : '#991b1b',
                    fontWeight: '600',
                    fontSize: '14px'
                  }}>
                    {exp.result}
                  </span>
                </div>
                <div style={{ fontSize: '14px', color: '#4b5563' }}>
                  <p style={{ margin: '5px 0' }}><strong>Hypothesis:</strong> {exp.hypothesis}</p>
                  <p style={{ margin: '5px 0' }}><strong>Change:</strong> {exp.change_made}</p>
                  <p style={{ margin: '5px 0' }}><strong>Date:</strong> {exp.start_date} | <strong>Duration:</strong> {exp.duration_days} days</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
