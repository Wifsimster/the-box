import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { CubeBackground } from '@/components/backgrounds/CubeBackground'

interface PageHeroProps {
  icon?: LucideIcon
  logo?: string
  iconStyle?: 'gradient' | 'simple'
  title: string
  subtitle?: string
  children?: React.ReactNode
}

export function PageHero({ icon: Icon, logo, iconStyle = 'gradient', title, subtitle, children }: PageHeroProps) {
  return (
    <>
      <CubeBackground />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 md:py-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-6 sm:mb-8 md:mb-12"
        >
          {logo ? (
            <motion.img
              src={logo}
              alt=""
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 mb-4 sm:mb-5 md:mb-6 mx-auto"
            />
          ) : Icon && iconStyle === 'simple' ? (
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 mb-4 sm:mb-5 md:mb-6"
            >
              <Icon className="w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 text-white" />
            </motion.div>
          ) : Icon ? (
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 mb-4 sm:mb-5 md:mb-6 rounded-xl sm:rounded-2xl bg-linear-to-br from-neon-purple to-neon-pink shadow-lg shadow-neon-purple/30"
            >
              <Icon className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-white" />
            </motion.div>
          ) : null}

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-3 sm:mb-4 px-2 sm:px-0 bg-linear-to-r from-neon-purple via-neon-pink to-neon-cyan bg-clip-text text-transparent">
            {title}
          </h1>

          {subtitle && (
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto px-4 sm:px-6 md:px-0">
              {subtitle}
            </p>
          )}
        </motion.div>

        {children}
      </div>
    </>
  )
}
