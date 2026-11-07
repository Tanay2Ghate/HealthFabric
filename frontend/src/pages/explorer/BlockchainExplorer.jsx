import { useState, useEffect } from 'react'
import {
  Search,
  Activity,
  Layers,
  Database,
  Shield,
  FileText,
  Key,
  ClipboardList,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  RefreshCw,
  Info
} from 'lucide-react'
import toast from 'react-hot-toast'
import { explorerService } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

export default function BlockchainExplorer() {
  const [transactions, setTransactions] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('ALL')
  const [searchDocId, setSearchDocId] = useState('')
  const [docHistory, setDocHistory] = useState(null)
  const [searchingHistory, setSearchingHistory] = useState(false)

  const loadExplorerData = async () => {
    try {
      setLoading(true)
      const [txRes, statsRes] = await Promise.all([
        explorerService.getTransactions({
          type: filterType === 'ALL' ? undefined : filterType,
          limit: 30
        }),
        explorerService.getNetworkStatus()
      ])
      setTransactions(txRes.data?.data?.transactions || [])
      setStats(statsRes.data?.data)
    } catch (err) {
      toast.error('Failed to load explorer data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadExplorerData()
  }, [filterType])

  const handleSearchDocumentHistory = async (e) => {
    e.preventDefault()
    if (!searchDocId.trim()) return

    try {
      setSearchingHistory(true)
      const res = await explorerService.getDocumentHistory(searchDocId.trim())
      setDocHistory(res.data?.data)
      toast.success('Retrieved ledger history for document')
    } catch (err) {
      toast.error('Document history not found')
    } finally {
      setSearchingHistory(false)
    }
  }

  const getTypeBadge = (type) => {
    if (type.includes('UPLOAD')) {
      return (
        <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-md text-xs font-semibold flex items-center gap-1 w-fit">
          <FileText size={12} /> RegisterDocument
        </span>
      )
    }
    if (type.includes('GRANT')) {
      return (
        <span className="px-2.5 py-1 bg-green-100 text-green-800 rounded-md text-xs font-semibold flex items-center gap-1 w-fit">
          <Key size={12} /> GrantAccess
        </span>
      )
    }
    if (type.includes('REVOKE')) {
      return (
        <span className="px-2.5 py-1 bg-red-100 text-red-800 rounded-md text-xs font-semibold flex items-center gap-1 w-fit">
          <XCircle size={12} /> RevokeAccess
        </span>
      )
    }
    if (type.includes('REVIEW')) {
      return (
        <span className="px-2.5 py-1 bg-purple-100 text-purple-800 rounded-md text-xs font-semibold flex items-center gap-1 w-fit">
          <ClipboardList size={12} /> AddDoctorReview
        </span>
      )
    }
    return (
      <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-semibold flex items-center gap-1 w-fit">
        <Activity size={12} /> {type}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Network Header */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-bold tracking-widest uppercase text-emerald-400">
                {stats?.fabricMockMode ? 'Hyperledger Fabric (Dev Node)' : 'Hyperledger Fabric Network Active'}
              </span>
            </div>
            <h1 className="text-2xl font-bold mt-1 text-white">HealthChain Ledger Explorer</h1>
            <p className="text-slate-400 text-xs mt-0.5">
              Channel: <span className="font-mono text-slate-200">healthchainchannel</span> • Chaincode:{' '}
              <span className="font-mono text-slate-200">healthchain-cc:1.0</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-700 text-right">
              <span className="text-xs text-slate-400 block">Ledger Records</span>
              <span className="text-lg font-bold text-white">{stats?.totalDocuments ?? 0}</span>
            </div>
            <button
              onClick={loadExplorerData}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition"
              title="Refresh Ledger"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* Network Nodes Banner */}
        <div className="mt-5 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-800/50 p-2.5 rounded-lg border border-slate-700/50 flex items-center justify-between">
            <span className="text-slate-300">Hospital A (Org1MSP)</span>
            <span className="text-emerald-400 font-mono text-[10px]">Endorsing Peer</span>
          </div>
          <div className="bg-slate-800/50 p-2.5 rounded-lg border border-slate-700/50 flex items-center justify-between">
            <span className="text-slate-300">Hospital B (Org2MSP)</span>
            <span className="text-emerald-400 font-mono text-[10px]">Endorsing Peer</span>
          </div>
          <div className="bg-slate-800/50 p-2.5 rounded-lg border border-slate-700/50 flex items-center justify-between">
            <span className="text-slate-300">Diagnostic Lab (Org3MSP)</span>
            <span className="text-emerald-400 font-mono text-[10px]">Endorsing Peer</span>
          </div>
        </div>
      </div>

      {/* Document History Lookup */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Search size={16} className="text-primary-600" />
          Trace Complete Document Lifecycle on Blockchain
        </h2>
        <form onSubmit={handleSearchDocumentHistory} className="flex gap-2">
          <input
            type="text"
            placeholder="Enter Document ID (e.g. DOC-xxxx)..."
            value={searchDocId}
            onChange={(e) => setSearchDocId(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="submit"
            disabled={searchingHistory}
            className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
          >
            {searchingHistory ? 'Tracing...' : 'Trace Ledger'}
          </button>
        </form>

        {docHistory && (
          <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
            <div className="flex justify-between items-center border-b border-gray-200 pb-2">
              <span className="text-xs font-bold text-gray-700">Lifecycle Audit for {docHistory.documentId}</span>
              <button
                onClick={() => setDocHistory(null)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Close Trace
              </button>
            </div>

            <div className="space-y-2 text-xs">
              {docHistory.auditLogs?.map((log, idx) => (
                <div key={idx} className="bg-white p-3 rounded-lg border border-gray-200 flex justify-between items-center">
                  <div>
                    <div className="font-semibold text-gray-900 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary-600"></span>
                      {log.event_type}
                    </div>
                    <div className="text-gray-500 mt-0.5">
                      Actor: <span className="font-mono text-gray-700">{log.actor_user_id || 'System'}</span> ({log.actor_org || 'Org'})
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-[11px] text-primary-700 font-semibold block">
                      {log.fabric_tx_id ? `${log.fabric_tx_id.slice(0, 14)}...` : 'Ledger Verified'}
                    </span>
                    <span className="text-[10px] text-gray-400">{new Date(log.event_timestamp).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {['ALL', 'DOCUMENT', 'ACCESS', 'REVIEW'].map((f) => (
          <button
            key={f}
            onClick={() => setFilterType(f)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              filterType === f
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            {f === 'ALL' ? 'All Transactions' : `${f} Events`}
          </button>
        ))}
      </div>

      {/* Transaction Table */}
      {loading ? (
        <LoadingSpinner />
      ) : transactions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Activity className="mx-auto text-gray-400 mb-3" size={40} />
          <h3 className="text-gray-700 font-medium">No Transactions Recorded</h3>
          <p className="text-gray-400 text-sm mt-1">Actions performed across HealthChain will be audited here</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase text-gray-400 font-semibold border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4">Tx ID / Hash</th>
                  <th className="px-6 py-4">Transaction Type</th>
                  <th className="px-6 py-4">Initiating Org</th>
                  <th className="px-6 py-4">Reference Target</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4 font-mono text-xs text-primary-600 font-medium max-w-[180px] truncate">
                      {tx.fabric_tx_id || `TX-${tx.id.toString().padStart(6, '0')}`}
                    </td>
                    <td className="px-6 py-4">{getTypeBadge(tx.event_type)}</td>
                    <td className="px-6 py-4 font-semibold text-xs text-gray-700 uppercase">
                      {tx.actor_org || 'HealthChain'}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-500">
                      {tx.target_id || 'System'}
                    </td>
                    <td className="px-6 py-4">
                      {tx.success ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                          <CheckCircle size={12} /> Committed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded">
                          <XCircle size={12} /> Failed
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400 text-right whitespace-nowrap">
                      {new Date(tx.event_timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
