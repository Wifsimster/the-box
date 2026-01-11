import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ScreenshotViewerProps {
  imageUrl: string
  className?: string
  onLoad?: () => void
}

export function ScreenshotViewer({
  imageUrl,
  className,
  onLoad,
}: ScreenshotViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!containerRef.current || !imageUrl) return

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
        "relative overflow-hidden bg-card",
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

      {/* Placeholder when no image */}
      {!imageUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-neon-purple/20 to-neon-pink/20">
          <p className="text-muted-foreground">Screenshot will appear here</p>
        </div>
      )}
    </div>
  )
}
