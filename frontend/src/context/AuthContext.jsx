import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { authService } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  // Load user from localStorage / API on mount
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('healthchain_token')
      if (!token) {
        setLoading(false)
        return
      }
      try {
        const res = await authService.me()
        const resData = res.data || {}
        const userData = resData.data || resData.user || resData
        setUser(userData)
      } catch {
        localStorage.removeItem('healthchain_token')
        localStorage.removeItem('healthchain_user')
      } finally {
        setLoading(false)
      }
    }
    initAuth()
  }, [])

  const login = useCallback(async (credentials) => {
    const res = await authService.login(credentials)
    const resData = res.data || {}
    const token = resData.token || resData.data?.token
    const userData = resData.user || resData.data?.user || resData.data || {}

    if (token) localStorage.setItem('healthchain_token', token)
    if (userData) localStorage.setItem('healthchain_user', JSON.stringify(userData))
    setUser(userData)

    // Role-based redirect
    const role = userData.role || 'patient'
    if (role === 'patient') navigate('/patient/dashboard')
    else if (role === 'doctor') navigate('/doctor/dashboard')
    else if (role === 'hospital_admin' || role === 'lab_staff') navigate('/hospital/dashboard')
    else navigate('/explorer')

    toast.success(`Welcome back, ${userData.fullName || userData.full_name || userData.username || 'User'}!`)
    return userData
  }, [navigate])

  const logout = useCallback(async () => {
    try {
      await authService.logout()
    } catch {
      // ignore logout errors
    }
    localStorage.removeItem('healthchain_token')
    localStorage.removeItem('healthchain_user')
    setUser(null)
    navigate('/login')
    toast.success('Logged out successfully')
  }, [navigate])

  const isAuthenticated = Boolean(user)
  const isPatient = () => user?.role === 'patient'
  const isDoctor = () => user?.role === 'doctor'
  const isHospitalAdmin = () => user?.role === 'hospital_admin' || user?.role === 'lab_staff'

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isAuthenticated,
        isPatient,
        isDoctor,
        isHospitalAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
