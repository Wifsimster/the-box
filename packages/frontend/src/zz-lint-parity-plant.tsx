// Throwaway: proves CI lint fails on hooks + design-token violations. Reverted in the next commit.
import { useEffect, useState } from 'react'
export function PlantHooks() {
  const [x, setX] = useState(0)
  useEffect(() => {
    setX(1)
  }, [])
  return <div>{x}</div>
}
export function PlantCond({ on }: { on: boolean }) {
  if (on) useState(0)
  return <div className="bg-red-500" />
}
