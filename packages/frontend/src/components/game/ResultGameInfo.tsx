import { m } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { Game } from '@the-box/types'

interface ResultGameInfoProps {
  game: Game
  isCorrect: boolean
  userGuess: string | null
}

/**
 * Presentational block for the revealed game: cover image, title, release
 * year / metascore, publisher / developer, and the user's wrong guess.
 */
export function ResultGameInfo({ game, isCorrect, userGuess }: ResultGameInfoProps) {
  const { t } = useTranslation()

  return (
    <>
      {/* Game Cover Image */}
      <m.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="relative w-40 h-52 mx-auto mb-4 rounded-xl overflow-hidden shadow-xl ring-2 ring-white/10"
      >
        {game.coverImageUrl ? (
          <img
            src={game.coverImageUrl}
            alt={game.name}
            className="size-full object-cover"
          />
        ) : (
          <div className="size-full flex items-center justify-center bg-linear-to-br from-neon-purple/30 to-neon-pink/30">
            <span className="text-4xl font-bold">{game.name[0]}</span>
          </div>
        )}
      </m.div>

      {/* Game Title */}
      <m.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="text-xl font-bold text-center mb-2 line-clamp-2"
      >
        {game.name}
      </m.h2>

      {/* Game Details (Release Year and Metascore) */}
      {(game.releaseYear || game.metacritic != null) && (
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-center gap-4 text-sm text-muted-foreground mb-4"
        >
          {game.releaseYear && (
            <span>{t('game.releaseYear')}: <span className="text-foreground font-medium">{game.releaseYear}</span></span>
          )}
          {game.metacritic != null && (
            <span className={cn(
              "font-medium",
              game.metacritic >= 75 ? "text-score-high" :
                game.metacritic >= 50 ? "text-score-mid" :
                  "text-score-low"
            )}>
              {t('game.metascore')}: {game.metacritic}
            </span>
          )}
        </m.div>
      )}

      {/* Publisher and Developer */}
      {(game.publisher || game.developer) && (
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="flex flex-col items-center gap-1 text-xs text-muted-foreground mb-4"
        >
          {game.publisher && (
            <span>{t('game.publisher')}: <span className="text-foreground font-medium">{game.publisher}</span></span>
          )}
          {game.developer && (
            <span>{t('game.developer')}: <span className="text-foreground font-medium">{game.developer}</span></span>
          )}
        </m.div>
      )}

      {/* User's wrong guess */}
      {!isCorrect && userGuess && (
        <m.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center text-sm text-muted-foreground mb-4"
        >
          {t('game.yourGuess')}: <span className="text-error line-through">{userGuess}</span>
        </m.p>
      )}
    </>
  )
}
