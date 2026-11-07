export default function LoadingSpinner({ size = 'md', className = '' }) {
  const sizes = {
    xs:  'w-4 h-4 border-2',
    sm:  'w-5 h-5 border-2',
    md:  'w-8 h-8 border-2',
    lg:  'w-12 h-12 border-3',
    xl:  'w-16 h-16 border-4',
  }
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div
        className={`${sizes[size] || sizes.md} rounded-full border-primary-200 border-t-primary-600 animate-spin`}
      />
    </div>
  )
}
