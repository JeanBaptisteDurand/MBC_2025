import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import SlideEcosystem from "../components/presentation/SlideEcosystem";
import SlideVision from "../components/presentation/SlideVision";
import SlideBaseLens from "../components/presentation/SlideBaseLens";
import SlideClarify from "../components/presentation/SlideClarify";
import SlideAudience from "../components/presentation/SlideAudience";
import SlideComingSoon from "../components/presentation/SlideComingSoon";

const TOTAL_SLIDES = 6;

export default function Mbc() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const navigate = useNavigate();

  const handleNavigateToHome = useCallback(() => {
    setIsFadingOut(true);
    setTimeout(() => {
      navigate("/");
    }, 500); // Match the fade-out duration
  }, [navigate]);

  const goToNextSlide = useCallback(() => {
    if (currentSlide < TOTAL_SLIDES - 1) {
      setCurrentSlide((prev) => prev + 1);
    }
  }, [currentSlide]);

  const goToPrevSlide = useCallback(() => {
    if (currentSlide > 0) {
      setCurrentSlide((prev) => prev - 1);
    }
  }, [currentSlide]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isFadingOut) return;
      if (e.key === " " || e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        goToNextSlide();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        goToPrevSlide();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToNextSlide, goToPrevSlide, isFadingOut]);

  const handleClick = (e: React.MouseEvent) => {
    if (isFadingOut) return;
    // Don't navigate if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a')) {
      return;
    }
    goToNextSlide();
  };

  const renderSlide = () => {
    switch (currentSlide) {
      case 0:
        return <SlideEcosystem />;
      case 1:
        return <SlideVision />;
      case 2:
        return <SlideBaseLens />;
      case 3:
        return <SlideClarify />;
      case 4:
        return <SlideAudience />;
      case 5:
        return <SlideComingSoon onNavigate={handleNavigateToHome} />;
      default:
        return <SlideEcosystem />;
    }
  };

  return (
    <div
      className={`fixed inset-0 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-white flex flex-col cursor-pointer select-none overflow-hidden transition-opacity duration-500 ${
        isFadingOut ? "opacity-0" : "opacity-100"
      }`}
      onClick={handleClick}
    >
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Header */}
      <header className="relative z-50 flex justify-between items-center px-8 py-6">
        <div className="flex items-center gap-6">
          <img src="/logo.svg" alt="Logo" className="h-10" />
          <span className="font-display text-2xl font-bold gradient-text">BaseLens</span>
          <img src="/MBCLogo.webp" alt="MBC Logo" className="h-10" />
        </div>
        <div className="text-xl font-semibold text-gray-300">
          BaseLens @ MBC 2025
        </div>
      </header>

      {/* Slide Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center">
        {renderSlide()}
      </main>

      {/* Slide indicator & navigation hint */}
      <footer className="relative z-50 px-8 py-6 flex justify-between items-center">
        <div className="text-sm text-gray-500">
          Press <kbd className="px-2 py-1 bg-gray-800 rounded text-gray-400">Space</kbd> or <kbd className="px-2 py-1 bg-gray-800 rounded text-gray-400">→</kbd> to continue
        </div>
        
        <div className="flex items-center gap-3">
          {Array.from({ length: TOTAL_SLIDES }).map((_, index) => (
            <button
              key={index}
              onClick={(e) => {
                e.stopPropagation();
                if (!isFadingOut) setCurrentSlide(index);
              }}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                index === currentSlide 
                  ? "bg-white scale-125" 
                  : "bg-gray-600 hover:bg-gray-500"
              }`}
            />
          ))}
        </div>

        <div className="text-sm text-gray-500">
          {currentSlide + 1} / {TOTAL_SLIDES}
        </div>
      </footer>
    </div>
  );
}