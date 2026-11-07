import { FileText, Building2, Calendar, Download } from 'lucide-react'
import { format } from 'date-fns'
import Badge from './Badge'

const DOC_TYPE_ICONS = {
  lab_report:    '🧪',
  prescription:  '💊',
  radiology:     '🩻',
  discharge:     '🏥',
  vaccination:   '💉',
  default:       '📄',
}

export default function DocumentCard({ document, onView, onVerify, onDownload, compact = false }) {
  if (!document) return null

  const icon = DOC_TYPE_ICONS[document.documentType] || DOC_TYPE_ICONS.default
  const uploadDate = document.uploadedAt || document.createdAt

  return (
    <div
      className="card p-4 hover:shadow-card-hover transition-shadow cursor-pointer"
      onClick={() => onView?.(document)}
    >
      <div className="flex items-start gap-3">
        <div className="text-2xl">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-800 truncate">
              {document.fileName || document.name || 'Untitled Document'}
            </h3>
            <Badge status={document.status || 'REGISTERED'} size="xs">
              {document.status || 'REGISTERED'}
            </Badge>
          </div>

          {!compact && (
            <div className="mt-2 space-y-1">
              {document.documentType && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <FileText size={11} />
                  <span className="capitalize">{document.documentType.replace('_', ' ')}</span>
                </div>
              )}
              {document.issuedBy && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Building2 size={11} />
                  <span>{document.issuedBy}</span>
                </div>
              )}
              {uploadDate && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Calendar size={11} />
                  <span>{format(new Date(uploadDate), 'PPP')}</span>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
            {onView && (
              <button onClick={() => onView(document)} className="btn btn-secondary btn-sm">
                View
              </button>
            )}
            {onVerify && (
              <button onClick={() => onVerify(document)} className="btn btn-sm bg-primary-50 text-primary-700 border border-primary-200 hover:bg-primary-100">
                Verify
              </button>
            )}
            {onDownload && (
              <button onClick={() => onDownload(document)} className="btn btn-secondary btn-sm">
                <Download size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
