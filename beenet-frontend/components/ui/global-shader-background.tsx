"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

interface GlobalShaderBackgroundProps {
  children: React.ReactNode;
  variant?: "hero" | "section";
  intensity?: "low" | "medium" | "high";
}

export function GlobalShaderBackground({ 
  children, 
  variant = "section", 
  intensity = "medium" 
}: GlobalShaderBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 50, y: 50 });
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setMousePosition({
          x: ((e.clientX - rect.left) / rect.width) * 100,
          y: ((e.clientY - rect.top) / rect.height) * 100,
        });
      }
    };

    const handleMouseEnter = () => setIsActive(true);
    const handleMouseLeave = () => setIsActive(false);

    const container = containerRef.current;
    if (container) {
      container.addEventListener("mousemove", handleMouseMove);
      container.addEventListener("mouseenter", handleMouseEnter);
      container.addEventListener("mouseleave", handleMouseLeave);
    }

    return () => {
      if (container) {
        container.removeEventListener("mousemove", handleMouseMove);
        container.removeEventListener("mouseenter", handleMouseEnter);
        container.removeEventListener("mouseleave", handleMouseLeave);
      }
    };
  }, []);

  const getIntensityValues = () => {
    switch (intensity) {
      case "low":
        return { 
          primary: 0.15, 
          secondary: 0.1, 
          particles: 6,
          baseOpacity: 0.3
        };
      case "high":
        return { 
          primary: 0.4, 
          secondary: 0.3, 
          particles: 16,
          baseOpacity: 0.8
        };
      default:
        return { 
          primary: 0.25, 
          secondary: 0.2, 
          particles: 10,
          baseOpacity: 0.6
        };
    }
  };

  const intensityConfig = getIntensityValues();

  const getBackgroundColor = () => {
    return variant === "hero" ? "bg-black" : "bg-gray-950";
  };

  return (
    <div 
      ref={containerRef}
      className={`relative overflow-hidden ${getBackgroundColor()}`}
    >
      {/* SVG Filters - Global */}
      <svg className="absolute inset-0 w-0 h-0">
        <defs>
          <filter id="global-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          
          <filter id="global-glass" x="-50%" y="-50%" width="200%" height="200%">
            <feTurbulence baseFrequency="0.005" numOctaves="1" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.3" />
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0.02
                      0 1 0 0 0.02
                      0 0 1 0 0.05
                      0 0 0 0.9 0"
            />
          </filter>

          <linearGradient id="global-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="30%" stopColor="#ffffff" />
            <stop offset="70%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#ffffff" />
          </linearGradient>
        </defs>
      </svg>

      {/* Primary Animated Background */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(circle at ${mousePosition.x}% ${mousePosition.y}%, 
              rgba(245, 158, 11, ${intensityConfig.primary}) 0%, 
              rgba(249, 115, 22, ${intensityConfig.secondary}) 25%, 
              rgba(0, 0, 0, 0.8) 50%),
            linear-gradient(135deg, 
              rgba(0, 0, 0, 1) 0%, 
              rgba(245, 158, 11, ${intensityConfig.secondary * 0.5}) 25%, 
              rgba(249, 115, 22, ${intensityConfig.secondary * 0.5}) 50%, 
              rgba(0, 0, 0, 1) 100%)
          `,
        }}
        animate={{
          opacity: isActive ? intensityConfig.baseOpacity + 0.2 : intensityConfig.baseOpacity,
        }}
        transition={{ duration: 0.3 }}
      />

      {/* Secondary Mesh Overlay */}
      <motion.div
        className={`absolute inset-0 opacity-${Math.round(intensityConfig.baseOpacity * 50)}`}
        style={{
          background: `
            radial-gradient(circle at 20% 20%, rgba(245, 158, 11, ${intensityConfig.secondary}) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(249, 115, 22, ${intensityConfig.secondary * 0.8}) 0%, transparent 50%),
            radial-gradient(circle at 60% 30%, rgba(251, 191, 36, ${intensityConfig.secondary * 0.6}) 0%, transparent 50%)
          `,
        }}
        animate={{
          transform: [
            "translateX(0%) translateY(0%)",
            "translateX(2%) translateY(-2%)",
            "translateX(-1%) translateY(1%)",
            "translateX(0%) translateY(0%)",
          ],
        }}
        transition={{
          duration: variant === "hero" ? 15 : 25,
          repeat: Infinity,
          ease: "linear",
        }}
      />

      {/* Floating Particles */}
      {variant === "hero" && (
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(intensityConfig.particles)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-amber-400/60 rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
              }}
              animate={{
                y: [-20, -40, -20],
                x: [0, Math.random() * 30 - 15, 0],
                opacity: [0.3, 1, 0.3],
                scale: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 4 + Math.random() * 2,
                repeat: Infinity,
                delay: i * 0.3,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      )}

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

