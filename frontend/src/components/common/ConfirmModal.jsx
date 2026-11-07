import { AlertTriangle, X } from 'lucide-react'
import LoadingSpinner from './LoadingSpinner'

export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
}) {
  if (!open) return null

  const confirmClass = variant === 'danger' ? 'btn-danger' : 'btn-primary'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              variant === 'danger' ? 'bg-danger-100' : 'bg-primary-100'
            }`}>
              <AlertTriangle size={20} className={variant === 'danger' ? 'text-danger-600' : 'text-primary-600'} />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-gray-900">{title}</h2>
              <p className="text-sm text-gray-600 mt-1">{message}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex items-center justify-end gap-3 mt-6">
            <button onClick={onClose} className="btn btn-secondary" disabled={loading}>
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className={`btn ${confirmClass}`}
              disabled={loading}
            >
              {loading ? <LoadingSpinner size="xs" /> : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
