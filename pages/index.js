import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function Dashboard() {
  const [clinic, setClinic] = useState(null)
  const [services, setServices] = useState([])
  const [currentWeek, setCurrentWeek] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    // Get clinic data
    const { data: clinicData } = await supabase
      .from('clinics')
      .select('*')
      .single()
    
    if (clinicData) {
      setClinic(clinicData)
      setCurrentWeek(clinicData.current_week || 1)
      
      // Get services
      const { data: servicesData } = await supabase
        .from('services')
        .select('*')
        .eq('clinic_id', clinicData.id)
      
      setServices(servicesData || [])
    }
    setLoading(false)
  }

  if (loading) return <div>Loading...</div>

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Clinic Revenue Arch</h1>
      <p>Welcome to your dashboard</p>
      
      <div style={{ marginTop: '30px' }}>
        <h2>Current Week: {currentWeek}</h2>
        <p>Services: {services.length}</p>
      </div>

      <div style={{ marginTop: '30px' }}>
        <a href="/services" style={{ 
          display: 'inline-block', 
          padding: '10px 20px', 
          background: '#0070f3', 
          color: 'white', 
          textDecoration: 'none',
          borderRadius: '5px'
        }}>
          Manage Services
        </a>
      </div>
    </div>
  )
}
