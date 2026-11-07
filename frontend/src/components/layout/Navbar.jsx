import { useState } from 'react'
import { Bell, ChevronDown, LogOut, User } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import Badge from '../common/Badge'

const ROLE_LABELS = {
  patient: 'Patient',
  doctor: 'Doctor',
  hospital_admin: 'Hospital Admin',
  lab_staff: 'Lab Staff',
}

export default function Navbar() {
  const { user, logout } = useAuth()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const roleLabel = ROLE_LABELS[user?.role] || user?.role || 'User'

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
      {/* Left side */}
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-gray-800">
          {user?.organization || 'HealthChain'}
        </h1>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        <button className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
          <Bell size={20} />
        </button>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
              {(user?.fullName || user?.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-sm font-medium text-gray-800 leading-tight">
                {user?.fullName || user?.email}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge variant={user?.role === 'patient' ? 'info' : user?.role === 'doctor' ? 'success' : 'warning'} size="xs">
                  {roleLabel}
                </Badge>
              </div>
            </div>
            <ChevronDown size={16} className="text-gray-400" />
          </button>

          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-1 w-56 bg-white rounded-xl shadow-lg border border-gray-100 z-20 py-1">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-800">{user?.fullName}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                  {user?.patientId && (
                    <p className="text-xs text-primary-600 font-mono mt-1">ID: {user.patientId}</p>
                  )}
                </div>
                <button
                  onClick={() => { setDropdownOpen(false); logout() }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-danger-600 hover:bg-danger-50 transition-colors"
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
