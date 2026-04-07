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

const safeInt = (val, fallback = 0) => {
  const n = parseInt(val)
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

  useEffect(() => {
    fetchAllData()
  }, [])

  async function fetchAllData() {
    setLoading(true)
    try {
      let { data: clinicData } = await supabase.from('clinics').select('*').single()

      if (!clinicData) {
        const { data: newClinic } = await supabase
          .from('clinics')
          .insert([{ name: 'My Clinic', current_week: 1 }])
          .select()
          .single()
        clinicData = newClinic
      }

      if (!clinicData) { setLoading(false); return }

      setClinic(clinicData)
      setCurrentWeek(clinicData.current_week || 1)

      const [{ data: servicesData }, { data: capacity }, { data: history }, { data: exps }] = await Promise.all([
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
      console.error('fetchAllData error:', err)
    }
    setLoading(false)
