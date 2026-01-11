import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Users, Copy, Check, RotateCcw, Play, LogOut, Crown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { usePartyStore } from '@/stores/partyStore'
import { useSession } from '@/lib/auth-client'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { cn } from '@/lib/utils'

export default function PartyPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: session } = useSession()
  const { localizedPath } = useLocalizedPath()

  const {
    party,
    partyCode,
    isHost,
    isInParty,
    isGameStarted,
    leaderboard,
    error,
    isLoading,
    createParty,
    joinParty,
    leaveParty,
    startGame,
    resetGame,
    initializeListeners,
  } = usePartyStore()

  const [joinCode, setJoinCode] = useState('')
  const [copied, setCopied] = useState(false)

  // Initialize socket listeners
  useEffect(() => {
    const cleanup = initializeListeners()
    return cleanup
  }, [initializeListeners])

  // Redirect if not logged in
  useEffect(() => {
    if (!session) {
      navigate(localizedPath('/login') + '?redirect=' + encodeURIComponent(localizedPath('/multiplayer')))
    }
  }, [session, navigate, localizedPath])

  const username = session?.user?.name || session?.user?.username || 'Player'

  const handleCreateParty = () => {
    createParty(username)
  }

  const handleJoinParty = () => {
    if (joinCode.trim()) {
      joinParty(joinCode.trim(), username)
    }
  }

  const handleCopyCode = async () => {
    if (partyCode) {
      await navigator.clipboard.writeText(partyCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleStartGame = () => {
    // For now, start with challenge ID 1 (you can make this dynamic)
    startGame(1)
  }

  const handleLeaveParty = () => {
    leaveParty()
  }

  // If in party and game started, could redirect to game
  // For now, just show the party lobby

  if (!session) {
    return null
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">Mode Multijoueur</h1>
          <p className="text-muted-foreground">
            Jouez avec vos amis en temps reel
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-destructive text-center">
            {error}
          </div>
        )}

        {!isInParty ? (
          // Not in a party - show create/join options
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Creer une partie
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Creez une partie et invitez vos amis avec le code
                </p>
                <Button
                  onClick={handleCreateParty}
                  disabled={isLoading}
                  className="w-full"
                  variant="gaming"
                >
                  {isLoading ? 'Creation...' : 'Creer une partie'}
                </Button>
              </CardContent>
            </Card>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">ou</span>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Rejoindre une partie</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  placeholder="Code de la partie (ex: ABC123)"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="text-center text-lg tracking-widest font-mono"
                />
                <Button
                  onClick={handleJoinParty}
                  disabled={isLoading || joinCode.length < 6}
                  className="w-full"
                >
                  {isLoading ? 'Connexion...' : 'Rejoindre'}
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          // In a party - show lobby
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Salon de jeu
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLeaveParty}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <LogOut className="w-4 h-4 mr-1" />
                  Quitter
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Party Code */}
              <div className="bg-muted/50 rounded-lg p-4 text-center">
                <p className="text-sm text-muted-foreground mb-2">Code de la partie</p>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-3xl font-mono font-bold tracking-widest">
                    {partyCode}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopyCode}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Members List */}
              <div>
                <h3 className="text-sm font-medium mb-3">
                  Joueurs ({party?.members.length || 0})
                </h3>
                <div className="space-y-2">
                  {party?.members.map((member) => (
                    <div
                      key={member.socketId}
                      className={cn(
                        'flex items-center justify-between p-3 rounded-lg',
                        member.isHost ? 'bg-primary/10 border border-primary/30' : 'bg-muted/50'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {member.isHost && <Crown className="w-4 h-4 text-yellow-500" />}
                        <span className="font-medium">{member.username}</span>
                      </div>
                      {member.isHost && (
                        <span className="text-xs text-muted-foreground">Admin</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Leaderboard (if game has scores) */}
              {leaderboard.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3">Classement</h3>
                  <div className="space-y-1">
                    {leaderboard.map((entry, index) => (
                      <div
                        key={entry.username}
                        className="flex items-center justify-between p-2 rounded bg-muted/30"
                      >
                        <span className="text-sm">
                          {index + 1}. {entry.username}
                        </span>
                        <span className="font-bold">{entry.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Host Controls */}
              {isHost && (
                <div className="border-t pt-4 space-y-3">
                  <p className="text-xs text-muted-foreground text-center">
                    Vous etes l'administrateur de cette partie
                  </p>

                  {!isGameStarted ? (
                    <Button
                      onClick={handleStartGame}
                      className="w-full"
                      variant="gaming"
                      disabled={!party || party.members.length < 1}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Lancer la partie
                    </Button>
                  ) : (
                    <Button
                      onClick={resetGame}
                      className="w-full"
                      variant="outline"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Recommencer la partie
                    </Button>
                  )}
                </div>
              )}

              {/* Non-host waiting message */}
              {!isHost && !isGameStarted && (
                <div className="text-center text-muted-foreground text-sm">
                  En attente du lancement par l'administrateur...
                </div>
              )}

              {/* Game started indicator */}
              {isGameStarted && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
                  <p className="text-green-500 font-medium">Partie en cours!</p>
                  <Button
                    onClick={() => navigate(localizedPath('/play'))}
                    className="mt-2"
                    variant="gaming"
                  >
                    Rejoindre le jeu
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </motion.div>
    </div>
  )
}
