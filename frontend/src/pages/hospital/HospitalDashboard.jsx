import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2,
  FileText,
  Shield,
  Users,
  Upload,
  Search,
  CheckCircle,
  Activity,
  ArrowUpRight
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { documentService, explorerService } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import Badge from '../../components/common/Badge'

export default function HospitalDashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [recentDocs, setRecentDocs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const [statsRes, docsRes] = await Promise.all([
          explorerService.getNetworkStatus(),
          documentService.list({ limit: 5 })
        ])
        setStats(statsRes.data?.data)
        setRecentDocs(docsRes.data?.data || [])
      } catch (err) {
        console.error('Failed to load dashboard data', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="bg-gradient-to-r from-primary-700 to-primary-900 rounded-2xl p-6 text-white shadow-md">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 text-primary-200 text-xs font-semibold uppercase tracking-wider">
              <Building2 size={16} />
              <span>{user?.organization?.toUpperCase()} Administration Node</span>
            </div>
            <h1 className="text-2xl font-bold mt-1">Hospital Control Center</h1>
            <p className="text-primary-100 text-sm mt-0.5">
              Secure off-chain AES-256 encrypted storage with Hyperledger Fabric ledger anchoring
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              to="/hospital/documents"
              className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-xs font-semibold backdrop-blur transition flex items-center gap-1.5"
            >
              <Upload size={14} />
              Register Report
            </Link>
            <Link
              to="/explorer"
              className="bg-white text-primary-800 hover:bg-primary-50 px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
            >
              <Search size={14} />
              Blockchain Explorer
            </Link>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">Documents</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats?.totalDocuments ?? 0}</p>
            </div>
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
              <FileText size={20} />
            </div>
          </div>
          <span className="text-xs text-green-600 font-medium mt-3 inline-block">SHA-256 Ledgers Verified</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">Active Grants</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats?.activePermissions ?? 0}</p>
            </div>
            <div className="p-2.5 bg-green-50 text-green-600 rounded-lg">
              <Shield size={20} />
            </div>
          </div>
          <span className="text-xs text-gray-500 font-medium mt-3 inline-block">Enforced by Smart Contract</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">Doctor Reviews</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats?.totalReviews ?? 0}</p>
            </div>
            <div className="p-2.5 bg-purple-50 text-purple-600 rounded-lg">
              <Users size={20} />
            </div>
          </div>
          <span className="text-xs text-purple-600 font-medium mt-3 inline-block">Digitally Signed</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">On-Chain Txns</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats?.blockchainTransactions ?? 0}</p>
            </div>
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-lg">
              <Activity size={20} />
            </div>
          </div>
          <span className="text-xs text-amber-600 font-medium mt-3 inline-block">
            {stats?.fabricMockMode ? 'Dev Mock Mode Active' : 'Fabric Channel Active'}
          </span>
        </div>
      </div>

      {/* Recent Documents Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="font-bold text-gray-900 text-sm">Recent Registered Medical Records</h2>
          <Link
            to="/hospital/documents"
            className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1"
          >
            View All <ArrowUpRight size={14} />
          </Link>
        </div>

        {recentDocs.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No records registered yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase text-gray-400 font-semibold border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3">Document</th>
                  <th className="px-6 py-3">Patient ID</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">SHA-256 Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentDocs.map((doc) => (
                  <tr key={doc.document_id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-3 font-medium text-gray-900">{doc.original_filename}</td>
                    <td className="px-6 py-3 font-mono text-xs">{doc.patient_id}</td>
                    <td className="px-6 py-3">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                        {doc.document_type}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <Badge status={doc.status} />
                    </td>
                    <td className="px-6 py-3 font-mono text-xs text-gray-400">
                      {doc.sha256_hash?.slice(0, 12)}...{doc.sha256_hash?.slice(-6)}
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
