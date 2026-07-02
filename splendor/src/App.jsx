import React, { useRef, useState, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Sphere, MeshDistortMaterial, Torus } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import OracleInterface from './components/OracleInterface'
import LoginCard from './components/LoginCard'
import VersionTag from './components/VersionTag'
import { supabase } from './lib/supabaseClient'
import './App.css'

const NeuralCore = ({ systemState = 'idle' }) => {
  const coreGroupRef = useRef()
  const ring1Ref = useRef()
  const ring2Ref = useRef()
  const ring3Ref = useRef()
  const ring4Ref = useRef()
  const innerNetworkRef = useRef()
  const outerShell1Ref = useRef()
  const outerShell2Ref = useRef()
  const outerShell3Ref = useRef()
  const particleGroupRef = useRef()

  // Create particle positions
  const particleCount = 60
  const particles = Array.from({ length: particleCount }, (_, i) => {
    const angle = (i / particleCount) * Math.PI * 2
    const radius = 2 + Math.sin(i * 0.5) * 0.5
    const height = Math.sin(i * 0.3) * 0.8
    return { angle, radius, height, speed: 0.5 + Math.random() * 0.5 }
  })

  useFrame((state) => {
    const t = state.clock.getElapsedTime()

    // System state-based variables
    const stateMultiplier = systemState === 'listening' ? 2 :
                           systemState === 'thinking' ? 1.5 :
                           systemState === 'memory_retrieval' ? 1.8 :
                           systemState === 'uncertain' ? 0.7 : 1

    // Complex intersecting orbital rings with state responsiveness
    if (ring1Ref.current) {
      ring1Ref.current.rotation.x = t * 0.4 * stateMultiplier
      ring1Ref.current.rotation.z = t * 0.2 * stateMultiplier
    }

    if (ring2Ref.current) {
      ring2Ref.current.rotation.y = t * 0.5 * stateMultiplier
      ring2Ref.current.rotation.z = -t * 0.3 * stateMultiplier
    }

    if (ring3Ref.current) {
      ring3Ref.current.rotation.x = -t * 0.3 * stateMultiplier
      ring3Ref.current.rotation.y = t * 0.4 * stateMultiplier
    }

    if (ring4Ref.current) {
      ring4Ref.current.rotation.z = t * 0.6 * stateMultiplier
      ring4Ref.current.rotation.x = t * 0.2 * stateMultiplier
    }

    // Energy shell animations
    if (outerShell1Ref.current) {
      const pulse = 1 + Math.sin(t * 1.5) * 0.05
      outerShell1Ref.current.scale.setScalar(pulse)
      outerShell1Ref.current.rotation.y = t * 0.1
    }

    if (outerShell2Ref.current) {
      const pulse = 1 + Math.sin(t * 2.2 + Math.PI / 3) * 0.08
      outerShell2Ref.current.scale.setScalar(pulse)
      outerShell2Ref.current.rotation.x = t * 0.15
    }

    if (outerShell3Ref.current) {
      const pulse = 1 + Math.sin(t * 0.8 + Math.PI * 2 / 3) * 0.06
      outerShell3Ref.current.scale.setScalar(pulse)
      outerShell3Ref.current.rotation.z = t * 0.08
    }

    // Neural network core with state-based intensity
    if (innerNetworkRef.current) {
      const basePulse = 1 + Math.sin(t * 2) * 0.1
      const statePulse = systemState === 'thinking' ? 1.2 :
                       systemState === 'listening' ? 1.15 : 1
      innerNetworkRef.current.scale.setScalar(basePulse * statePulse)
      innerNetworkRef.current.rotation.y = t * 0.1 * stateMultiplier
    }

    // Particle system orbital motion
    if (particleGroupRef.current) {
      particleGroupRef.current.children.forEach((particle, i) => {
        const particleData = particles[i]
        const orbitTime = t * particleData.speed
        const x = Math.cos(particleData.angle + orbitTime) * particleData.radius
        const z = Math.sin(particleData.angle + orbitTime) * particleData.radius
        const y = Math.sin(orbitTime * 2) * particleData.height

        particle.position.set(x, y, z)
        particle.rotation.y = orbitTime
      })
    }

    // Whole system gentle floating
    if (coreGroupRef.current) {
      coreGroupRef.current.position.y = Math.sin(t * 0.6) * 0.1
      coreGroupRef.current.rotation.y = t * 0.05
    }
  })

  // State-based colors
  const stateColors = {
    idle: { primary: "#00e5ff", secondary: "#4ff0b7" },
    listening: { primary: "#39ff14", secondary: "#00f5d4" },
    thinking: { primary: "#bf5af2", secondary: "#ff6b9d" },
    memory_retrieval: { primary: "#00e5ff", secondary: "#ffd700" },
    uncertain: { primary: "#ff9800", secondary: "#ff6b35" },
    conflict: { primary: "#ff073a", secondary: "#ff4757" }
  }

  const colors = stateColors[systemState] || stateColors.idle

  return (
    <group ref={coreGroupRef}>
      {/* Enhanced Lighting Setup */}
      <ambientLight intensity={0.15} color="#0a1a2a" />
      <pointLight position={[0, 0, 0]} color={colors.primary} intensity={4} />
      <pointLight position={[5, 5, 5]} color={colors.secondary} intensity={2.5} />
      <pointLight position={[-5, -5, -5]} color="#bf5af2" intensity={1.8} />
      <pointLight position={[0, 8, 0]} color="#00f5d4" intensity={1.5} />
      <pointLight position={[0, -8, 0]} color="#ff6b9d" intensity={1} />

      {/* Multiple Energy Shells */}
      <Sphere ref={outerShell3Ref} args={[2.2, 32, 32]}>
        <meshStandardMaterial
          color={colors.primary}
          emissive={colors.primary}
          emissiveIntensity={0.3}
          transparent
          opacity={0.04}
          wireframe
        />
      </Sphere>

      <Sphere ref={outerShell2Ref} args={[1.8, 24, 24]}>
        <meshStandardMaterial
          color={colors.secondary}
          emissive={colors.secondary}
          emissiveIntensity={0.4}
          transparent
          opacity={0.06}
          wireframe
        />
      </Sphere>

      <Sphere ref={outerShell1Ref} args={[1.4, 20, 20]}>
        <meshStandardMaterial
          color={colors.primary}
          emissive={colors.primary}
          emissiveIntensity={0.6}
          transparent
          opacity={0.08}
          wireframe
        />
      </Sphere>

      {/* Particle Stream System */}
      <group ref={particleGroupRef}>
        {particles.map((_, i) => (
          <Sphere key={i} args={[0.02, 6, 6]}>
            <meshStandardMaterial
              color={colors.secondary}
              emissive={colors.secondary}
              emissiveIntensity={2}
            />
          </Sphere>
        ))}
      </group>

      {/* Complex Neural Network Core */}
      <group ref={innerNetworkRef}>
        {/* Central Brain-like Structure */}
        <Sphere args={[1.0, 32, 32]}>
          <MeshDistortMaterial
            color={colors.primary}
            speed={systemState === 'thinking' ? 4 : 2}
            distort={systemState === 'uncertain' ? 1.2 : 0.8}
            radius={0.8}
            emissive={colors.secondary}
            emissiveIntensity={1.4}
            transparent
            opacity={0.75}
          />
        </Sphere>

        {/* Inner Neural Pathways */}
        <Sphere args={[0.8, 16, 16]} scale={[1.3, 0.7, 1.1]}>
          <MeshDistortMaterial
            color={colors.secondary}
            speed={systemState === 'thinking' ? 6 : 4}
            distort={1.2}
            radius={0.6}
            emissive={colors.primary}
            emissiveIntensity={0.9}
            transparent
            opacity={0.45}
          />
        </Sphere>

        {/* Core Consciousness Sphere */}
        <Sphere args={[0.5, 24, 24]}>
          <meshStandardMaterial
            color="#ffffff"
            emissive={colors.primary}
            emissiveIntensity={2.5}
            transparent
            opacity={0.95}
          />
        </Sphere>

        {/* Neural Connection Nodes */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i / 12) * Math.PI * 2
          const radius = 0.6 + Math.sin(i) * 0.2
          const x = Math.cos(angle) * radius
          const y = Math.sin(angle * 1.3) * radius * 0.5
          const z = Math.sin(angle) * radius

          return (
            <Sphere key={i} args={[0.06, 8, 8]} position={[x, y, z]}>
              <meshStandardMaterial
                color={colors.secondary}
                emissive={colors.secondary}
                emissiveIntensity={3.5}
              />
            </Sphere>
          )
        })}
      </group>

      {/* Complex Intersecting Orbital Rings */}

      {/* Primary Cyan Ring - Vertical */}
      <Torus
        ref={ring1Ref}
        args={[2.8, 0.02, 16, 100]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial
          color="#00e5ff"
          emissive="#00e5ff"
          emissiveIntensity={4}
          transparent
          opacity={0.9}
        />
      </Torus>

      {/* Secondary Purple Ring - Diagonal */}
      <Torus
        ref={ring2Ref}
        args={[3.2, 0.025, 16, 100]}
        rotation={[Math.PI / 4, Math.PI / 3, 0]}
        scale={[1, 0.8, 1]}
      >
        <meshStandardMaterial
          color="#bf5af2"
          emissive="#bf5af2"
          emissiveIntensity={3}
          transparent
          opacity={0.7}
        />
      </Torus>

      {/* Tertiary Green Ring - Horizontal */}
      <Torus
        ref={ring3Ref}
        args={[3.6, 0.02, 16, 100]}
        rotation={[0, Math.PI / 6, Math.PI / 4]}
        scale={[1.2, 0.6, 1.2]}
      >
        <meshStandardMaterial
          color="#4ff0b7"
          emissive="#4ff0b7"
          emissiveIntensity={2.5}
          transparent
          opacity={0.6}
        />
      </Torus>

      {/* Quaternary Teal Ring - Complex Angle */}
      <Torus
        ref={ring4Ref}
        args={[4.0, 0.015, 16, 100]}
        rotation={[Math.PI / 3, -Math.PI / 4, Math.PI / 6]}
        scale={[0.9, 1.1, 0.9]}
      >
        <meshStandardMaterial
          color="#00f5d4"
          emissive="#00f5d4"
          emissiveIntensity={2}
          transparent
          opacity={0.5}
        />
      </Torus>

      {/* Additional Inner Complexity Rings */}
      <Torus args={[1.8, 0.01, 16, 100]} rotation={[Math.PI / 6, Math.PI / 2, 0]}>
        <meshStandardMaterial
          color="#ff6b9d"
          emissive="#ff6b9d"
          emissiveIntensity={1.5}
          transparent
          opacity={0.3}
        />
      </Torus>

      <Torus args={[2.2, 0.008, 16, 100]} rotation={[-Math.PI / 4, 0, Math.PI / 3]}>
        <meshStandardMaterial
          color="#ffd700"
          emissive="#ffd700"
          emissiveIntensity={1}
          transparent
          opacity={0.2}
        />
      </Torus>
    </group>
  )
}

function App() {
  const [systemState, setSystemState] = useState('idle')
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession()
        setSession(initialSession)
      } catch (error) {
        console.error('Error getting initial session:', error)
      } finally {
        setAuthLoading(false)
      }
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log('Auth state change:', event, newSession?.user?.email)
      setSession(newSession)
      setAuthLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return (
    <div className="oracle-app">
      {/* Real Background Environment */}
      <div className="environment-background">
        <div className="environment-image"></div>
        <div className="environment-overlay"></div>
        <div className="sci-fi-overlay"></div>
        <div className="scanning-lines"></div>
        <div className="floating-particles"></div>
      </div>

      {/* CLASPION Header */}
      <div className="claspion-header">
        <div className="governance-info">
          <div className="governance-title">SPLENDOR THE REMARKABLE AI</div>
          <div className="binding-decisions">
            CLASPION GOVERNANCE • CURRENT BINDING DECISIONS: 1. TRUTH OVER COMFORT [RULE 001] <span className="rule-active">[ACTIVE]</span>
          </div>
        </div>
      </div>

      {/* 3D Neural Core Canvas */}
      <div className="neural-canvas">
        <Canvas camera={{ position: [0, 0, 6] }}>
          <NeuralCore systemState={systemState} />
          <EffectComposer>
            <Bloom
              intensity={systemState === 'thinking' ? 3 : systemState === 'listening' ? 2.5 : 2}
              luminanceThreshold={0}
              luminanceSmoothing={0.9}
            />
          </EffectComposer>
        </Canvas>
      </div>

      {/* Floating UI Overlay */}
      {!authLoading && (
        session ? (
          <OracleInterface onSystemStateChange={setSystemState} />
        ) : (
          <LoginCard onAuthStateChange={setSession} />
        )
      )}

      {/* Version Tag - Always Visible */}
      <VersionTag />
    </div>
  )
}

export default App