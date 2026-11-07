import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, File, AlertCircle } from 'lucide-react'

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/dicom': ['.dcm'],
}

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

export default function FileUpload({ onFileSelect, accept = ACCEPTED_TYPES, maxSize = MAX_SIZE }) {
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')

  const onDrop = useCallback(
    (acceptedFiles, rejectedFiles) => {
      setError('')
      if (rejectedFiles.length > 0) {
        const { code } = rejectedFiles[0].errors[0]
        if (code === 'file-too-large') setError(`File too large. Max size is ${maxSize / 1024 / 1024} MB.`)
        else if (code === 'file-invalid-type') setError('File type not supported. Use PDF, JPG, PNG, or DICOM.')
        else setError('File rejected. Please try again.')
        return
      }
      if (acceptedFiles.length > 0) {
        setFile(acceptedFiles[0])
        onFileSelect?.(acceptedFiles[0])
      }
    },
    [onFileSelect, maxSize],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxSize,
    multiple: false,
  })

  const removeFile = () => {
    setFile(null)
    onFileSelect?.(null)
  }

  if (file) {
    return (
      <div className="border-2 border-primary-300 bg-primary-50 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
            <File size={20} className="text-primary-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
            <p className="text-xs text-gray-500">
              {(file.size / 1024).toFixed(1)} KB · {file.type || 'Unknown type'}
            </p>
          </div>
          <button
            type="button"
            onClick={removeFile}
            className="p-1.5 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          isDragActive
            ? 'border-primary-400 bg-primary-50'
            : 'border-gray-300 hover:border-primary-300 hover:bg-gray-50'
        }`}
      >
        <input {...getInputProps()} />
        <Upload
          size={32}
          className={`mx-auto mb-3 ${isDragActive ? 'text-primary-500' : 'text-gray-400'}`}
        />
        <p className="text-sm font-medium text-gray-700 mb-1">
          {isDragActive ? 'Drop your file here…' : 'Drag & drop a file, or click to browse'}
        </p>
        <p className="text-xs text-gray-500">PDF, JPG, PNG, DICOM · Max 10 MB</p>
      </div>
      {error && (
        <div className="flex items-center gap-2 mt-2 text-sm text-danger-600">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
