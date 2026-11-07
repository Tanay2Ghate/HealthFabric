import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, X, Shield, AlertCircle, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import { accessService, documentService } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import Badge from '../../components/common/Badge'
import ConfirmModal from '../../components/common/ConfirmModal'
import { format } from 'date-fns'

const ORGS = [
  { value: 'hospitalb', label: 'Hospital B (Partner Hospital)' },
  { value: 'hospitala', label: 'Hospital A (Primary Hospital)' },
  { value: 'diaglab', label: 'Diagnostic Laboratory' },
]

function GrantAccessModal({ open, onClose, documents, onSuccess }) {
  const [form, setForm] = useState({ documentId: '', organization: '', expiresAt: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.documentId || !form.organization) {
      toast.error('Please fill all required fields')
      return
    }
    setLoading(true)
    try {
      await accessService.grant({
        documentId: form.documentId,
        organization: form.organization,
        expiresAt: form.expiresAt || undefined,
      })
      toast.success('Access granted and recorded on blockchain!')
      onSuccess()
      onClose()
      setForm({ documentId: '', organization: '', expiresAt: '' })
    } catch (err) {
      toast.error(err?.userMessage || 'Failed to grant access')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2 className="text-lg font-semibold text-gray-900">Grant Document Access</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body space-y-4">
            <div className="flex items-start gap-3 p-3 bg-primary-50 rounded-lg border border-primary-100">
              <Shield size={16} className="text-primary-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-primary-700">
                Granting access is recorded on the Hyperledger Fabric blockchain and creates an immutable audit trail.
              </p>
            </div>

            <div>
              <label className="label">Document <span className="text-danger-500">*</span></label>
              <select
                value={form.documentId}
                onChange={(e) => setForm((p) => ({ ...p, documentId: e.target.value }))}
                className="input"
                required
              >
                <option value="">Select document…</option>
                {documents.map((d) => (
                  <option key={d.document_id || d._id || d.id} value={d.document_id || d._id || d.id}>
                    {d.original_filename || d.fileName || d.name || d.document_id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Grant Access To <span className="text-danger-500">*</span></label>
              <select
                value={form.organization}
                onChange={(e) => setForm((p) => ({ ...p, organization: e.target.value }))}
                className="input"
                required
              >
                <option value="">Select organization…</option>
                {ORGS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Expiry Date (optional)</label>
              <div className="relative">
                <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
                  className="input pl-9"
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Leave blank for indefinite access.</p>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary" disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <LoadingSpinner size="xs" /> : <><Shield size={15} /> Grant Access</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AccessManagement() {
  const qc = useQueryClient()
  const [grantOpen, setGrantOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState(null)
  const [revoking, setRevoking] = useState(false)

  const { data: permData, isLoading: permLoading } = useQuery({
    queryKey: ['my-permissions'],
    queryFn: () => accessService.listMyPermissions(),
  })

  const { data: docData } = useQuery({
    queryKey: ['documents'],
    queryFn: () => documentService.list(),
  })

  const permissions = Array.isArray(permData?.data?.data)
    ? permData.data.data
    : Array.isArray(permData?.data)
    ? permData.data
    : []
  const documents = Array.isArray(docData?.data?.data)
    ? docData.data.data
    : Array.isArray(docData?.data)
    ? docData.data
    : []

  const handleRevoke = async () => {
    if (!revokeTarget) return
    setRevoking(true)
    try {
      await accessService.revoke({
        documentId: revokeTarget.document_id || revokeTarget.documentId,
        granteeOrg: revokeTarget.grantee_org || revokeTarget.organization,
      })
      toast.success('Access revoked and recorded on blockchain')
      qc.invalidateQueries(['my-permissions'])
      setRevokeTarget(null)
    } catch (err) {
      toast.error(err?.userMessage || 'Failed to revoke access')
    } finally {
      setRevoking(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Access Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Control who can view your medical documents</p>
        </div>
        <button onClick={() => setGrantOpen(true)} className="btn btn-primary">
          <Plus size={16} /> Grant Access
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active', value: permissions.filter((p) => p.status === 'ACTIVE').length, color: 'text-success-600 bg-success-50' },
          { label: 'Revoked', value: permissions.filter((p) => p.status === 'REVOKED').length, color: 'text-danger-600 bg-danger-50' },
          { label: 'Expired', value: permissions.filter((p) => p.status === 'EXPIRED').length, color: 'text-gray-600 bg-gray-100' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 text-center">
            <p className={`text-2xl font-bold ${color} rounded-lg p-2 mx-auto w-fit min-w-[48px]`}>{value}</p>
            <p className="text-xs text-gray-500 mt-1">{label} Permissions</p>
          </div>
        ))}
      </div>

      {/* Permissions Table */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="font-semibold text-gray-800">Access Permissions</h2>
        </div>
        {permLoading ? (
          <div className="p-12 flex justify-center"><LoadingSpinner /></div>
        ) : permissions.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Shield size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium">No access permissions yet</p>
            <p className="text-xs mt-1">Grant access to doctors or hospitals to get started</p>
          </div>
        ) : (
          <div className="table-container border-0 rounded-none">
            <table className="table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Granted To</th>
                  <th>Granted Date</th>
                  <th>Expiry</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {permissions.map((p, i) => (
                  <tr key={p.permission_id || p.id || i}>
                    <td className="font-medium text-gray-800 max-w-[140px] truncate">
                      {p.original_filename || p.document_id || p.documentName}
                    </td>
                    <td className="text-gray-700 uppercase font-semibold text-xs">{p.grantee_org || p.organization || p.grantedTo}</td>
                    <td className="text-gray-600">
                      {p.granted_at || p.grantedAt ? format(new Date(p.granted_at || p.grantedAt), 'PP') : '—'}
                    </td>
                    <td className="text-gray-600">
                      {p.expiry_at || p.expiresAt ? format(new Date(p.expiry_at || p.expiresAt), 'PP') : 'No expiry'}
                    </td>
                    <td>
                      <Badge status={p.status || 'ACTIVE'}>{p.status || 'ACTIVE'}</Badge>
                    </td>
                    <td>
                      {p.status === 'ACTIVE' && (
                        <button
                          onClick={() => setRevokeTarget(p)}
                          className="btn btn-danger btn-sm"
                        >
                          <Trash2 size={13} /> Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <GrantAccessModal
        open={grantOpen}
        onClose={() => setGrantOpen(false)}
        documents={documents}
        onSuccess={() => qc.invalidateQueries(['my-permissions'])}
      />
      <ConfirmModal
        open={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevoke}
        title="Revoke Access"
        message={`Are you sure you want to revoke access for ${revokeTarget?.organization || 'this organization'}? This action will be recorded on the blockchain.`}
        confirmLabel="Revoke Access"
        loading={revoking}
        variant="danger"
      />
    </div>
  )
}
