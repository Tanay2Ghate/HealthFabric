import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react'
import HashDisplay from './HashDisplay'
import { format } from 'date-fns'

export default function VerificationResult({ result, loading }) {
  if (loading) {
    return (
      <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <div className="w-5 h-5 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        <span className="text-sm text-gray-600">Verifying integrity on blockchain…</span>
      </div>
    )
  }

  if (!result) return null

  const isVerified = result.verified === true || result.status === 'VERIFIED'

  return (
    <div
      className={`rounded-xl border p-5 ${
        isVerified
          ? 'bg-success-50 border-success-200'
          : 'bg-danger-50 border-danger-200'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        {isVerified ? (
          <CheckCircle size={28} className="text-success-600 flex-shrink-0" />
        ) : (
          <XCircle size={28} className="text-danger-600 flex-shrink-0" />
        )}
        <div>
          <h3 className={`text-base font-semibold ${isVerified ? 'text-success-700' : 'text-danger-700'}`}>
            {isVerified ? '✓ Document Verified' : '✗ Integrity Check Failed'}
          </h3>
          <p className={`text-xs mt-0.5 ${isVerified ? 'text-success-600' : 'text-danger-600'}`}>
            {isVerified
              ? 'This document has not been tampered with.'
              : 'The document hash does not match the blockchain record.'}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2.5 text-xs">
        {result.documentId && (
          <div className="flex items-center justify-between">
            <span className="text-gray-600 font-medium">Document ID</span>
            <code className="font-mono bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-700">
              {result.documentId}
            </code>
          </div>
        )}

        {result.fileHash && (
          <div className="flex items-center justify-between">
            <span className="text-gray-600 font-medium">File Hash (SHA-256)</span>
            <HashDisplay hash={result.fileHash} />
          </div>
        )}

        {result.blockchainHash && (
          <div className="flex items-center justify-between">
            <span className="text-gray-600 font-medium">Blockchain Hash</span>
            <HashDisplay hash={result.blockchainHash} />
          </div>
        )}

        {result.transactionId && (
          <div className="flex items-center justify-between">
            <span className="text-gray-600 font-medium">Transaction ID</span>
            <HashDisplay hash={result.transactionId} />
          </div>
        )}

        {result.timestamp && (
          <div className="flex items-center justify-between">
            <span className="text-gray-600 font-medium">Registered At</span>
            <span className="text-gray-700">
              {format(new Date(result.timestamp), 'PPpp')}
            </span>
          </div>
        )}

        {result.organization && (
          <div className="flex items-center justify-between">
            <span className="text-gray-600 font-medium">Issuing Organization</span>
            <span className="text-gray-700">{result.organization}</span>
          </div>
        )}

        {result.message && !isVerified && (
          <div className="flex items-start gap-2 mt-3 p-3 bg-danger-100 rounded-lg">
            <AlertTriangle size={14} className="text-danger-600 mt-0.5 flex-shrink-0" />
            <span className="text-danger-700">{result.message}</span>
          </div>
        )}
      </div>
    </div>
  )
}
