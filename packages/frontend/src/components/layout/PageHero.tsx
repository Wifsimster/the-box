import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { CubeBackground } from '@/components/backgrounds/CubeBackground'
import { GradientIcon } from '@/components/ui/gradient-icon'

interface PageHeroProps {
  icon?: LucideIcon
  logo?: string
  iconStyle?: 'gradient' | 'simple'
  // 'cube' is the default brand visual; pages where conversion matters
  // more than vibe (e.g. /premium) opt out via 'none' to skip the ~875kB
  // three.js chunk.
  background?: 'cube' | 'none'
  title: string
  subtitle?: string
  children?: React.ReactNode
}

export function PageHero({
  icon: Icon,
  logo,
  iconStyle = 'gradient',
  background = 'cube',
  title,
  subtitle,
  children,
}: PageHeroProps) {
  return (
    <>
      {background === 'cube' && <CubeBackground />}
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
              className="size-16 sm:size-20 md:size-24 mb-4 sm:mb-5 md:mb-6 mx-auto"
            />
          ) : Icon && iconStyle === 'simple' ? (
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="inline-flex items-center justify-center size-16 sm:size-20 md:size-24 mb-4 sm:mb-5 md:mb-6"
            >
              <Icon className="size-10 sm:size-14 md:size-16 text-foreground" />
            </motion.div>
          ) : Icon ? (
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mb-4 sm:mb-5 md:mb-6"
            >
              <GradientIcon
                icon={<Icon className="size-8 sm:size-10 md:size-12 text-white" />}
                size="lg"
                className="size-16 sm:size-20 md:size-24 sm:rounded-2xl"
              />
            </motion.div>
          ) : null}

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-3 sm:mb-4 px-2 sm:px-0 gradient-gaming-title">
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
