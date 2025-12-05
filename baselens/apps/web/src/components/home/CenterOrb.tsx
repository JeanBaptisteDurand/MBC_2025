import { useRef, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';

interface CenterOrbProps {
  scrollProgress: number;
}

// Create the spiked glow shape with curved inward lines - returns a Shape for filling
function createSpikedGlowShape(spikeLength: number, curveDepth: number): THREE.Shape {
  const shape = new THREE.Shape();
  const segments = 20; // Segments per curve
  
  // 4 spikes: top, right, bottom, left
  const spikes = [
    { x: 0, y: spikeLength },           // Top
    { x: spikeLength, y: 0 },           // Right
    { x: 0, y: -spikeLength },          // Bottom
    { x: -spikeLength, y: 0 },          // Left
  ];
  
  // Start at top spike
  shape.moveTo(spikes[0].x, spikes[0].y);
  
  for (let i = 0; i < 4; i++) {
    const startSpike = spikes[i];
    const endSpike = spikes[(i + 1) % 4];
    
    // Create curved line between spikes (curved inward toward center)
    for (let j = 1; j <= segments; j++) {
      const t = j / segments;
      
      // Linear interpolation between spikes
      const linearX = startSpike.x + (endSpike.x - startSpike.x) * t;
      const linearY = startSpike.y + (endSpike.y - startSpike.y) * t;
      
      // Calculate inward curve (toward center)
      // The curve is strongest at the middle (t = 0.5)
      const curveFactor = Math.sin(t * Math.PI) * curveDepth;
      
      // Direction toward center from the linear point
      const length = Math.sqrt(linearX * linearX + linearY * linearY);
      const dirX = length > 0 ? -linearX / length : 0;
      const dirY = length > 0 ? -linearY / length : 0;
      
      const x = linearX + dirX * curveFactor;
      const y = linearY + dirY * curveFactor;
      
      shape.lineTo(x, y);
    }
  }
  
  shape.closePath();
  return shape;
}

export default function CenterOrb({ scrollProgress }: CenterOrbProps) {
  const orbRef = useRef<THREE.Mesh>(null);
  const glowShapeRef = useRef<THREE.Mesh>(null);
  const logoRef = useRef<THREE.Sprite>(null);
  
  // Load the SVG logo as a texture
  const logoTexture = useLoader(THREE.TextureLoader, '/logo.svg');
  
  // Create the spiked glow shape
  const glowShapeGeometry = useMemo(() => {
    const shape = createSpikedGlowShape(0.15, 0.08); // Small spikes with subtle curve
    return new THREE.ShapeGeometry(shape);
  }, []);
  
  // Create the glow shape mesh object
  const glowShapeMesh = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    return new THREE.Mesh(glowShapeGeometry, material);
  }, [glowShapeGeometry]);

  // Color cycling ref for the glow
  const colorPhase = useRef(0);

  // Animation
  useFrame((state) => {
    const time = state.clock.elapsedTime;
    
    // Orb (initial state - small shiny blue particle)
    if (orbRef.current) {
      // Subtle pulse effect diminishes as we scroll
      const pulseIntensity = 1 - scrollProgress;
      const pulse = 1 + Math.sin(time * 3) * 0.1 * pulseIntensity;
      
      // Scale: small particle (0.03), slightly bigger than ring particles (0.015-0.02)
      // Shrinks further as logo appears
      const baseScale = 0.045 * (1 - scrollProgress * 0.5);
      orbRef.current.scale.setScalar(baseScale * pulse);
      
      // Opacity: orb fades as logo appears
      (orbRef.current.material as THREE.MeshBasicMaterial).opacity = 1 - scrollProgress;
    }
    
    // Spiked glow shape with color shifting
    if (glowShapeRef.current) {
      // Rotate slowly
      glowShapeRef.current.rotation.z = time * 0.5;
      
      // Color cycling on the blue spectrum
      colorPhase.current = time * 0.8;
      const hue = 0.55 + Math.sin(colorPhase.current) * 0.08; // Range: ~0.47 to ~0.63 (cyan to blue-violet)
      const saturation = 0.8 + Math.sin(colorPhase.current * 1.3) * 0.2;
      const lightness = 0.55 + Math.sin(colorPhase.current * 0.7) * 0.15;
      
      const color = new THREE.Color().setHSL(hue, saturation, lightness);
      (glowShapeRef.current.material as THREE.MeshBasicMaterial).color = color;
      
      // Fade out as scroll progresses
      (glowShapeRef.current.material as THREE.MeshBasicMaterial).opacity = (1 - scrollProgress) * 0.9;
    }
    
    // Logo sprite - appears as scroll progresses
    if (logoRef.current) {
      // Scale up as scroll increases, capped at 0.9
      const logoScale = Math.min(scrollProgress * 1.2, 0.3);
      logoRef.current.scale.set(logoScale, logoScale, 1);
      // Opacity increases with scroll
      (logoRef.current.material as THREE.SpriteMaterial).opacity = scrollProgress;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Main shiny blue orb - small particle */}
      <mesh ref={orbRef}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial
          color="#60a5fa"
          transparent
          opacity={1}
          toneMapped={false}
        />
      </mesh>
      
      {/* Spiked glow shape with color-shifting effect */}
      <primitive object={glowShapeMesh} ref={glowShapeRef} />
      
      {/* SVG Logo sprite - appears on scroll */}
      <sprite ref={logoRef} scale={[0, 0, 1]}>
        <spriteMaterial
          map={logoTexture}
          transparent
          opacity={0}
          toneMapped={false}
        />
      </sprite>
      
      {/* Subtle point light */}
      <pointLight
        color="#60a5fa"
        intensity={1.5 - scrollProgress}
        distance={3}
        decay={2}
      />
    </group>
  );
}
