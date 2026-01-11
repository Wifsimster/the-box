import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import type { Mesh } from 'three'

function RotatingCube() {
  const meshRef = useRef<Mesh>(null)

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.15
      meshRef.current.rotation.y += delta * 0.1
    }
  })

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[2.5, 2.5, 2.5]} />
      <meshBasicMaterial color="#ffffff" wireframe />
    </mesh>
  )
}

export function CubeBackground() {
  return (
    <div className="fixed inset-0 z-0 bg-black">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 50 }}
        style={{ background: 'black' }}
      >
        <RotatingCube />
      </Canvas>
    </div>
  )
}
