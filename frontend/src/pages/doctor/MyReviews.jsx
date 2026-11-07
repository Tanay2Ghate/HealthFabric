import { useState, useEffect } from 'react'
import { ClipboardList, Shield, CheckCircle, ExternalLink, Calendar, FileText, Key } from 'lucide-react'
import toast from 'react-hot-toast'
import { reviewService } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

export default function MyReviews() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedReview, setSelectedReview] = useState(null)

  useEffect(() => {
    fetchReviews()
  }, [])

  const fetchReviews = async () => {
    try {
      setLoading(true)
      const res = await reviewService.listMine()
      setReviews(res.data?.data || [])
    } catch (err) {
      toast.error('Failed to load doctor reviews')
    } finally {
      setLoading(false)
    }
  }

  const handleViewDetails = async (reviewId) => {
    try {
      const res = await reviewService.get(reviewId)
      setSelectedReview(res.data?.data)
    } catch (err) {
      toast.error('Failed to fetch review details')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Clinical Reviews</h1>
        <p className="text-gray-500 text-sm mt-1">
          Cryptographically signed observations registered on Hyperledger Fabric
        </p>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : reviews.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <ClipboardList className="mx-auto text-gray-400 mb-3" size={40} />
          <h3 className="text-gray-700 font-medium">No Reviews Recorded Yet</h3>
          <p className="text-gray-400 text-sm mt-1">
            Navigate to Patient Documents to submit a new clinical observation
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase text-gray-400 font-semibold border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4">Review ID</th>
                  <th className="px-6 py-4">Document</th>
                  <th className="px-6 py-4">Summary</th>
                  <th className="px-6 py-4">Review Hash</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reviews.map((r) => (
                  <tr key={r.review_id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4 font-mono text-xs text-primary-600 font-medium">
                      {r.review_id}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{r.original_filename || r.document_id}</div>
                      <div className="text-xs text-gray-400">{r.document_type}</div>
                    </td>
                    <td className="px-6 py-4 max-w-xs truncate text-gray-700">
                      {r.observations_summary}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-400">
                      {r.review_hash ? `${r.review_hash.slice(0, 10)}...${r.review_hash.slice(-6)}` : 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleViewDetails(r.review_id)}
                        className="text-xs font-medium text-primary-600 hover:text-primary-800 bg-primary-50 px-3 py-1.5 rounded-lg transition"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedReview && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <Shield className="text-primary-600" size={20} />
                <h3 className="font-bold text-gray-900">Signed Clinical Review</h3>
              </div>
              <button
                onClick={() => setSelectedReview(null)}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-gray-400 block font-semibold uppercase">Review ID:</span>
                <span className="font-mono text-gray-800">{selectedReview.review_id}</span>
              </div>

              <div>
                <span className="text-gray-400 block font-semibold uppercase">Document ID:</span>
                <span className="font-mono text-gray-800">{selectedReview.document_id}</span>
              </div>

              <div>
                <span className="text-gray-400 block font-semibold uppercase">Observation Summary:</span>
                <p className="text-sm text-gray-900 font-medium mt-0.5">{selectedReview.observations_summary}</p>
              </div>

              {selectedReview.clinicalNotes && (
                <div className="bg-blue-50/60 p-3 rounded-lg border border-blue-100">
                  <span className="text-blue-800 block font-semibold uppercase mb-1">Decrypted Clinical Notes:</span>
                  <p className="text-gray-800 text-sm whitespace-pre-wrap">{selectedReview.clinicalNotes}</p>
                </div>
              )}

              <div className="bg-gray-50 p-3 rounded-lg font-mono space-y-2">
                <div>
                  <span className="text-gray-400 block">SHA-256 Review Hash:</span>
                  <span className="break-all text-gray-700">{selectedReview.review_hash}</span>
                </div>
                <div>
                  <span className="text-gray-400 block">Digital Signature:</span>
                  <span className="break-all text-gray-700">{selectedReview.digital_signature}</span>
                </div>
                <div>
                  <span className="text-gray-400 block">Fabric Transaction ID:</span>
                  <span className="break-all text-primary-700 font-semibold">{selectedReview.fabric_tx_id || 'Committed'}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setSelectedReview(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
