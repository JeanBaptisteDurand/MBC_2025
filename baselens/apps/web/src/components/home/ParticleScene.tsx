import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import ParticleRing from './ParticleRing';

export default function ParticleScene() {
  return (
    <div className="absolute inset-0 w-full h-full">
      <Canvas
        camera={{ position: [0, 2, 8], fov: 60 }}
        gl={{ 
          antialias: true,
          alpha: true,
        }}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={null}>
          {/* Ambient lighting */}
          <ambientLight intensity={0.2} />
          
          {/* Main particle ring - primary color */}
          <ParticleRing 
            count={3000} 
            radius={3.5} 
            color="#60a5fa" 
            size={0.015}
          />
          
          {/* Secondary particle ring - accent color */}
          <ParticleRing 
            count={1500} 
            radius={4.2} 
            color="#a78bfa" 
            size={0.012}
          />
          
          {/* Inner glow particles */}
          <ParticleRing 
            count={800} 
            radius={2.8} 
            color="#38bdf8" 
            size={0.02}
          />
          
          {/* Subtle orbit controls - disabled for now to keep focus on content */}
          <OrbitControls 
            enableZoom={false}
            enablePan={false}
            enableRotate={false}
            autoRotate
            autoRotateSpeed={0.3}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
