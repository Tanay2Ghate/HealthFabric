import { Link } from 'react-router-dom'
import { AlertCircle, ArrowLeft } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle size={32} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">404 - Page Not Found</h1>
        <p className="text-gray-500 text-sm mb-6">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition"
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
