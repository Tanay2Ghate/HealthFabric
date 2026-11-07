import { useState, useEffect } from 'react'
import { Key, Shield, Calendar, CheckCircle, XCircle, RefreshCw, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { accessService } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import Badge from '../../components/common/Badge'

export default function AccessRequests() {
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchPermissions = async () => {
    try {
      setLoading(true)
      const res = await accessService.listMyPermissions()
      setPermissions(res.data?.data || [])
    } catch (err) {
      toast.error('Failed to load access permissions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPermissions()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hospital Access Authorizations</h1>
          <p className="text-gray-500 text-sm mt-1">
            Active cross-organization document access permissions recorded on Hyperledger Fabric
          </p>
        </div>
        <button
          onClick={fetchPermissions}
          className="p-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : permissions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Key className="mx-auto text-gray-400 mb-3" size={40} />
          <h3 className="text-gray-700 font-medium">No Active Access Permissions</h3>
          <p className="text-gray-400 text-sm mt-1">
            Access records will appear here as patients grant consent
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase text-gray-400 font-semibold border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4">Permission ID</th>
                  <th className="px-6 py-4">Document</th>
                  <th className="px-6 py-4">Grantee Organization</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Granted Date</th>
                  <th className="px-6 py-4">Expiry Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {permissions.map((perm) => (
                  <tr key={perm.id || perm.permission_id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4 font-mono text-xs text-primary-600 font-medium">
                      {perm.permission_id}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{perm.original_filename || perm.document_id}</div>
                      <div className="text-xs text-gray-400">{perm.document_type}</div>
                    </td>
                    <td className="px-6 py-4 font-medium uppercase text-xs text-gray-700">
                      {perm.grantee_org}
                    </td>
                    <td className="px-6 py-4">
                      <Badge status={perm.status} />
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">
                      {perm.granted_at ? new Date(perm.granted_at).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">
                      {perm.expiry_at ? new Date(perm.expiry_at).toLocaleDateString() : 'Indefinite'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
