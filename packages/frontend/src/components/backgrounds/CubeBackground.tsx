import { useRef, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

function RotatingCube() {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.05
      meshRef.current.rotation.y += delta * 0.03
    }
  })

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[2.2, 2.2, 2.2]} />
      <meshBasicMaterial color="#555555" wireframe opacity={0.25} transparent />
    </mesh>
  )
}

function Particles() {
  const pointsRef = useRef<THREE.Points>(null)
  const { pointer, viewport } = useThree()
  const particleCount = 200
  const mouseInfluenceRadius = 2
  const mouseRepelStrength = 0.15

  const [positions, velocities, originalPositions] = useMemo(() => {
    const pos = new Float32Array(particleCount * 3)
    const vel = new Float32Array(particleCount * 3)
    const orig = new Float32Array(particleCount * 3)

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3
      pos[i3] = (Math.random() - 0.5) * 15
      pos[i3 + 1] = (Math.random() - 0.5) * 15
      pos[i3 + 2] = (Math.random() - 0.5) * 10

      orig[i3] = pos[i3]
      orig[i3 + 1] = pos[i3 + 1]
      orig[i3 + 2] = pos[i3 + 2]

      vel[i3] = (Math.random() - 0.5) * 0.01
      vel[i3 + 1] = (Math.random() - 0.5) * 0.01
      vel[i3 + 2] = (Math.random() - 0.5) * 0.005
    }

    return [pos, vel, orig]
  }, [])

  useFrame(() => {
    if (pointsRef.current) {
      const posAttr = pointsRef.current.geometry.attributes.position
      const array = posAttr.array as Float32Array

      // Convert mouse to world coordinates
      const mouseX = (pointer.x * viewport.width) / 2
      const mouseY = (pointer.y * viewport.height) / 2

      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3

        // Calculate distance from mouse (in 2D, ignoring z)
        const dx = array[i3] - mouseX
        const dy = array[i3 + 1] - mouseY
        const dist = Math.sqrt(dx * dx + dy * dy)

        // Apply repulsion force if within influence radius
        if (dist < mouseInfluenceRadius && dist > 0.01) {
          const force = (1 - dist / mouseInfluenceRadius) * mouseRepelStrength
          const angle = Math.atan2(dy, dx)
          array[i3] += Math.cos(angle) * force
          array[i3 + 1] += Math.sin(angle) * force
        }

        // Apply base velocity
        array[i3] += velocities[i3]
        array[i3 + 1] += velocities[i3 + 1]
        array[i3 + 2] += velocities[i3 + 2]

        // Boundary check
        if (Math.abs(array[i3]) > 7.5) velocities[i3] *= -1
        if (Math.abs(array[i3 + 1]) > 7.5) velocities[i3 + 1] *= -1
        if (Math.abs(array[i3 + 2]) > 5) velocities[i3 + 2] *= -1
      }

      posAttr.needsUpdate = true
    }
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        color="#888888"
        transparent
        opacity={0.5}
        sizeAttenuation
      />
    </points>
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
        <Particles />
      </Canvas>
    </div>
  )
}
