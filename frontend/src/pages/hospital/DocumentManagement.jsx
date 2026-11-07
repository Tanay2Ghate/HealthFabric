import { useState, useEffect } from 'react'
import {
  FileText,
  Upload,
  Search,
  CheckCircle,
  AlertTriangle,
  Download,
  ShieldCheck,
  Plus,
  X
} from 'lucide-react'
import toast from 'react-hot-toast'
import { documentService } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import Badge from '../../components/common/Badge'

export default function DocumentManagement() {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [verifyingId, setVerifyingId] = useState(null)
  const [verificationResult, setVerificationResult] = useState(null)

  // Upload Form State
  const [file, setFile] = useState(null)
  const [patientId, setPatientId] = useState('PAT-00000001')
  const [documentType, setDocumentType] = useState('CBC')
  const [uploading, setUploading] = useState(false)

  const fetchDocs = async () => {
    try {
      setLoading(true)
      const res = await documentService.list()
      setDocuments(res.data?.data || [])
    } catch (err) {
      toast.error('Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDocs()
  }, [])

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!file) {
      toast.error('Please select a file to upload')
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('patient_id', patientId)
    formData.append('document_type', documentType)

    try {
      setUploading(true)
      const res = await documentService.upload(formData)
      toast.success('Document encrypted and registered on Hyperledger Fabric!')
      setIsUploadOpen(false)
      setFile(null)
      fetchDocs()
    } catch (err) {
      toast.error(err.userMessage || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleVerify = async (doc) => {
    try {
      setVerifyingId(doc.document_id)
      const res = await documentService.verify(doc.document_id)
      setVerificationResult(res.data?.data)
      if (res.data?.data?.verified) {
        toast.success('Document verified on blockchain!')
      } else {
        toast.error('Integrity check failed!')
      }
    } catch (err) {
      toast.error('Verification failed')
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
      link.setAttribute('download', doc.original_filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success('Decrypted file downloaded')
    } catch (err) {
      toast.error('Failed to download document')
    }
  }

  const filteredDocs = documents.filter(
    (d) =>
      d.original_filename?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.patient_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.document_id?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hospital Medical Documents</h1>
          <p className="text-gray-500 text-sm mt-1">
            Register, encrypt, and verify clinical documents on Hyperledger Fabric
          </p>
        </div>
        <button
          onClick={() => setIsUploadOpen(true)}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-sm transition"
        >
          <Plus size={16} />
          Register New Document
        </button>
      </div>

      {/* Verification result box */}
      {verificationResult && (
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
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
                  {verificationResult.verified ? 'VERIFIED: Hashes Match' : 'INTEGRITY CHECK FAILED'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Doc ID: {verificationResult.documentId}
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
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-gray-50 p-3 rounded-lg font-mono">
            <div>
              <span className="text-gray-400 block">Original Calculated Hash:</span>
              <span className="break-all text-gray-800">{verificationResult.dbHash}</span>
            </div>
            <div>
              <span className="text-gray-400 block">Ledger Registered Hash:</span>
              <span className="break-all text-gray-800">{verificationResult.onChainHash}</span>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
        <Search className="text-gray-400" size={18} />
        <input
          type="text"
          placeholder="Filter documents by patient ID, filename, or document ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full text-sm outline-none bg-transparent text-gray-800"
        />
      </div>

      {/* Documents Table */}
      {loading ? (
        <LoadingSpinner />
      ) : filteredDocs.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <FileText className="mx-auto text-gray-400 mb-3" size={40} />
          <h3 className="text-gray-700 font-medium">No Documents Registered</h3>
          <p className="text-gray-400 text-sm mt-1">Upload a medical document to begin</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase text-gray-400 font-semibold border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4">Filename</th>
                  <th className="px-6 py-4">Patient ID</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Fabric Tx ID</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredDocs.map((doc) => (
                  <tr key={doc.document_id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{doc.original_filename}</div>
                      <div className="text-xs text-gray-400 font-mono">{doc.document_id}</div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">{doc.patient_id}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 bg-primary-50 text-primary-700 rounded text-xs font-medium">
                        {doc.document_type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <Badge status={doc.status} />
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-400">
                      {doc.fabric_tx_id ? `${doc.fabric_tx_id.slice(0, 10)}...` : 'Committed'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleVerify(doc)}
                          disabled={verifyingId === doc.document_id}
                          className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-medium flex items-center gap-1 transition"
                        >
                          <ShieldCheck size={14} />
                          Verify
                        </button>
                        <button
                          onClick={() => handleDownload(doc)}
                          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium flex items-center gap-1 transition"
                        >
                          <Download size={14} />
                          Download
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-900">Upload & Register Document</h2>
              <button onClick={() => setIsUploadOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Target Patient ID
                </label>
                <input
                  type="text"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  placeholder="PAT-00000001"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Document Type
                </label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="CBC">Complete Blood Count (CBC)</option>
                  <option value="BLOOD_TEST">Blood Test Report</option>
                  <option value="MRI">MRI Scan Report</option>
                  <option value="CT">CT Scan Report</option>
                  <option value="XRAY">X-Ray Report</option>
                  <option value="PRESCRIPTION">Prescription</option>
                  <option value="LAB_REPORT">Diagnostic Lab Report</option>
                  <option value="OTHER">Other Medical Document</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  File (PDF, PNG, JPG, JPEG)
                </label>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => setFile(e.target.files[0])}
                  required
                  className="w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                />
              </div>

              <div className="bg-blue-50 p-3 rounded-lg text-xs text-blue-700 space-y-1">
                <p className="font-semibold">Security Note:</p>
                <p>The original file is SHA-256 hashed and AES-256 encrypted off-chain. Only the cryptographic hash is committed to Hyperledger Fabric.</p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {uploading ? 'Registering on Fabric...' : 'Encrypt & Register'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
