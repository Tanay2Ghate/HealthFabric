import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  FileText, Shield, ClipboardList, Activity,
  Upload, Key, Clock, TrendingUp,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { documentService, accessService } from '../../services/api'
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

export default function PatientDashboard() {
  const { user } = useAuth()

  const { data: docsData, isLoading: docsLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => documentService.list(),
  })

  const { data: accessData, isLoading: accessLoading } = useQuery({
    queryKey: ['my-permissions'],
    queryFn: () => accessService.listMyPermissions(),
  })

  const documents = Array.isArray(docsData?.data?.data)
    ? docsData.data.data
    : Array.isArray(docsData?.data)
    ? docsData.data
    : []
  const permissions = Array.isArray(accessData?.data?.data)
    ? accessData.data.data
    : Array.isArray(accessData?.data)
    ? accessData.data
    : []
  const recentDocs = [...documents].slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome, {user?.fullName?.split(' ')[0] || 'Patient'}!
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {user?.patientId && (
            <span className="font-mono text-primary-600">ID: {user.patientId} · </span>
          )}
          {user?.organization}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={FileText}
          label="Total Documents"
          value={documents.length}
          color="bg-primary-600"
          loading={docsLoading}
        />
        <StatCard
          icon={Shield}
          label="Active Permissions"
          value={permissions.filter((p) => p.status === 'ACTIVE').length}
          color="bg-success-600"
          loading={accessLoading}
        />
        <StatCard
          icon={ClipboardList}
          label="Pending Reviews"
          value={documents.filter((d) => d.status === 'PENDING').length}
          color="bg-warning-600"
          loading={docsLoading}
        />
        <StatCard
          icon={TrendingUp}
          label="Verified Docs"
          value={documents.filter((d) => d.status === 'VERIFIED').length}
          color="bg-purple-600"
          loading={docsLoading}
        />
      </div>

      {/* Quick Actions */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-gray-800">Quick Actions</h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link
              to="/patient/documents"
              className="flex items-center gap-3 p-4 rounded-xl bg-primary-50 hover:bg-primary-100 border border-primary-100 transition-colors"
            >
              <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
                <Upload size={18} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-primary-800">Upload Document</p>
                <p className="text-xs text-primary-600">Add medical records</p>
              </div>
            </Link>

            <Link
              to="/patient/access"
              className="flex items-center gap-3 p-4 rounded-xl bg-success-50 hover:bg-success-100 border border-success-100 transition-colors"
            >
              <div className="w-10 h-10 bg-success-600 rounded-xl flex items-center justify-center">
                <Key size={18} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-success-800">Grant Access</p>
                <p className="text-xs text-success-600">Share with doctors</p>
              </div>
            </Link>

            <Link
              to="/explorer"
              className="flex items-center gap-3 p-4 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-100 transition-colors"
            >
              <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center">
                <Activity size={18} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-purple-800">View History</p>
                <p className="text-xs text-purple-600">Blockchain audit trail</p>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Documents */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Recent Documents</h2>
          <Link to="/patient/documents" className="text-sm text-primary-600 hover:underline font-medium">
            View All
          </Link>
        </div>
        <div className="overflow-x-auto">
          {docsLoading ? (
            <div className="p-8 flex justify-center">
              <LoadingSpinner />
            </div>
          ) : recentDocs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <FileText size={36} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No documents yet. Upload your first medical record.</p>
              <Link to="/patient/documents" className="btn btn-primary btn-sm mt-3 inline-flex">
                Upload Document
              </Link>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Type</th>
                  <th>Uploaded</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentDocs.map((doc) => (
                  <tr key={doc._id || doc.id}>
                    <td className="font-medium text-gray-800">{doc.fileName || doc.name}</td>
                    <td className="capitalize">{(doc.documentType || 'general').replace('_', ' ')}</td>
                    <td>{doc.uploadedAt ? format(new Date(doc.uploadedAt), 'PP') : '—'}</td>
                    <td>
                      <Badge status={doc.status || 'REGISTERED'}>
                        {doc.status || 'REGISTERED'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
