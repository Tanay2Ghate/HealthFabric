import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FileText, ClipboardList, Users, TrendingUp } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { accessService, reviewService } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import Badge from '../../components/common/Badge'
import { format } from 'date-fns'

function StatCard({ icon: Icon, label, value, color, loading }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        {loading ? (
          <div className="h-7 w-12 bg-gray-200 animate-pulse rounded mt-1" />
        ) : (
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{value ?? '—'}</p>
        )}
      </div>
    </div>
  )
}

export default function DoctorDashboard() {
  const { user } = useAuth()

  const { data: accessibleData, isLoading: accessLoading } = useQuery({
    queryKey: ['accessible-docs'],
    queryFn: () => accessService.listAccessible(),
  })

  const { data: reviewsData, isLoading: reviewsLoading } = useQuery({
    queryKey: ['my-reviews'],
    queryFn: () => reviewService.listMine(),
  })

  const accessible = Array.isArray(accessibleData?.data?.data)
    ? accessibleData.data.data
    : Array.isArray(accessibleData?.data)
    ? accessibleData.data
    : []
  const reviews = Array.isArray(reviewsData?.data?.data)
    ? reviewsData.data.data
    : Array.isArray(reviewsData?.data)
    ? reviewsData.data
    : []
  const recentReviews = Array.isArray(reviews) ? reviews.slice(0, 5) : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome, {user?.fullName?.split(' ')[0] || 'Doctor'}!
        </h1>
        <p className="text-sm text-gray-500 mt-1">{user?.organization}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={FileText}
          label="Docs Accessible"
          value={accessible.length}
          color="bg-primary-600"
          loading={accessLoading}
        />
        <StatCard
          icon={ClipboardList}
          label="Reviews Written"
          value={reviews.length}
          color="bg-success-600"
          loading={reviewsLoading}
        />
        <StatCard
          icon={TrendingUp}
          label="This Month"
          value={reviews.filter((r) => {
            const dateStr = r.created_at || r.createdAt
            if (!dateStr) return false
            const d = new Date(dateStr)
            const now = new Date()
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
          }).length}
          color="bg-purple-600"
          loading={reviewsLoading}
        />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          to="/doctor/patients"
          className="card p-5 hover:shadow-card-hover transition-shadow flex items-center gap-4"
        >
          <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center">
            <FileText size={22} className="text-primary-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-800">Patient Documents</p>
            <p className="text-sm text-gray-500 mt-0.5">
              {accessible.length} document{accessible.length !== 1 ? 's' : ''} accessible
            </p>
          </div>
        </Link>

        <Link
          to="/doctor/reviews"
          className="card p-5 hover:shadow-card-hover transition-shadow flex items-center gap-4"
        >
          <div className="w-12 h-12 bg-success-50 rounded-xl flex items-center justify-center">
            <ClipboardList size={22} className="text-success-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-800">My Reviews</p>
            <p className="text-sm text-gray-500 mt-0.5">{reviews.length} reviews submitted</p>
          </div>
        </Link>
      </div>

      {/* Recent Reviews */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Recent Reviews</h2>
          <Link to="/doctor/reviews" className="text-sm text-primary-600 hover:underline font-medium">
            View All
          </Link>
        </div>
        {reviewsLoading ? (
          <div className="p-8 flex justify-center"><LoadingSpinner /></div>
        ) : recentReviews.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <ClipboardList size={36} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No reviews yet. Start by viewing patient documents.</p>
          </div>
        ) : (
          <div className="table-container border-0 rounded-none">
            <table className="table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Patient</th>
                  <th>Diagnosis</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentReviews.map((r) => (
                  <tr key={r._id || r.id}>
                    <td className="font-medium text-gray-800 max-w-[160px] truncate">
                      {r.documentName || r.documentId}
                    </td>
                    <td>{r.patientName || r.patientId || '—'}</td>
                    <td className="max-w-[200px] truncate text-gray-600">{r.diagnosisSummary || '—'}</td>
                    <td className="text-gray-600">
                      {r.createdAt ? format(new Date(r.createdAt), 'PP') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
