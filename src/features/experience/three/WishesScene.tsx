import { Line } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { POINTS, STROKES } from '../constellation'
import { DPR } from '../support'

export type StarState = { index: number; lit: boolean; final: boolean }

function glowTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,240,210,1)')
  g.addColorStop(0.25, 'rgba(232,200,140,0.55)')
  g.addColorStop(1, 'rgba(232,200,140,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

function Star({
  star,
  selected,
  texture,
  still,
  onSelect,
}: {
  star: StarState
  selected: boolean
  texture: THREE.Texture
  still: boolean
  onSelect: (index: number) => void
}) {
  const sprite = useRef<THREE.Sprite>(null)
  const [hover, setHover] = useState(false)
  const [x, y] = POINTS[star.index - 1]!
  const base = star.final ? 0.75 : star.lit ? 0.48 : 0.16

  useFrame((state) => {
    const s = sprite.current
    if (!s) return
    const pulse = still || !star.lit ? 1 : 1 + Math.sin(state.clock.elapsedTime * 1.4 + star.index * 1.7) * 0.12
    const boost = selected ? 1.7 : hover ? 1.35 : 1
    s.scale.setScalar(base * pulse * boost)
  })

  return (
    <group position={[x, y, 0]}>
      <sprite ref={sprite} scale={base}>
        <spriteMaterial
          map={texture}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={star.lit ? 1 : 0.35}
          color={star.final ? '#fff1cc' : star.lit ? '#f2d6a0' : '#a9a39c'}
        />
      </sprite>
      {star.lit && (
        <mesh
          onClick={(e) => {
            e.stopPropagation()
            onSelect(star.index)
          }}
          onPointerOver={(e) => {
            e.stopPropagation()
            setHover(true)
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            setHover(false)
            document.body.style.cursor = ''
          }}
        >
          <circleGeometry args={[0.26, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

function Backdrop({ still }: { still: boolean }) {
  const ref = useRef<THREE.Points>(null)
  const geometry = useMemo(() => {
    let s = 3012
    const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    const positions = new Float32Array(900 * 3)
    for (let i = 0; i < 900; i++) {
      positions[i * 3] = (rand() - 0.5) * 24
      positions[i * 3 + 1] = (rand() - 0.5) * 14
      positions[i * 3 + 2] = -2 - rand() * 8
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return g
  }, [])
  useFrame((_, delta) => {
    if (!still && ref.current) ref.current.rotation.z += delta * 0.006
  })
  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial size={0.03} color="#e4ddd0" transparent opacity={0.5} depthWrite={false} sizeAttenuation />
    </points>
  )
}

function Constellation({
  stars,
  selected,
  still,
  onSelect,
}: {
  stars: StarState[]
  selected: number | null
  still: boolean
  onSelect: (index: number) => void
}) {
  const group = useRef<THREE.Group>(null)
  const texture = useMemo(() => glowTexture(), [])
  const { viewport, invalidate } = useThree()
  const fit = Math.min(1, viewport.width / 6, viewport.height / 4.6)

  useEffect(() => () => texture.dispose(), [texture])
  useEffect(() => invalidate(), [selected, stars, invalidate])

  useFrame((state) => {
    const g = group.current
    if (!g || still) return
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, state.pointer.x * 0.18, 0.04)
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, -state.pointer.y * 0.12, 0.04)
  })

  const strokes = STROKES.map((pts) => pts.map(([x, y]) => new THREE.Vector3(x, y, 0)))

  return (
    <group ref={group} scale={fit}>
      {strokes.map((pts, i) => (
        <Line key={i} points={pts} color="#c6a66b" transparent opacity={0.18} lineWidth={1} />
      ))}
      {stars.map((s) => (
        <Star key={s.index} star={s} selected={selected === s.index} texture={texture} still={still} onSelect={onSelect} />
      ))}
    </group>
  )
}

export default function WishesScene(props: {
  stars: StarState[]
  selected: number | null
  still: boolean
  onSelect: (index: number) => void
}) {
  useEffect(() => () => void (document.body.style.cursor = ''), [])
  return (
    <Canvas
      dpr={DPR}
      camera={{ position: [0, 0, 7], fov: 40 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      frameloop={props.still ? 'demand' : 'always'}
      aria-hidden="true"
      className="!absolute inset-0"
    >
      <Backdrop still={props.still} />
      <Constellation {...props} />
    </Canvas>
  )
}
