import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { authService } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import toast from 'react-hot-toast'

const ROLES = [
  { value: 'patient',        label: 'Patient',        desc: 'Manage your personal health records' },
  { value: 'doctor',         label: 'Doctor',         desc: 'Review and annotate patient documents' },
  { value: 'hospital_admin', label: 'Hospital Admin', desc: 'Manage hospital documents and access' },
  { value: 'lab_staff',      label: 'Lab Staff',      desc: 'Upload and manage lab reports' },
]

const ORGS = [
  { value: 'hospitala', label: 'Hospital A (Primary Hospital)' },
  { value: 'hospitalb', label: 'Hospital B (Partner Hospital)' },
  { value: 'diaglab', label: 'Diagnostic Laboratory' },
]

function PasswordStrength({ password }) {
  if (!password) return null
  const checks = [
    { label: 'At least 8 characters', pass: password.length >= 8 },
    { label: 'Contains uppercase', pass: /[A-Z]/.test(password) },
    { label: 'Contains number', pass: /\d/.test(password) },
    { label: 'Contains special char', pass: /[^A-Za-z0-9]/.test(password) },
  ]
  const score = checks.filter((c) => c.pass).length
  const colors = ['bg-danger-500', 'bg-warning-500', 'bg-warning-400', 'bg-success-400', 'bg-success-600']

  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < score ? colors[score] : 'bg-gray-200'}`} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-1 text-xs">
            {c.pass ? (
              <CheckCircle size={10} className="text-success-500" />
            ) : (
              <div className="w-2.5 h-2.5 rounded-full border border-gray-300" />
            )}
            <span className={c.pass ? 'text-success-600' : 'text-gray-500'}>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function RegisterPage() {
  const { login } = useAuth()
  const [form, setForm] = useState({
    fullName: '', email: '', password: '', confirmPassword: '',
    role: '', organization: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }))
    setError('')
  }

  const validate = () => {
    if (!form.fullName.trim()) return 'Full name is required.'
    if (!form.email.trim()) return 'Email is required.'
    if (!form.password) return 'Password is required.'
    if (form.password.length < 8) return 'Password must be at least 8 characters.'
    if (form.password !== form.confirmPassword) return 'Passwords do not match.'
    if (!form.role) return 'Please select a role.'
    if (!form.organization) return 'Please select an organization.'
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const validationError = validate()
    if (validationError) { setError(validationError); return }

    setLoading(true)
    try {
      await authService.register({
        fullName: form.fullName,
        full_name: form.fullName,
        email: form.email,
        password: form.password,
        role: form.role,
        organization: form.organization,
      })
      toast.success('Account created! Signing you in…')
      await login({ email: form.email, password: form.password })
    } catch (err) {
      const msg = err.response?.data?.error || err.userMessage || err.message || 'Registration failed. Please try again.'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-primary-600 rounded-2xl mb-4">
            <Heart size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Create Account</h1>
          <p className="text-gray-500 mt-1 text-sm">Join HealthChain — Blockchain-secured medical records</p>
        </div>

        <div className="card">
          <div className="card-body">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-danger-50 border border-danger-200 rounded-lg text-sm text-danger-700">
                  <AlertCircle size={15} className="flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4">
                {/* Full Name */}
                <div>
                  <label className="label">Full Name</label>
                  <input
                    type="text"
                    name="fullName"
                    value={form.fullName}
                    onChange={handleChange}
                    className="input"
                    placeholder="Dr. Jane Smith"
                    required
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="label">Email Address</label>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    className="input"
                    placeholder="you@hospital.com"
                    required
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="label">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={form.password}
                      onChange={handleChange}
                      className="input pr-10"
                      placeholder="Create a strong password"
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
                  <PasswordStrength password={form.password} />
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="label">Confirm Password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    value={form.confirmPassword}
                    onChange={handleChange}
                    className="input"
                    placeholder="Repeat your password"
                    required
                  />
                </div>

                {/* Role */}
                <div>
                  <label className="label">Role</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLES.map((r) => (
                      <label
                        key={r.value}
                        className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                          form.role === r.value
                            ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-400'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="role"
                          value={r.value}
                          checked={form.role === r.value}
                          onChange={handleChange}
                          className="mt-0.5 text-primary-600"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-800">{r.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{r.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Organization */}
                <div>
                  <label className="label">Organization</label>
                  <select
                    name="organization"
                    value={form.organization}
                    onChange={handleChange}
                    className="input"
                    required
                  >
                    <option value="">Select your organization…</option>
                    {ORGS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full btn-lg mt-2"
              >
                {loading ? <LoadingSpinner size="sm" /> : 'Create Account'}
              </button>
            </form>

            <div className="mt-4 text-center text-sm text-gray-500">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-600 font-medium hover:underline">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
