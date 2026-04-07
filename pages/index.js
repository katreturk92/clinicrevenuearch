import { useState, useEffect } from "react"
import { createClient } from "@supabase/supabase-js"

// Environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Debug logs
console.log("SUPABASE_URL:", supabaseUrl)
console.log("SUPABASE_KEY:", supabaseKey)

// Hard fail if missing
if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase environment variables")
}

// Create client
const supabase = createClient(supabaseUrl, supabaseKey)

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

      console.log("Clinic data:", clinicData)

      // Fetch services
      const { data: servicesData, error: servicesError } = await supabase
        .from("services")
        .select("*")

      if (servicesError) throw servicesError

      console.log("Services data:", servicesData)

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

  if (error) return <div>Error: {error}</div>

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
