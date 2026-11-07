import { Link, Shield, Wifi, WifiOff } from 'lucide-react'

export default function FabricBadge({ live = true, className = '' }) {
  if (live) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 bg-success-50 border border-success-200 rounded-full ${className}`}>
        <div className="w-2 h-2 bg-success-500 rounded-full animate-pulse" />
        <Shield size={13} className="text-success-600" />
        <span className="text-xs font-semibold text-success-700">Fabric Network Live</span>
      </div>
    )
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 bg-warning-50 border border-warning-200 rounded-full ${className}`}>
      <WifiOff size={13} className="text-warning-600" />
      <span className="text-xs font-semibold text-warning-700">⚠️ MOCK MODE</span>
    </div>
  )
}
