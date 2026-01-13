import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface SwipeHintProps {
    onDismiss?: () => void
    autoHideDelay?: number
}

export function SwipeHint({ onDismiss, autoHideDelay = 3000 }: SwipeHintProps) {
    const [isVisible, setIsVisible] = useState(true)

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsVisible(false)
            onDismiss?.()
        }, autoHideDelay)

        return () => clearTimeout(timer)
    }, [autoHideDelay, onDismiss])

    const handleInteraction = () => {
        setIsVisible(false)
        onDismiss?.()
    }

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
                    onClick={handleInteraction}
                    onTouchStart={handleInteraction}
                >
                    <div className="flex items-center gap-4 text-white/70">
                        <motion.div
                            animate={{ x: [-20, 0, -20] }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        >
                            <ChevronLeft className="w-8 h-8" />
                        </motion.div>
                        <div className="text-sm font-medium">Swipe to navigate</div>
                        <motion.div
                            animate={{ x: [20, 0, 20] }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        >
                            <ChevronRight className="w-8 h-8" />
                        </motion.div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
