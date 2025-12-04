import { Suspense, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import ParticleRing from './ParticleRing';
import CenterOrb from './CenterOrb';

interface CameraControllerProps {
  scrollProgress: number;
}

// Easing functions for different animation curves
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

function easeInQuad(t: number): number {
  return t * t;
}

// Camera controller component that runs inside Canvas
function CameraController({ scrollProgress }: CameraControllerProps) {
  const { camera } = useThree();
  
  // Store current interpolated values for smooth lerping
  const currentValues = useRef({
    x: 3,
    y: 3.5,
    z: 6,
    fov: 50,
  });
  
  // Use useFrame for smooth per-frame interpolation
  useFrame(() => {
    // Starting position: slightly above and to the side of the ring
    const startX = 3;
    const startY = 3.5;
    const startZ = 6;
    
    // Ending position: inside the ring, centered
    const endX = 0;
    const endY = 0.3;
    const endZ = 0;
    
    // Starting FOV: 50 - normal view
    // Ending FOV: 120 - wider view when inside
    const startFov = 50;
    const endFov = 120;
    
    // Apply different easing curves for different axes to create the curved trajectory
    // X and Z move quickly at first (ease out) - approach center early
    const xzProgress = easeOutQuart(scrollProgress);
    
    // Y drops slowly at first, then accelerates (ease in) - drop down later
    const yProgress = easeInQuad(scrollProgress);
    
    // FOV changes with a balanced easing
    const fovProgress = easeOutCubic(scrollProgress);
    
    // Calculate target values with different easing per axis
    const targetX = startX + (endX - startX) * xzProgress;
    const targetY = startY + (endY - startY) * yProgress;
    const targetZ = startZ + (endZ - startZ) * xzProgress;
    const targetFov = startFov + (endFov - startFov) * fovProgress;
    
    // Lerp factor - lower = smoother/slower transition
    const lerpFactor = 0.04;
    
    // Smoothly interpolate current values toward target values
    currentValues.current.x += (targetX - currentValues.current.x) * lerpFactor;
    currentValues.current.y += (targetY - currentValues.current.y) * lerpFactor;
    currentValues.current.z += (targetZ - currentValues.current.z) * lerpFactor;
    currentValues.current.fov += (targetFov - currentValues.current.fov) * lerpFactor;
    
    // Apply interpolated values to camera
    camera.position.set(currentValues.current.x, currentValues.current.y, currentValues.current.z);
    (camera as THREE.PerspectiveCamera).fov = currentValues.current.fov;
    camera.updateProjectionMatrix();
    
    // Keep camera looking at the center of the ring
    camera.lookAt(0, 0, 0);
  });
  
  return null;
}

import * as THREE from 'three';

interface ParticleSceneProps {
  scrollProgress?: number;
}

export default function ParticleScene({ scrollProgress = 0 }: ParticleSceneProps) {
  return (
    <div className="absolute inset-0 w-full h-full">
      <Canvas
        camera={{ position: [3, 3.5, 6], fov: 50 }}
        gl={{ 
          antialias: true,
          alpha: true,
        }}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={null}>
          {/* Camera controller for scroll effect */}
          <CameraController scrollProgress={scrollProgress} />
          
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
          
          {/* Center orb that morphs into logo */}
          <CenterOrb scrollProgress={scrollProgress} />
          
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
