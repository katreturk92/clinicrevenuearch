import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
console.log("URL:", process.env.NEXT_PUBLIC_SUPABASE_URL)
console.log("KEY:", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const safeNum = (val, fallback = 0) => {
  const n = parseFloat(val)
  return isNaN(n) ? fallback : n
}

export default function ClinicRevenueArch() {
  const [loading, setLoading] = useState(true)
  const [clinic, setClinic] = useState(null)
  const [services, setServices] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      setLoading(true)

      // Fetch clinic (no .single())
      const { data: clinicArray, error: clinicError } = await supabase
        .from('clinics')
        .select('*')

      if (clinicError) {
        throw clinicError
      }

      let clinicData = clinicArray?.[0]

      // Create clinic if none exists
      if (!clinicData) {
        const { data: newClinic, error: createError } = await supabase
          .from('clinics')
          .insert([{ name: 'My Clinic', current_week: 1 }])
          .select()

        if (createError) {
          throw createError
        }

        clinicData = newClinic?.[0]
      }

      setClinic(clinicData)

      // Fetch services
      const { data: servicesData, error: servicesError } = await supabase
        .from('services')
        .select('*')
        .eq('clinic_id', clinicData.id)

      if (servicesError) {
        throw servicesError
      }

      setServices(servicesData || [])

    } catch (err) {
      console.error('App error:', err)
      setError(err.message || 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40 }}>
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 40, color: 'red' }}>
        Error: {error}
      </div>
    )
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Clinic Revenue Arch</h1>

      <p><strong>Clinic:</strong> {clinic?.name}</p>

      <h2>Services</h2>

      {services.length === 0 ? (
        <p>No services yet</p>
      ) : (
        services.map(service => (
          <div key={service.id}>
            {service.name} - ${safeNum(service.price)}
          </div>
        ))
      )}
    </div>
  )
}
