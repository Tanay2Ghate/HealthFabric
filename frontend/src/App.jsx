import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/common/ProtectedRoute'
import Layout from './components/layout/Layout'

// Auth Pages
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'

// Patient Pages
import PatientDashboard from './pages/patient/PatientDashboard'
import MyDocuments from './pages/patient/MyDocuments'
import AccessManagement from './pages/patient/AccessManagement'

// Doctor Pages
import DoctorDashboard from './pages/doctor/DoctorDashboard'
import PatientDocuments from './pages/doctor/PatientDocuments'
import MyReviews from './pages/doctor/MyReviews'

// Hospital Pages
import HospitalDashboard from './pages/hospital/HospitalDashboard'
import DocumentManagement from './pages/hospital/DocumentManagement'
import AccessRequests from './pages/hospital/AccessRequests'

// Explorer
import BlockchainExplorer from './pages/explorer/BlockchainExplorer'

// 404
import NotFoundPage from './pages/NotFoundPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected Routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              {/* Patient */}
              <Route path="/patient" element={<Navigate to="/patient/dashboard" replace />} />
              <Route path="/patient/dashboard" element={<PatientDashboard />} />
              <Route path="/patient/documents" element={<MyDocuments />} />
              <Route path="/patient/access" element={<AccessManagement />} />

              {/* Doctor */}
              <Route path="/doctor" element={<Navigate to="/doctor/dashboard" replace />} />
              <Route path="/doctor/dashboard" element={<DoctorDashboard />} />
              <Route path="/doctor/patients" element={<PatientDocuments />} />
              <Route path="/doctor/reviews" element={<MyReviews />} />

              {/* Hospital */}
              <Route path="/hospital" element={<Navigate to="/hospital/dashboard" replace />} />
              <Route path="/hospital/dashboard" element={<HospitalDashboard />} />
              <Route path="/hospital/documents" element={<DocumentManagement />} />
              <Route path="/hospital/access" element={<AccessRequests />} />

              {/* Blockchain Explorer */}
              <Route path="/explorer" element={<BlockchainExplorer />} />
            </Route>
          </Route>

          {/* 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
