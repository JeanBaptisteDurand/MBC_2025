import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

interface ParticleRingProps {
  count?: number;
  radius?: number;
  color?: string;
  size?: number;
}

export default function ParticleRing({ 
  count = 2000, 
  radius = 4, 
  color = '#60a5fa',
  size = 0.02
}: ParticleRingProps) {
  const pointsRef = useRef<THREE.Points>(null);

  // Generate particles in a ring/torus formation
  const [positions, speeds, offsets] = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const offsets = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Angle around the ring
      const angle = (i / count) * Math.PI * 2;
      
      // Add some variation to create a thicker ring
      const radiusVariation = radius + (Math.random() - 0.5) * 1.5;
      const heightVariation = (Math.random() - 0.5) * 0.8;
      
      const x = Math.cos(angle) * radiusVariation;
      const y = heightVariation;
      const z = Math.sin(angle) * radiusVariation;
      
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      
      // Random speed for each particle
      speeds[i] = 0.2 + Math.random() * 0.3;
      // Random offset for wave animation
      offsets[i] = Math.random() * Math.PI * 2;
    }

    return [positions, speeds, offsets];
  }, [count, radius]);

  // Animation loop
  useFrame((state) => {
    if (!pointsRef.current) return;

    const time = state.clock.elapsedTime;
    const positionArray = pointsRef.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const angle = (i / count) * Math.PI * 2 + time * speeds[i] * 0.2;
      
      // Base radius with wave effect
      const waveOffset = Math.sin(time * 0.5 + offsets[i]) * 0.3;
      const currentRadius = radius + waveOffset + (Math.random() - 0.5) * 0.02;
      
      // Height oscillation
      const heightWave = Math.sin(time * 0.3 + offsets[i] * 2) * 0.2;
      
      positionArray[i3] = Math.cos(angle) * currentRadius;
      positionArray[i3 + 1] = heightWave + (Math.sin(angle * 3 + time) * 0.1);
      positionArray[i3 + 2] = Math.sin(angle) * currentRadius;
    }

    pointsRef.current.geometry.attributes.position.needsUpdate = true;
    
    // Rotate the entire ring slowly
    pointsRef.current.rotation.y = time * 0.05;
    pointsRef.current.rotation.x = Math.sin(time * 0.1) * 0.1;
  });

  return (
    <Points ref={pointsRef} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color={color}
        size={size}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}
