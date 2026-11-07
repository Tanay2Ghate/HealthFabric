import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  Shield,
  CheckCircle,
  History,
  Users,
  ClipboardList,
  BookOpen,
  FolderOpen,
  Key,
  Search,
  Activity,
  Heart,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

function NavItem({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `sidebar-link ${isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'}`
      }
    >
      <Icon size={18} />
      <span>{label}</span>
    </NavLink>
  )
}

function NavSection({ title, children }) {
  return (
    <div className="mb-4">
      <p className="px-4 mb-1 text-xs font-semibold text-gray-400 uppercase tracking-widest">
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

export default function Sidebar() {
  const { isPatient, isDoctor, isHospitalAdmin } = useAuth()

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-100">
        <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center">
          <Heart size={20} className="text-white" />
        </div>
        <div>
          <span className="text-lg font-bold text-gray-900">HealthChain</span>
          <p className="text-xs text-gray-500 leading-none">Medical Records</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
        {/* Patient Navigation */}
        {isPatient() && (
          <>
            <NavSection title="My Health">
              <NavItem to="/patient/dashboard" icon={LayoutDashboard} label="Dashboard" />
              <NavItem to="/patient/documents" icon={FileText} label="My Documents" />
              <NavItem to="/patient/access" icon={Key} label="Access Management" />
            </NavSection>
          </>
        )}

        {/* Doctor Navigation */}
        {isDoctor() && (
          <>
            <NavSection title="Clinical">
              <NavItem to="/doctor/dashboard" icon={LayoutDashboard} label="Dashboard" />
              <NavItem to="/doctor/patients" icon={FolderOpen} label="Patient Documents" />
              <NavItem to="/doctor/reviews" icon={ClipboardList} label="My Reviews" />
            </NavSection>
          </>
        )}

        {/* Hospital Admin Navigation */}
        {isHospitalAdmin() && (
          <>
            <NavSection title="Administration">
              <NavItem to="/hospital/dashboard" icon={LayoutDashboard} label="Dashboard" />
              <NavItem to="/hospital/documents" icon={FileText} label="Document Management" />
              <NavItem to="/hospital/access" icon={Shield} label="Access Requests" />
            </NavSection>
          </>
        )}

        {/* Shared */}
        <NavSection title="Blockchain">
          <NavItem to="/explorer" icon={Search} label="Blockchain Explorer" />
        </NavSection>
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-100">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-primary-50">
          <Activity size={14} className="text-primary-600" />
          <span className="text-xs font-medium text-primary-700">Hyperledger Fabric</span>
        </div>
      </div>
    </aside>
  )
}
