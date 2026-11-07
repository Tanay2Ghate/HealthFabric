const VARIANTS = {
  success:  'bg-success-100 text-success-700 border border-success-200',
  danger:   'bg-danger-100 text-danger-700 border border-danger-200',
  warning:  'bg-warning-100 text-warning-700 border border-warning-200',
  info:     'bg-primary-100 text-primary-700 border border-primary-200',
  gray:     'bg-gray-100 text-gray-700 border border-gray-200',
  purple:   'bg-purple-100 text-purple-700 border border-purple-200',
}

const STATUS_MAP = {
  VERIFIED:        'success',
  ACTIVE:          'success',
  REGISTERED:      'info',
  PENDING:         'warning',
  FAILED:          'danger',
  REVOKED:         'danger',
  EXPIRED:         'gray',
  MOCK:            'warning',
  LIVE:            'success',
  patient:         'info',
  doctor:          'success',
  hospital_admin:  'warning',
  lab_staff:       'purple',
}

const SIZES = {
  xs: 'px-1.5 py-0.5 text-[10px] rounded',
  sm: 'px-2 py-0.5 text-xs rounded',
  md: 'px-2.5 py-1 text-xs rounded-md',
  lg: 'px-3 py-1.5 text-sm rounded-md',
}

export default function Badge({ children, variant, status, size = 'sm', className = '' }) {
  const resolvedVariant = variant || STATUS_MAP[status] || STATUS_MAP[children] || 'gray'
  const colorClass = VARIANTS[resolvedVariant] || VARIANTS.gray
  const sizeClass = SIZES[size] || SIZES.sm

  return (
    <span
      className={`inline-flex items-center font-medium ${colorClass} ${sizeClass} ${className}`}
    >
      {children}
    </span>
  )
}
