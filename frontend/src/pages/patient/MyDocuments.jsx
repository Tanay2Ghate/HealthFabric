import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Upload, Filter, Eye, CheckCircle, Download,
  Key, X, FileText, AlertCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { documentService } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import Badge from '../../components/common/Badge'
import FileUpload from '../../components/common/FileUpload'
import VerificationResult from '../../components/common/VerificationResult'
import HashDisplay from '../../components/common/HashDisplay'
import { format } from 'date-fns'

const DOC_TYPES = ['All', 'lab_report', 'prescription', 'radiology', 'discharge', 'vaccination']

function UploadModal({ open, onClose, onSuccess }) {
  const [file, setFile] = useState(null)
  const [form, setForm] = useState({ documentType: 'lab_report', issuedBy: '', notes: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) { toast.error('Please select a file'); return }
    setLoading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('documentType', form.documentType)
    fd.append('issuedBy', form.issuedBy)
    fd.append('notes', form.notes)
    try {
      await documentService.upload(fd)
      toast.success('Document uploaded and registered on blockchain!')
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(err?.userMessage || 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2 className="text-lg font-semibold text-gray-900">Upload Medical Document</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body space-y-4">
            <FileUpload onFileSelect={setFile} />

            <div>
              <label className="label">Document Type</label>
              <select
                value={form.documentType}
                onChange={(e) => setForm((p) => ({ ...p, documentType: e.target.value }))}
                className="input"
              >
                <option value="lab_report">Lab Report</option>
                <option value="prescription">Prescription</option>
                <option value="radiology">Radiology / Imaging</option>
                <option value="discharge">Discharge Summary</option>
                <option value="vaccination">Vaccination Record</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="label">Issued By</label>
              <input
                type="text"
                value={form.issuedBy}
                onChange={(e) => setForm((p) => ({ ...p, issuedBy: e.target.value }))}
                className="input"
                placeholder="Hospital / Lab / Doctor name"
              />
            </div>

            <div>
              <label className="label">Notes (optional)</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                className="input resize-none"
                rows={3}
                placeholder="Additional notes about this document…"
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary" disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <LoadingSpinner size="xs" /> : <><Upload size={15} /> Upload</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DocumentDetailModal({ doc, open, onClose, onVerify }) {
  const [verifyResult, setVerifyResult] = useState(null)
  const [verifying, setVerifying] = useState(false)

  const docId = doc?.document_id || doc?._id || doc?.id

  const handleVerify = async () => {
    setVerifying(true)
    try {
      const { data } = await documentService.verify(docId)
      setVerifyResult(data?.data || data)
    } catch (err) {
      toast.error('Verification failed')
    } finally {
      setVerifying(false)
    }
  }

  const handleDownload = async () => {
    try {
      const { data } = await documentService.download(docId)
      const url = window.URL.createObjectURL(new Blob([data]))
      const link = document.createElement('a')
      link.href = url
      link.download = doc?.original_filename || doc?.fileName || 'medical-document.pdf'
      link.click()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error('Download failed')
    }
  }

  if (!open || !doc) return null

  return (
    <div className="modal-overlay">
      <div className="modal max-w-2xl">
        <div className="modal-header">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{doc.fileName || 'Document Details'}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Uploaded {doc.uploadedAt ? format(new Date(doc.uploadedAt), 'PPpp') : '—'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body space-y-5">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: 'Document Type', value: doc.documentType?.replace('_', ' ') },
              { label: 'Issued By', value: doc.issuedBy },
              { label: 'Status', value: <Badge status={doc.status}>{doc.status}</Badge> },
              { label: 'File Size', value: doc.fileSize ? `${(doc.fileSize / 1024).toFixed(1)} KB` : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                <p className="font-medium text-gray-800 capitalize">{value || '—'}</p>
              </div>
            ))}
          </div>

          {/* Hash */}
          {doc.fileHash && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">SHA-256 Hash</p>
              <HashDisplay hash={doc.fileHash} truncate={false} />
            </div>
          )}

          {/* Verification */}
          <VerificationResult result={verifyResult} loading={verifying} />
        </div>
        <div className="modal-footer">
          <button onClick={handleDownload} className="btn btn-secondary">
            <Download size={15} /> Download
          </button>
          <button onClick={handleVerify} className="btn btn-primary" disabled={verifying}>
            {verifying ? <LoadingSpinner size="xs" /> : <><CheckCircle size={15} /> Verify on Blockchain</>}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MyDocuments() {
  const qc = useQueryClient()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [filterType, setFilterType] = useState('All')

  const { data, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => documentService.list(),
  })

  const rawDocs = Array.isArray(data?.data?.data)
    ? data.data.data
    : Array.isArray(data?.data)
    ? data.data
    : []

  const documents = rawDocs.filter((d) => {
    if (filterType === 'All') return true
    const type = (d.document_type || d.documentType || '').toLowerCase()
    return type === filterType.toLowerCase()
  })

  const handleDownload = async (doc) => {
    try {
      const docId = doc.document_id || doc._id || doc.id
      const { data: blob } = await documentService.download(docId)
      const url = window.URL.createObjectURL(new Blob([blob]))
      const link = document.createElement('a')
      link.href = url
      link.download = doc.original_filename || doc.fileName || 'medical-document.pdf'
      link.click()
      window.URL.revokeObjectURL(url)
      toast.success('Download started')
    } catch {
      toast.error('Download failed')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Documents</h1>
          <p className="text-sm text-gray-500 mt-0.5">All your medical records secured on Hyperledger Fabric</p>
        </div>
        <button onClick={() => setUploadOpen(true)} className="btn btn-primary">
          <Upload size={16} /> Upload Document
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={15} className="text-gray-400" />
        {DOC_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize ${
              filterType === t
                ? 'bg-primary-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-primary-300'
            }`}
          >
            {t.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center"><LoadingSpinner /></div>
        ) : documents.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <FileText size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium">No documents found</p>
            <p className="text-xs mt-1">Upload your first document or change the filter</p>
          </div>
        ) : (
          <div className="table-container border-0 rounded-none">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Uploaded</th>
                  <th>Issuer</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc._id || doc.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <FileText size={15} className="text-gray-400 flex-shrink-0" />
                        <span className="font-medium text-gray-800 max-w-[180px] truncate">
                          {doc.fileName || doc.name}
                        </span>
                      </div>
                    </td>
                    <td className="capitalize text-gray-600">
                      {(doc.documentType || 'general').replace('_', ' ')}
                    </td>
                    <td className="text-gray-600">
                      {doc.uploadedAt ? format(new Date(doc.uploadedAt), 'PP') : '—'}
                    </td>
                    <td className="text-gray-600">{doc.issuedBy || '—'}</td>
                    <td>
                      <Badge status={doc.status || 'REGISTERED'}>
                        {doc.status || 'REGISTERED'}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setSelectedDoc(doc)}
                          className="btn btn-secondary btn-sm"
                        >
                          <Eye size={13} /> View
                        </button>
                        <button
                          onClick={() => handleDownload(doc)}
                          className="btn btn-secondary btn-sm"
                        >
                          <Download size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={() => qc.invalidateQueries(['documents'])}
      />
      <DocumentDetailModal
        doc={selectedDoc}
        open={Boolean(selectedDoc)}
        onClose={() => setSelectedDoc(null)}
      />
    </div>
  )
}
