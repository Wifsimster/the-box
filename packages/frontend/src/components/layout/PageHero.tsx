import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { CubeBackground } from '@/components/backgrounds/CubeBackground'

interface PageHeroProps {
  icon: LucideIcon
  title: string
  subtitle?: string
  children?: React.ReactNode
}

export function PageHero({ icon: Icon, title, subtitle, children }: PageHeroProps) {
  return (
    <>
      <CubeBackground />
      <div className="container mx-auto px-4 py-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="inline-flex items-center justify-center w-24 h-24 mb-6 rounded-2xl bg-linear-to-br from-neon-purple to-neon-pink shadow-lg shadow-neon-purple/30"
          >
            <Icon className="w-12 h-12 text-white" />
          </motion.div>

          <h1 className="text-5xl font-bold mb-4 bg-linear-to-r from-neon-purple via-neon-pink to-neon-cyan bg-clip-text text-transparent">
            {title}
          </h1>

          {subtitle && (
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              {subtitle}
            </p>
          )}
        </motion.div>

        {children}
      </div>
    </>
  )
}
