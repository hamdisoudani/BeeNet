"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronDown } from "lucide-react";
import Image from "next/image";
import Logo from "@/public/logo.png";

interface ShaderHeroProps {
  scrollToSection?: (index: number) => void;
}

export function ShaderHero({ scrollToSection }: ShaderHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

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

  return (
    <div 
      ref={containerRef} 
      className="min-h-screen bg-black relative overflow-hidden"
    >
      {/* SVG Filters */}
      <svg className="absolute inset-0 w-0 h-0">
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          
          <filter id="glass-effect" x="-50%" y="-50%" width="200%" height="200%">
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

          <linearGradient id="hero-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="30%" stopColor="#f59e0b" />
            <stop offset="70%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#ffffff" />
          </linearGradient>

          <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>
      </svg>

      {/* Animated Background Gradients */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(circle at ${mousePosition.x}% ${mousePosition.y}%, 
              rgba(245, 158, 11, 0.3) 0%, 
              rgba(249, 115, 22, 0.2) 25%, 
              rgba(0, 0, 0, 0.8) 50%),
            linear-gradient(135deg, 
              rgba(0, 0, 0, 1) 0%, 
              rgba(245, 158, 11, 0.1) 25%, 
              rgba(249, 115, 22, 0.1) 50%, 
              rgba(0, 0, 0, 1) 100%)
          `,
        }}
        animate={{
          opacity: isActive ? 1 : 0.7,
        }}
        transition={{ duration: 0.3 }}
      />

      {/* Animated Mesh Overlay */}
      <motion.div
        className="absolute inset-0 opacity-30"
        style={{
          background: `
            radial-gradient(circle at 20% 20%, rgba(245, 158, 11, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(249, 115, 22, 0.2) 0%, transparent 50%),
            radial-gradient(circle at 60% 30%, rgba(251, 191, 36, 0.2) 0%, transparent 50%)
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
          duration: 20,
          repeat: Infinity,
          ease: "linear",
        }}
      />

      {/* Floating Particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(12)].map((_, i) => (
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

      {/* Navigation */}
      <header className="relative z-20 flex items-center justify-between p-6 lg:p-8">
        <motion.div
          className="flex items-center group cursor-pointer"
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 400, damping: 10 }}
        >
          <motion.div
            className="relative"
            style={{ filter: "url(#glow)" }}
            whileHover={{
              rotate: [0, -5, 5, 0],
              transition: { duration: 0.6, ease: "easeInOut" },
            }}
          >
            <Image 
              src={Logo} 
              alt="BeeNet" 
              width={40} 
              height={40} 
              className="w-10 h-10 sm:w-12 sm:h-12" 
            />
            
            {/* Animated particles around logo */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 bg-amber-400/80 rounded-full"
                  style={{
                    left: `${20 + Math.random() * 60}%`,
                    top: `${20 + Math.random() * 60}%`,
                  }}
                  animate={{
                    y: [-10, -20, -10],
                    x: [0, Math.random() * 20 - 10, 0],
                    opacity: [0, 1, 0],
                    scale: [0, 1, 0],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: i * 0.2,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>
          </motion.div>
          
          <span 
            className="ml-3 text-xl sm:text-2xl font-bold"
            style={{
              background: "linear-gradient(135deg, #f59e0b 0%, #ffffff 50%, #f97316 100%)",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            BeeNet
          </span>
        </motion.div>

        {/* Navigation Buttons */}
        <div className="flex items-center gap-3 sm:gap-4">
          <SignInButton mode="modal">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-sm sm:text-base font-medium text-white/80 hover:text-white hover:bg-white/10 transition-all duration-300"
            >
              Sign in
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button 
              size="sm" 
              className="text-sm sm:text-base font-semibold px-4 sm:px-6 py-2 sm:py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 shadow-lg hover:shadow-xl transition-all duration-300"
            >
              Get Started
            </Button>
          </SignUpButton>
        </div>
      </header>

      {/* Main Hero Content - Unified Layout */}
      <div className="flex-1 flex flex-col justify-center items-center z-20 px-4 sm:px-6 lg:px-12 xl:px-16 pt-10 pb-16 lg:pt-8 lg:pb-12">
        <div className="text-center max-w-5xl mx-auto w-full space-y-6 lg:space-y-8">
          
          {/* Announcement Badge */}
          <motion.div
            className="inline-flex items-center px-4 py-2 rounded-full bg-white/5 backdrop-blur-sm relative border border-white/10"
            style={{ filter: "url(#glass-effect)" }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="absolute top-0 left-1 right-1 h-px bg-gradient-to-r from-transparent via-amber-400/30 to-transparent rounded-full" />
            <span className="text-white/90 text-sm font-medium relative z-10 tracking-wide">
              ✨ Unlimited AI Research Experience
            </span>
          </motion.div>

          {/* Main Title - Consistent Sizing */}
          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <motion.h1
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-light leading-tight tracking-wide"
              style={{
                background: "linear-gradient(135deg, #f59e0b 0%, #ffffff 30%, #f97316 70%, #ffffff 100%)",
                backgroundSize: "200% 200%",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                filter: "url(#glow) drop-shadow(0 0 20px rgba(0,0,0,0.5))",
              }}
              animate={{
                backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: "linear",
              }}
            >
              Your AI Research
            </motion.h1>
            
            <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-white leading-tight" style={{ filter: "drop-shadow(0 0 20px rgba(0,0,0,0.7))" }}>
              Without Limits
            </h2>
          </motion.div>

          {/* Subtitle - Consistent Formatting */}
          <motion.p
            className="text-base sm:text-lg md:text-xl lg:text-2xl font-light text-white/80 leading-relaxed max-w-3xl mx-auto px-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            style={{ filter: "drop-shadow(0 0 15px rgba(0,0,0,0.8))" }}
          >
            Unlike Perplexity's restrictions, BeeNet gives you{" "}
            <span className="text-amber-300 font-medium">unlimited research</span> with your own API keys,{" "}
            <span className="text-amber-300 font-medium">custom models</span>, and{" "}
            <span className="text-amber-300 font-medium">enterprise-grade security</span>.
          </motion.p>

          {/* Main CTA Button */}
          <motion.div
            className="flex flex-col items-center justify-center max-w-sm mx-auto relative z-30"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.0 }}
          >
            <SignInButton mode="modal">
              <motion.button
                className="w-full px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-bold text-base sm:text-lg transition-all duration-300 hover:from-amber-400 hover:to-orange-400 shadow-2xl hover:shadow-3xl flex items-center justify-center gap-3 group relative z-40 cursor-pointer"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Start Free Research
                <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
              </motion.button>
            </SignInButton>
          </motion.div>




        </div>
      </div>

      {/* Scroll Indicator - Bottom positioned for all screen sizes */}
      {scrollToSection && (
        <motion.div 
          className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-50"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.2 }}
        >
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm text-white/70 font-medium" style={{ filter: "drop-shadow(0 0 10px rgba(0,0,0,0.8))" }}>Scroll to explore</span>
            <motion.button 
              onClick={() => scrollToSection(1)}
              className="group flex flex-col items-center gap-1 p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/30 hover:border-amber-400/50 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-xl"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              aria-label="Scroll to next section"
              style={{ filter: "drop-shadow(0 0 15px rgba(0,0,0,0.5))" }}
            >
              <ChevronDown className="h-6 w-6 text-white/80 group-hover:text-amber-300 animate-bounce" />
            </motion.button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
