import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

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
  const [currentWeek, setCurrentWeek] = useState(1)

  const [newService, setNewService] = useState({ name: '', price: '', cost: '', time: '' })
  const [newExperiment, setNewExperiment] = useState({ target_service: '', experiment: '', hypothesis: '', change: '', date: '', duration: '', result: '' })

  useEffect(() => { fetchAllData() }, [])

  async function fetchAllData() {
    setLoading(true)
    try {
      let { data: clinicData } = await supabase.from('clinics').select('*').maybeSingle()

      if (!clinicData) {
        const { data: newClinic } = await supabase
          .from('clinics')
          .insert([{ name: 'My Clinic', current_week: 1 }])
          .select()
          .single()
        clinicData = newClinic
      }

      if (!clinicData) return

      setClinic(clinicData)
      setCurrentWeek(clinicData.current_week || 1)

      const [
        { data: servicesData },
        { data: capacity },
        { data: history },
        { data: exps }
      ] = await Promise.all([
        supabase.from('services').select('*').eq('clinic_id', clinicData.id),
        supabase.from('capacity_mapping').select('*').eq('clinic_id', clinicData.id),
        supabase.from('governance').select('*').eq('clinic_id', clinicData.id).order('week', { ascending: false }),
        supabase.from('experiments').select('*, services(name)').eq('clinic_id', clinicData.id)
      ])

      setServices(servicesData || [])
      setCapacityData(capacity || [])
      setGovernanceHistory(history || [])
      setExperiments(exps || [])
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  async function addService(e) {
    e.preventDefault()
    if (!clinic) return

    const name = newService.name.trim()
    const price = safeNum(newService.price)
    const cost = safeNum(newService.cost)
    const time = safeNum(newService.time)

    if (!name || price <= 0 || time <= 0) return alert('Fill correctly')

    await supabase.from('services').insert([{
      clinic_id: clinic.id,
      name,
      price,
      cost,
      time_minutes: time
    }])

    setNewService({ name: '', price: '', cost: '', time: '' })
    fetchAllData()
  }

  async function updateCapacity(serviceId, field, value) {
    if (!clinic) return

    await supabase.from('capacity_mapping').upsert([{
      clinic_id: clinic.id,
      service_id: serviceId,
      [field]: safeNum(value)
    }])

    fetchAllData()
  }

  // --- CALCULATIONS ---

  const servicesWithMetrics = services.map(s => {
    const price = safeNum(s.price)
    const cost = safeNum(s.cost)
    const time = safeNum(s.time_minutes, 1)

    const profit = price - cost
    const profitPerMinute = time > 0 ? (profit / time) : 0

    return { ...s, profit, profitPerMinute }
  }).sort((a, b) => b.profitPerMinute - a.profitPerMinute)

  const topService = servicesWithMetrics[0]
  const worstService = servicesWithMetrics[servicesWithMetrics.length - 1]

  const cashFlowData = services.map(service => {
    const cap = capacityData.find(c => c.service_id === service.id) || {}
    const sessions = safeNum(cap.sessions_per_week)
    const price = safeNum(service.price)
    const cost = safeNum(service.cost)

    const revenue = price * sessions
    const varCost = cost * sessions
    const profit = revenue - varCost
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0

    return { ...service, revenue, profit, margin }
  })

  const totalWeeklyRevenue = cashFlowData.reduce((s, x) => s + x.revenue, 0)
  const totalMaxRevenue = capacityData.reduce((s, c) => {
    const service = services.find(x => x.id === c.service_id)
    return s + (service ? safeNum(service.price) * safeNum(c.max_capacity) : 0)
  }, 0)

  const gap = Math.max(0, totalMaxRevenue - totalWeeklyRevenue)
  const gapPercent = totalMaxRevenue > 0 ? (gap / totalMaxRevenue) * 100 : 0

  const overallMargin = totalWeeklyRevenue > 0
    ? (cashFlowData.reduce((s, x) => s + x.profit, 0) / totalWeeklyRevenue) * 100
    : 0

  const underPotentialService = services.map(service => {
    const cap = capacityData.find(c => c.service_id === service.id) || {}
    const price = safeNum(service.price)
    const maxRev = price * safeNum(cap.max_capacity)
    const actualRev = price * safeNum(cap.sessions_per_week)
    return { ...service, gap: maxRev - actualRev, maxRev, actualRev }
  }).sort((a, b) => b.gap - a.gap)[0]

  async function saveWeek() {
    if (!clinic) return

    const status = gapPercent <= 30 ? 'Healthy Performance' : gapPercent <= 60 ? 'Needs Attention' : 'Immediate Action Required'
    const priority = status === 'Healthy Performance' ? 'Low' : status === 'Needs Attention' ? 'Medium' : 'High'

    await supabase.from('governance').insert([{
      clinic_id: clinic.id,
      week: currentWeek,
      total_weekly_revenue: totalWeeklyRevenue,
      total_max_revenue: totalMaxRevenue,
      gap,
      status,
      priority,
      top_service: topService?.name || null,
      worst_service: worstService?.name || null,
      overall_margin: overallMargin
    }])

    await supabase.from('clinics').update({ current_week: currentWeek + 1 }).eq('id', clinic.id)
    setCurrentWeek(prev => prev + 1)
    fetchAllData()
  }

  if (loading) return <div>Loading...</div>

  return (
    <div style={{ padding: 20 }}>
      <h1>Clinic Revenue Arch</h1>

      <button onClick={() => setActiveTab('dashboard')}>Dashboard</button>
      <button onClick={() => setActiveTab('revenue')}>Revenue</button>

      {activeTab === 'dashboard' && (
        <div>
          <h2>Weekly Revenue: ${totalWeeklyRevenue.toFixed(0)}</h2>
          <h3>Gap: {gapPercent.toFixed(1)}%</h3>
          <h3>Top Service: {topService?.name}</h3>
          <h3>Worst Service: {worstService?.name}</h3>
        </div>
      )}

      {activeTab === 'revenue' && (
        <form onSubmit={addService}>
          <input placeholder="Name" value={newService.name} onChange={e => setNewService({ ...newService, name: e.target.value })}/>
          <input placeholder="Price" value={newService.price} onChange={e => setNewService({ ...newService, price: e.target.value })}/>
          <input placeholder="Cost" value={newService.cost} onChange={e => setNewService({ ...newService, cost: e.target.value })}/>
          <input placeholder="Time" value={newService.time} onChange={e => setNewService({ ...newService, time: e.target.value })}/>
          <button>Add</button>
        </form>
      )}
    </div>
  )
}
