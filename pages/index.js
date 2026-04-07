import { useState, useEffect } from "react"
import { createClient } from "@supabase/supabase-js"

// Environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Create client only if we have credentials
const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null

// Safe number helper
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
    // Check if Supabase is configured
    if (!supabase) {
      setError("Missing Supabase environment variables. Please check your Vercel environment settings.")
      setLoading(false)
      return
    }
    fetchData()
  }, [])

  async function fetchData() {
    try {
      setLoading(true)

      // Fetch clinics
      const { data: clinicData, error: clinicError } = await supabase
        .from("clinics")
        .select("*")

      if (clinicError) throw clinicError

      // Fetch services
      const { data: servicesData, error: servicesError } = await supabase
        .from("services")
        .select("*")

      if (servicesError) throw servicesError

      setClinic(clinicData?.[0] || null)
      setServices(servicesData || [])

    } catch (err) {
      console.error("Fetch error:", err.message)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div>Loading...</div>

  if (error) return (
    <div style={{ padding: 20, color: 'red' }}>
      <h1>Error</h1>
      <p>{error}</p>
      <p style={{ fontSize: 14, color: '#666' }}>
        Make sure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in Vercel Environment Variables.
      </p>
    </div>
  )

  return (
    <div style={{ padding: 20 }}>
      <h1>Clinic Revenue Architecture</h1>

      <h2>Clinic</h2>
      <pre>{JSON.stringify(clinic, null, 2)}</pre>

      <h2>Services</h2>
      <pre>{JSON.stringify(services, null, 2)}</pre>
    </div>
  )
}
