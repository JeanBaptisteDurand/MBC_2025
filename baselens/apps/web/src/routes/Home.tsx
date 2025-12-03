import ParticleScene from '../components/home/ParticleScene';
import FloatingTools from '../components/home/FloatingTools';
import HeroContent from '../components/home/HeroContent';

export default function Home() {
  return (
    <div className="relative w-full h-[calc(100vh-65px)] bg-surface-950 overflow-hidden">
      {/* 3D Particle Background */}
      <ParticleScene />
      
      {/* Gradient overlays for depth */}
      <div className="absolute inset-0 bg-gradient-to-t from-surface-950 via-transparent to-surface-950/50 pointer-events-none z-10" />
      <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-surface-950/80 pointer-events-none z-10" />
      
      {/* Center content - BaseLens title */}
      <div className="absolute inset-0 flex items-center justify-center z-20">
        <HeroContent />
      </div>
      
      {/* Floating tool icons */}
      <div className="absolute inset-0 z-30">
        <FloatingTools />
      </div>
      
      {/* Subtle vignette effect */}
      <div className="absolute inset-0 pointer-events-none z-40"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, transparent 50%, rgba(0,0,0,0.4) 100%)'
        }}
      />
    </div>
  );
}
