import { useState, useEffect } from 'react'
import {
  FileText,
  Search,
  Download,
  CheckCircle,
  AlertTriangle,
  PlusCircle,
  X,
  ShieldCheck,
  Calendar,
  User,
  Building
} from 'lucide-react'
import toast from 'react-hot-toast'
import { documentService, reviewService } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import Badge from '../../components/common/Badge'

export default function PatientDocuments() {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState('ALL')
  const [verifyingId, setVerifyingId] = useState(null)
  const [verificationResult, setVerificationResult] = useState(null)

  // Review modal state
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [observationsSummary, setObservationsSummary] = useState('')
  const [clinicalNotes, setClinicalNotes] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)

  const fetchDocuments = async () => {
    try {
      setLoading(true)
      const res = await documentService.list()
      const list = Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data)
        ? res.data
        : []
      setDocuments(list)
    } catch (err) {
      toast.error('Failed to load accessible documents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDocuments()
  }, [])

  const handleVerify = async (doc) => {
    try {
      setVerifyingId(doc.document_id)
      const res = await documentService.verify(doc.document_id)
      setVerificationResult(res.data?.data)
      if (res.data?.data?.verified) {
        toast.success('Document integrity verified on Hyperledger Fabric!')
      } else {
        toast.error('Integrity check failed!')
      }
    } catch (err) {
      toast.error('Failed to verify document on blockchain')
    } finally {
      setVerifyingId(null)
    }
  }

  const handleDownload = async (doc) => {
    try {
      const res = await documentService.download(doc.document_id)
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', doc.original_filename || `medical-doc-${doc.document_id}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.parentNode.removeChild(link)
      toast.success('Decrypted file downloaded successfully')
    } catch (err) {
      toast.error('Failed to download document')
    }
  }

  const handleOpenReview = (doc) => {
    setSelectedDoc(doc)
    setObservationsSummary('')
    setClinicalNotes('')
    setIsReviewModalOpen(true)
  }

  const handleSubmitReview = async (e) => {
    e.preventDefault()
    if (!observationsSummary.trim() || !clinicalNotes.trim()) {
      toast.error('Please enter observation summary and clinical notes')
      return
    }

    try {
      setSubmittingReview(true)
      const res = await reviewService.add({
        documentId: selectedDoc.document_id,
        observationsSummary,
        clinicalNotes
      })

      toast.success('Clinical review registered on blockchain!')
      setIsReviewModalOpen(false)
    } catch (err) {
      const msg = err.response?.data?.error || err.userMessage || err.message || 'Failed to submit review'
      toast.error(msg)
    } finally {
      setSubmittingReview(false)
    }
  }

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch =
      doc.original_filename?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.patient_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.document_id?.toLowerCase().includes(searchTerm.toLowerCase())
    const docType = (doc.document_type || doc.documentType || '').toUpperCase()
    const matchesType = selectedType === 'ALL' || docType === selectedType.toUpperCase()
    return matchesSearch && matchesType
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Accessible Patient Documents</h1>
        <p className="text-gray-500 text-sm mt-1">
          Review, verify cryptographic hashes, and record clinical observations on Fabric
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search by filename, patient ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div className="flex gap-2 w-full md:w-auto overflow-x-auto">
          {['ALL', 'CBC', 'BLOOD_TEST', 'MRI', 'CT', 'XRAY', 'PRESCRIPTION', 'LAB_REPORT'].map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                selectedType === type
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Verification modal result popup */}
      {verificationResult && (
        <div className="bg-white p-5 rounded-xl border-2 border-primary-200 shadow-md">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              {verificationResult.verified ? (
                <div className="p-2 bg-green-100 text-green-700 rounded-lg">
                  <CheckCircle size={24} />
                </div>
              ) : (
                <div className="p-2 bg-red-100 text-red-700 rounded-lg">
                  <AlertTriangle size={24} />
                </div>
              )}
              <div>
                <h3 className="font-bold text-gray-900">
                  {verificationResult.verified ? 'VERIFIED: Blockchain Integrity Valid' : 'INTEGRITY CHECK FAILED'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Document ID: {verificationResult.documentId}
                </p>
              </div>
            </div>
            <button
              onClick={() => setVerificationResult(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-gray-50 p-3 rounded-lg font-mono">
            <div>
              <span className="text-gray-500 block">Database Stored Hash:</span>
              <span className="text-gray-800 break-all">{verificationResult.dbHash}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Hyperledger Fabric Hash:</span>
              <span className="text-gray-800 break-all">{verificationResult.onChainHash}</span>
            </div>
          </div>
        </div>
      )}

      {/* Document List */}
      {loading ? (
        <LoadingSpinner />
      ) : filteredDocs.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <FileText className="mx-auto text-gray-400 mb-3" size={40} />
          <h3 className="text-gray-700 font-medium">No Accessible Documents Found</h3>
          <p className="text-gray-400 text-sm mt-1">
            Documents will appear here once patients grant your organization permission
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDocs.map((doc) => (
            <div
              key={doc.document_id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow transition p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold px-2.5 py-1 bg-primary-50 text-primary-700 rounded-md">
                    {doc.document_type}
                  </span>
                  <Badge status={doc.status} />
                </div>

                <h3 className="font-semibold text-gray-900 text-base line-clamp-1">
                  {doc.original_filename}
                </h3>
                <p className="text-xs font-mono text-gray-400 mt-0.5">{doc.document_id}</p>

                <div className="mt-4 space-y-2 text-xs text-gray-600 border-t border-gray-100 pt-3">
                  <div className="flex items-center gap-2">
                    <User size={14} className="text-gray-400" />
                    <span>Patient: {doc.patient_id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Building size={14} className="text-gray-400" />
                    <span>Issuer: {doc.issuer_org}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-gray-400" />
                    <span>{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-gray-100 flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => handleVerify(doc)}
                    disabled={verifyingId === doc.document_id}
                    className="flex-1 py-1.5 px-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition"
                  >
                    <ShieldCheck size={14} />
                    {verifyingId === doc.document_id ? 'Verifying...' : 'Verify Hash'}
                  </button>

                  <button
                    onClick={() => handleDownload(doc)}
                    className="py-1.5 px-3 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition"
                  >
                    <Download size={14} />
                    Download
                  </button>
                </div>

                <button
                  onClick={() => handleOpenReview(doc)}
                  className="w-full py-2 px-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition shadow-sm"
                >
                  <PlusCircle size={14} />
                  Add Clinical Review
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Review Modal */}
      {isReviewModalOpen && selectedDoc && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-900">Add Clinical Review</h2>
              <button
                onClick={() => setIsReviewModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="bg-gray-50 p-3 rounded-lg text-xs space-y-1 mb-4">
              <p><strong>Document:</strong> {selectedDoc.original_filename}</p>
              <p><strong>Patient ID:</strong> {selectedDoc.patient_id}</p>
              <p><strong>Document ID:</strong> {selectedDoc.document_id}</p>
            </div>

            <form onSubmit={handleSubmitReview} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Observations Summary (On-chain reference)
                </label>
                <input
                  type="text"
                  placeholder="e.g., CBC normal, mild anemia noted"
                  value={observationsSummary}
                  onChange={(e) => setObservationsSummary(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Clinical Notes (Encrypted off-chain)
                </label>
                <textarea
                  rows={4}
                  placeholder="Enter detailed clinical observation, recommended follow-up..."
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsReviewModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReview}
                  className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium shadow-sm disabled:opacity-50"
                >
                  {submittingReview ? 'Registering on Blockchain...' : 'Sign & Submit Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
