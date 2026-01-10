import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Move } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PanoramaViewerProps {
  imageUrl: string
  haov?: number // Horizontal angle of view (default 180)
  vaov?: number // Vertical angle of view (default 90)
  className?: string
  onLoad?: () => void
}

export function PanoramaViewer({
  imageUrl,
  haov = 180,
  vaov = 90,
  className,
  onLoad,
}: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showHint, setShowHint] = useState(true)

  useEffect(() => {
    // Hide hint after 3 seconds
    const timer = setTimeout(() => setShowHint(false), 3000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!containerRef.current || !imageUrl) return

    // For now, use a simple image with drag-to-pan effect
    // In production, integrate Pannellum.js for true panoramic viewing
    setIsLoading(true)

    const img = new Image()
    img.onload = () => {
      setIsLoading(false)
      onLoad?.()
    }
    img.onerror = () => {
      setIsLoading(false)
    }
    img.src = imageUrl

    return () => {
      // Cleanup
    }
  }, [imageUrl, onLoad])

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden bg-card cursor-move",
        className
      )}
      style={{
        backgroundImage: isLoading ? 'none' : `url(${imageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Gradient overlay for better UI visibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-background/40 pointer-events-none" />

      {/* Loading state */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-card"
          >
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pan instruction hint */}
      <AnimatePresence>
        {showHint && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-black/60 backdrop-blur-sm rounded-full text-sm text-white/80"
          >
            <Move className="w-4 h-4" />
            <span>Drag to pan around</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Placeholder for demo - replace with actual panorama viewer */}
      {!imageUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-neon-purple/20 to-neon-pink/20">
          <p className="text-muted-foreground">Panoramic screenshot will appear here</p>
        </div>
      )}
    </div>
  )
}
