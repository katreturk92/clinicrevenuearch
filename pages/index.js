import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function Dashboard() {
  const [clinic, setClinic] = useState(null)
  const [services, setServices] = useState([])
  const [weeklyData, setWeeklyData] = useState([])
  const [currentWeek, setCurrentWeek] = useState(1)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalRevenue: 0, totalMaxRevenue: 0, gap: 0, gapPercentage: 0,
    totalProfit: 0, overallMargin: 0, status: 'Healthy Performance',
    topRevenueDriver: null, highestMarginService: null, lowestMarginService: null
  })

  useEffect(() => { fetchDashboardData() }, [])

  async function fetchDashboardData() {
    try {
      const { data: clinicData } = await supabase.from('clinics').select('*').single()
      if (clinicData) {
        setClinic(clinicData)
        setCurrentWeek(clinicData.current_week || 1)
        const { data: servicesData } = await supabase.from('services').select('*').eq('clinic_id', clinicData.id)
        setServices(servicesData || [])
        const { data: weekData } = await supabase.from('weekly_data').select('*').eq('clinic_id', clinicData.id).eq('week_number', clinicData.current_week || 1)
        setWeeklyData(weekData || [])
        calculateStats(weekData || [], servicesData || [])
      }
    } catch (error) { console.error('Error:', error) }
    finally { setLoading(false) }
  }

  function calculateStats(weekData, servicesData) {
    let totalRevenue = 0, totalMaxRevenue = 0, totalProfit = 0
    weekData.forEach(data => {
      totalRevenue += Number(data.weekly_revenue) || 0
      totalMaxRevenue += Number(data.max_revenue) || 0
      totalProfit += Number(data.weekly_profit) || 0
    })
    const gap = totalMaxRevenue - totalRevenue
    const gapPercentage = totalMaxRevenue > 0 ? (gap / totalMaxRevenue) * 100 : 0
    const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
    let status = 'Healthy Performance'
    if (gapPercentage > 60) status = 'Immediate Action Required'
    else if (gapPercentage > 30) status = 'Needs Attention'
    
    let topRevenueDriver = null, highestMarginService = null, lowestMarginService = null
    if (weekData.length > 0 && servicesData.length > 0) {
      let maxRevenue = 0, maxMargin = -Infinity, minMargin = Infinity
      weekData.forEach(data => {
        const service = servicesData.find(s => s.id === data.service_id)
        if (!service) return
        const revenue = Number(data.weekly_revenue) || 0
        if (revenue > maxRevenue) { maxRevenue = revenue; topRevenueDriver = service.name }
        const margin = Number(data.margin_percentage) || 0
        if (margin > maxMargin) { maxMargin = margin; highestMarginService = service.name }
        if (margin < minMargin) { minMargin = margin; lowestMarginService = service.name }
      })
    }
    setStats({ totalRevenue, totalMaxRevenue, gap, gapPercentage: gapPercentage.toFixed(1),
      totalProfit, overallMargin: overallMargin.toFixed(1), status,
      topRevenueDriver, highestMarginService, lowestMarginService })
  }

  function getStatusColor(status) {
    if (status === 'Healthy Performance') return '#22c55e'
    if (status === 'Needs Attention') return '#f59e0b'
    return '#ef4444'
  }

  if (loading) return <div style={{padding: 40, textAlign: 'center'}}>Loading...</div>

  return (
    <div style={{maxWidth: 480, margin: '0 auto', padding: 20, fontFamily: 'system-ui', backgroundColor: '#f8fafc', minHeight: '100vh'}}>
      <div style={{marginBottom: 24}}>
        <h1 style={{fontSize: 24, fontWeight: 700, margin: '0 0 4px 0', color: '#1e293b'}}>Clinic Revenue Arch</h1>
        <p style={{margin: 0, color: '#64748b', fontSize: 14}}>Week {currentWeek} Overview</p>
      </div>

      <div style={{background: 'white', padding: 20, borderRadius: 12, marginBottom: 16, borderLeft: `4px solid ${getStatusColor(stats.status)}`, boxShadow: '0 1px 3px rgba(0,0,0,0.1)'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
          <span style={{fontSize: 14, color: '#64748b', fontWeight: 500}}>Current Status</span>
          <span style={{background: getStatusColor(stats.status), color: 'white', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600}}>{stats.status}</span>
        </div>
        <div style={{fontSize: 32, fontWeight: 700, color: '#1e293b'}}>${stats.gap.toLocaleString()}</div>
        <div style={{color: '#64748b', fontSize: 14}}>under potential ({stats.gapPercentage}%)</div>
      </div>

      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16}}>
        <div style={{background: 'white', padding: 16, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)'}}>
          <div style={{fontSize: 12, color: '#64748b', marginBottom: 4}}>Weekly Revenue</div>
          <div style={{fontSize: 20, fontWeight: 700, color: '#1e293b'}}>${stats.totalRevenue.toLocaleString()}</div>
        </div>
        <div style={{background: 'white', padding: 16, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)'}}>
          <div style={{fontSize: 12, color: '#64748b', marginBottom: 4}}>Max Potential</div>
          <div style={{fontSize: 20, fontWeight: 700, color: '#1e293b'}}>${stats.totalMaxRevenue.toLocaleString()}</div>
        </div>
        <div style={{background: 'white', padding: 16, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)'}}>
          <div style={{fontSize: 12, color: '#64748b', marginBottom: 4}}>Total Profit</div>
          <div style={{fontSize: 20, fontWeight: 700, color: '#22c55e'}}>${stats.totalProfit.toLocaleString()}</div>
        </div>
        <div style={{background: 'white', padding: 16, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)'}}>
          <div style={{fontSize: 12, color: '#64748b', marginBottom: 4}}>Overall Margin</div>
          <div style={{fontSize: 20, fontWeight: 700, color: '#1e293b'}}>{stats.overallMargin}%</div>
        </div>
      </div>

      {stats.topRevenueDriver && (
        <div style={{background: 'white', padding: 20, borderRadius: 12, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.1)'}}>
          <h3 style={{margin: '0 0 16px 0', fontSize: 16, fontWeight: 600, color: '#1e293b'}}>📊 Key Insights</h3>
          <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f1f5f9'}}>
              <span style={{color: '#64748b', fontSize: 14}}>Top Revenue Driver</span>
              <span style={{fontWeight: 600, color: '#1e293b', fontSize: 14}}>{stats.topRevenueDriver}</span>
            </div>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f1f5f9'}}>
              <span style={{color: '#64748b', fontSize: 14}}>Highest Margin</span>
              <span style={{fontWeight: 600, color: '#22c55e', fontSize: 14}}>{stats.highestMarginService}</span>
            </div>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0'}}>
              <span style={{color: '#64748b', fontSize: 14}}>⚠️ Needs Attention</span>
              <span style={{fontWeight: 600, color: '#ef4444', fontSize: 14}}>{stats.lowestMarginService}</span>
            </div>
          </div>
        </div>
      )}

      <div style={{background: 'white', padding: 20, borderRadius: 12, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.1)'}}>
        <h3 style={{margin: '0 0 16px 0', fontSize: 16, fontWeight: 600, color: '#1e293b'}}>Your Services ({services.length})</h3>
        {services.length === 0 ? (
          <div style={{textAlign: 'center', padding: 20, color: '#64748b'}}><p>No services added yet</p></div>
        ) : (
          <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
            {services.slice(0, 3).map(service => (
              <div key={service.id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#f8fafc', borderRadius: 8}}>
                <span style={{fontSize: 14, fontWeight: 500, color: '#1e293b'}}>{service.name}</span>
                <span style={{fontSize: 14, fontWeight: 600, color: '#22c55e'}}>${service.price}</span>
              </div>
            ))}
            {services.length > 3 && <span style={{fontSize: 12, color: '#64748b', textAlign: 'center'}}>+{services.length - 3} more services</span>}
          </div>
        )}
      </div>
      {weeklyData.length > 0 && (
        <div style={{background: 'white', padding: 20, borderRadius: 12, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.1)'}}>
          <h3 style={{margin: '0 0 16px 0', fontSize: 16, fontWeight: 600, color: '#1e293b'}}>This Week's Performance</h3>
          <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
            {weeklyData.map(data => {
              const service = services.find(s => s.id === data.service_id)
              const percentage = data.max_capacity > 0 ? (data.sessions_done / data.max_capacity) * 100 : 0
              const isFull = data.sessions_done >= data.max_capacity
              const isDemanding = data.sessions_done >= data.max_capacity * 0.5
              return (
                <div key={data.id}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                    <span style={{fontSize: 14, fontWeight: 500, color: '#1e293b'}}>{service?.name || 'Unknown'}</span>
                    <span style={{padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, color: 'white', backgroundColor: isFull ? '#22c55e' : isDemanding ? '#f59e0b' : '#ef4444'}}>
                      {isFull ? 'Full' : isDemanding ? 'Demanding' : 'Failing'}
                    </span>
                  </div>
                  <div style={{height: 8, backgroundColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden', marginBottom: 4}}>
                    <div style={{height: '100%', width: `${Math.min(percentage, 100)}%`, backgroundColor: isDemanding ? '#22c55e' : '#ef4444', borderRadius: 4}} />
                  </div>
                  <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b'}}>
                    <span>{data.sessions_done} / {data.max_capacity} sessions</span>
                    <span>${data.weekly_revenue?.toLocaleString() || 0}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
        
      <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
        <Link href="/services" style={{width: '100%'}}>
          <button style={{width: '100%', padding: 16, background: '#0070f3', color: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: 'pointer'}}>
            {services.length === 0 ? 'Add Your First Service' : 'Manage Services'}
          </button>
        </Link>
        {services.length > 0 && (
          <Link href="/weekly-checkin" style={{width: '100%'}}>
            <button style={{width: '100%', padding: 16, background: '#22c55e', color: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: 'pointer'}}>Weekly Check-in</button>
          </Link>
        )}
        <div style={{display: 'flex', gap: 8}}>
          <Link href="/history" style={{flex: 1}}>
            <button style={{width: '100%', padding: 12, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, cursor: 'pointer', color: '#64748b'}}>History</button>
          </Link>
          <Link href="/experiments" style={{flex: 1}}>
            <button style={{width: '100%', padding: 12, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, cursor: 'pointer', color: '#64748b'}}>Tests</button>
          </Link>
          <Link href="/insights" style={{flex: 1}}>
            <button style={{width: '100%', padding: 12, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, cursor: 'pointer', color: '#64748b'}}>Insights</button>
          </Link>
        </div>
      </div>
    </div>
  )
}
