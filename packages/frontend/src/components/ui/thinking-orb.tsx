import { ThinkingOrb as BaseThinkingOrb } from 'thinking-orbs'
import type { ThinkingOrbProps } from 'thinking-orbs'

export type { OrbState, OrbSize } from 'thinking-orbs'

export function ThinkingOrb({ theme = 'dark', ...props }: ThinkingOrbProps) {
  return <BaseThinkingOrb theme={theme} {...props} />
}
