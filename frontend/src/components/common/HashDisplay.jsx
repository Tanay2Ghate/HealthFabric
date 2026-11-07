import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export default function HashDisplay({ hash, label, truncate = true }) {
  const [copied, setCopied] = useState(false)

  if (!hash) return <span className="text-gray-400 text-xs italic">N/A</span>

  const display = truncate
    ? `${hash.slice(0, 10)}...${hash.slice(-8)}`
    : hash

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(hash)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const el = document.createElement('textarea')
      el.value = hash
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      {label && <span className="text-xs text-gray-500">{label}:</span>}
      <code
        className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded border border-gray-200"
        title={hash}
      >
        {display}
      </code>
      <button
        onClick={handleCopy}
        className="p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
        title="Copy full hash"
      >
        {copied ? (
          <Check size={13} className="text-success-600" />
        ) : (
          <Copy size={13} />
        )}
      </button>
    </div>
  )
}
