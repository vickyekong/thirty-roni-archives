import { Center, Environment, Lightformer, Text3D } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { DPR } from '../support'
import digits from './cormorant-digits.typeface.json'

const GOLD = new THREE.Color('#d8bd86')

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function Particles({ count, still }: { count: number; still: boolean }) {
  const ref = useRef<THREE.Points>(null)
  const geometry = useMemo(() => {
    const rand = seeded(1996)
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rand() - 0.5) * 22
      positions[i * 3 + 1] = (rand() - 0.5) * 14
      positions[i * 3 + 2] = (rand() - 0.5) * 10 - 2
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return g
  }, [count])

  useFrame((_, delta) => {
    if (still || !ref.current) return
    ref.current.rotation.y += delta * 0.012
    ref.current.rotation.x += delta * 0.004
  })

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        size={0.035}
        color={GOLD}
        transparent
        opacity={0.75}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  )
}

/** The champagne-gold "30". Rises into place when `formed` turns true. */
function Thirty({ formed, still }: { formed: boolean; still: boolean }) {
  const group = useRef<THREE.Group>(null)
  const material = useRef<THREE.MeshStandardMaterial>(null)
  const progress = useRef(still && formed ? 1 : 0)
  const { viewport, invalidate } = useThree()
  // Fit the numerals to the top half of the screen, as the HTML layout expects.
  const scale = Math.min(viewport.width * 0.2, viewport.height * 0.26)

  useEffect(() => invalidate(), [formed, invalidate])

  useFrame((state, delta) => {
    const g = group.current
    if (!g) return
    const target = formed ? 1 : 0
    progress.current = still ? target : THREE.MathUtils.damp(progress.current, target, 2.2, delta)
    const p = progress.current
    g.scale.setScalar(scale * (0.85 + 0.15 * p))
    g.position.y = viewport.height * 0.11 - (1 - p) * 0.6
    g.rotation.y = still ? 0 : (1 - p) * -0.9 + Math.sin(state.clock.elapsedTime * 0.35) * 0.12 * p
    if (material.current) material.current.opacity = p
    g.visible = p > 0.01
  })

  return (
    <group ref={group} visible={false}>
      <Center>
        <Text3D font={digits as never} size={1.6} height={0.38} curveSegments={10} bevelEnabled bevelThickness={0.05} bevelSize={0.025} bevelSegments={3} letterSpacing={0.04}>
          30
          <meshStandardMaterial ref={material} color="#f3dcae" metalness={1} roughness={0.2} envMapIntensity={1.5} transparent opacity={0} />
        </Text3D>
      </Center>
    </group>
  )
}

export default function OpeningScene({ formed, still }: { formed: boolean; still: boolean }) {
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640
  return (
    <Canvas
      dpr={DPR}
      camera={{ position: [0, 0, 8], fov: 40 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      frameloop={still ? 'demand' : 'always'}
      aria-hidden="true"
      className="!absolute inset-0"
    >
      <ambientLight intensity={0.25} />
      <directionalLight position={[4, 5, 6]} intensity={2.2} color="#fff1d6" />
      <pointLight position={[-5, -2, 4]} intensity={18} color="#b0705f" />
      <Particles count={narrow ? 700 : 1600} still={still} />
      <Suspense fallback={null}>
        <Thirty formed={formed} still={still} />
        {/* Rendered once into a cube map, locally: no HDR files are downloaded. */}
        <Environment resolution={128} frames={1}>
          <color attach="background" args={['#2a1f22']} />
          {/* Softbox behind the camera: what the flat faces of the numerals reflect. */}
          <Lightformer form="rect" intensity={1.6} color="#e9c98f" position={[0, 0.5, 10]} scale={[16, 7, 1]} />
          <Lightformer form="rect" intensity={6} color="#fff4e0" position={[0, 4, 5]} scale={[10, 2.5, 1]} />
          <Lightformer form="rect" intensity={3} color="#f1d9a8" position={[-6, 0, 3]} scale={[3, 8, 1]} />
          <Lightformer form="rect" intensity={2.5} color="#ffe9c4" position={[6, 1, 3]} scale={[3, 8, 1]} />
          <Lightformer form="ring" intensity={4} color="#ffe2b0" position={[3, -3, 4]} scale={2.5} />
          <Lightformer form="rect" intensity={1.5} color="#b0705f" position={[0, -5, 2]} scale={[10, 2, 1]} />
        </Environment>
      </Suspense>
    </Canvas>
  )
}
