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

function DigitalDust() {
  const pointsRef = useRef<THREE.Points>(null)
  const { pointer, viewport } = useThree()
  const particleCount = 600
  const mouseInfluenceRadius = 1.5
  const mouseRepelStrength = 0.08

  /* eslint-disable react-hooks/purity -- Initial particle positions need randomization, stable after mount */
  const [positions, velocities, sizes, phases] = useMemo(() => {
    const pos = new Float32Array(particleCount * 3)
    const vel = new Float32Array(particleCount * 3)
    const siz = new Float32Array(particleCount)
    const pha = new Float32Array(particleCount)

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3
      pos[i3] = (Math.random() - 0.5) * 20
      pos[i3 + 1] = (Math.random() - 0.5) * 16
      pos[i3 + 2] = (Math.random() - 0.5) * 8

      // Slower, more subtle movement
      vel[i3] = (Math.random() - 0.5) * 0.003
      vel[i3 + 1] = (Math.random() - 0.5) * 0.003
      vel[i3 + 2] = (Math.random() - 0.5) * 0.001

      // Varying sizes for dust effect
      siz[i] = Math.random() * 0.015 + 0.005

      // Random phase for twinkling
      pha[i] = Math.random() * Math.PI * 2
    }

    return [pos, vel, siz, pha]
  }, [])
  /* eslint-enable react-hooks/purity */

  useFrame((state) => {
    if (pointsRef.current) {
      const posAttr = pointsRef.current.geometry.attributes.position
      const sizeAttr = pointsRef.current.geometry.attributes.size
      const array = posAttr.array as Float32Array
      const sizeArray = sizeAttr.array as Float32Array
      const time = state.clock.elapsedTime

      const mouseX = (pointer.x * viewport.width) / 2
      const mouseY = (pointer.y * viewport.height) / 2

      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3

        // Mouse repulsion
        const dx = array[i3] - mouseX
        const dy = array[i3 + 1] - mouseY
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist < mouseInfluenceRadius && dist > 0.01) {
          const force = (1 - dist / mouseInfluenceRadius) * mouseRepelStrength
          const angle = Math.atan2(dy, dx)
          array[i3] += Math.cos(angle) * force
          array[i3 + 1] += Math.sin(angle) * force
        }

        // Drift movement
        array[i3] += velocities[i3]
        array[i3 + 1] += velocities[i3 + 1]
        array[i3 + 2] += velocities[i3 + 2]

        // Subtle floating motion
        array[i3 + 1] += Math.sin(time * 0.5 + phases[i]) * 0.001

        // Boundary wrap
        if (array[i3] > 10) array[i3] = -10
        if (array[i3] < -10) array[i3] = 10
        if (array[i3 + 1] > 8) array[i3 + 1] = -8
        if (array[i3 + 1] < -8) array[i3 + 1] = 8
        if (array[i3 + 2] > 4) array[i3 + 2] = -4
        if (array[i3 + 2] < -4) array[i3 + 2] = 4

        // Twinkle effect - subtle size variation
        sizeArray[i] = sizes[i] * (0.7 + 0.3 * Math.sin(time * 2 + phases[i]))
      }

      posAttr.needsUpdate = true
      sizeAttr.needsUpdate = true
    }
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-size"
          args={[sizes, 1]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.012}
        color="#667788"
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
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
        <DigitalDust />
      </Canvas>
    </div>
  )
}
