import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import LoadingSpinner from '../../components/common/LoadingSpinner'

export default function LoginPage() {
  const { login } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }))
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.email || !form.password) {
      setError('Please enter your email and password.')
      return
    }
    setLoading(true)
    try {
      await login({ email: form.email.trim(), password: form.password })
    } catch (err) {
      setError(err?.userMessage || err?.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleQuickLogin = async (email, password) => {
    setForm({ email, password })
    setLoading(true)
    setError('')
    try {
      await login({ email, password })
    } catch (err) {
      setError(err?.userMessage || err?.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-primary-600 rounded-2xl mb-4">
            <Heart size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">HealthChain</h1>
          <p className="text-gray-500 mt-1 text-sm">Secure Medical Document Management</p>
        </div>

        {/* Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-800">Sign In</h2>
            <p className="text-xs text-gray-500 mt-0.5">Access your medical records securely</p>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-danger-50 border border-danger-200 rounded-lg text-sm text-danger-700">
                  <AlertCircle size={15} className="flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="label">Email Address or Username</label>
                <input
                  type="text"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  className="input"
                  placeholder="you@hospital.com or username"
                  autoComplete="username"
                  required
                />
              </div>

              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    className="input pr-10"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full btn-lg"
              >
                {loading ? <LoadingSpinner size="sm" /> : 'Sign In'}
              </button>
            </form>

            {/* Quick Demo Logins */}
            <div className="mt-5 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2 text-center uppercase tracking-wider">
                Quick Demo Accounts (SQLite Seeded)
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleQuickLogin('alice@hospitala.example.com', 'Patient@123')}
                  className="px-2 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold text-center transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  👤 Patient
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleQuickLogin('bob@hospitala.example.com', 'Doctor@123')}
                  className="px-2 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-semibold text-center transition flex items-center justify-center gap-1 cursor-pointer shadow-sm ring-1 ring-purple-300"
                >
                  🩺 Doctor
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleQuickLogin('carol@hospitala.example.com', 'Admin@123')}
                  className="px-2 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-xs font-semibold text-center transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  🏥 Admin
                </button>
              </div>
            </div>

            <div className="mt-4 text-center text-sm text-gray-500">
              Don't have an account?{' '}
              <Link to="/register" className="text-primary-600 font-medium hover:underline">
                Register here
              </Link>
            </div>
          </div>
        </div>

        {/* Demo Hint */}
        <div className="mt-4 p-3 bg-primary-50 rounded-xl border border-primary-100 text-xs text-primary-700 text-center">
          🔒 Powered by Hyperledger Fabric — All records are immutable and cryptographically verified.
        </div>
      </div>
    </div>
  )
}
