"use client";

import { Card, CardContent } from '@/components/ui/card'
import { Shield, Sparkles, Zap, Search } from 'lucide-react'

const features = [
    {
        id: 'unlimited',
        title: 'Unlimited',
        description: 'Research without limits using your own API keys.',
        icon: '∞',
        iconType: 'text'
    },
    {
        id: 'secure',
        title: 'Secure',
        description: 'Bank-grade AES-256-GCM encryption protects your data.',
        icon: Shield,
        iconType: 'component'
    },
    {
        id: 'fast',
        title: 'Fast',
        description: 'Real-time streaming with live planning updates.',
        icon: Zap,
        iconType: 'component'
    },
    {
        id: 'smart',
        title: 'Smart Agent',
        description: 'AI that plans, researches, and provides answers.',
        icon: Sparkles,
        iconType: 'component'
    },
    {
        id: 'custom',
        title: 'Custom Models',
        description: 'Choose GPT-4, Claude, Llama, Groq, or any model.',
        icon: Search,
        iconType: 'component'
    }
];

function FeatureCard({ feature, size = 'default' }: { feature: typeof features[0], size?: 'default' | 'compact' }) {
    const IconComponent = feature.icon;
    const sizeClasses = size === 'compact' 
        ? "size-12 md:size-14" 
        : "size-14 md:size-16 lg:size-18";
    const iconSizeClasses = size === 'compact'
        ? "size-4 md:size-5"
        : "size-5 md:size-6 lg:size-7";
    const textSizeClasses = size === 'compact'
        ? "text-base md:text-lg"
        : "text-xl md:text-2xl lg:text-3xl";

    return (
        <Card className="relative overflow-hidden hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-white/10 backdrop-blur-lg border border-white/20">
            <CardContent className="pt-4 pb-4 lg:pt-5 lg:pb-5">
                <div className={`relative mx-auto flex aspect-square ${sizeClasses} rounded-full border before:absolute before:-inset-2 before:rounded-full before:border dark:border-white/10 dark:before:border-white/5`}>
                    {feature.iconType === 'text' ? (
                        <span className={`mx-auto block w-fit ${textSizeClasses} font-semibold`}>
                            {feature.icon as string}
                        </span>
                    ) : (
                        <IconComponent className={`m-auto ${iconSizeClasses} text-primary`} strokeWidth={1} />
                    )}
                </div>
                <div className="mt-3 md:mt-4 space-y-1 text-center px-2">
                    <h2 className="text-sm md:text-base lg:text-lg font-medium transition" style={{ filter: "drop-shadow(0 0 10px rgba(0,0,0,0.7))" }}>{feature.title}</h2>
                    <p className="text-muted-foreground text-xs md:text-sm leading-relaxed" style={{ filter: "drop-shadow(0 0 8px rgba(0,0,0,0.7))" }}>{feature.description}</p>
                </div>
            </CardContent>
        </Card>
    );
}

export function Features() {
    return (
        <section className="h-screen flex items-center justify-center py-6 md:py-8 lg:py-12 overflow-auto">
            <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
                <div className="text-center mb-6 md:mb-8 lg:mb-12">
                    <h2 className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold mb-3 md:mb-4 bg-gradient-to-r from-white to-amber-200 bg-clip-text text-transparent" style={{ filter: "drop-shadow(0 0 20px rgba(0,0,0,0.8))" }}>
                        Powerful Features
                    </h2>
                    <p className="text-sm md:text-base lg:text-lg text-white/70 max-w-2xl mx-auto px-4" style={{ filter: "drop-shadow(0 0 15px rgba(0,0,0,0.8))" }}>
                        Everything you need for unlimited AI research
                    </p>
                </div>
                
                {/* Mobile: 2 columns */}
                <div className="grid grid-cols-2 gap-4 sm:hidden">
                    {features.map((feature) => (
                        <FeatureCard key={feature.id} feature={feature} size="compact" />
                    ))}
                </div>

                {/* Tablet: 3 columns */}
                <div className="hidden sm:grid md:grid-cols-3 gap-4 md:gap-6 lg:hidden">
                    {features.map((feature) => (
                        <FeatureCard key={feature.id} feature={feature} />
                    ))}
                </div>

                {/* Desktop: Optimized 2-3 layout */}
                <div className="hidden lg:block max-w-5xl mx-auto">
                    <div className="space-y-6 xl:space-y-8">
                        {/* First row: 2 cards centered */}
                        <div className="flex justify-center gap-6 xl:gap-8">
                            <div className="w-56 xl:w-64">
                                <FeatureCard feature={features[0]} />
                            </div>
                            <div className="w-56 xl:w-64">
                                <FeatureCard feature={features[1]} />
                            </div>
                        </div>
                        
                        {/* Second row: 3 cards */}
                        <div className="grid grid-cols-3 gap-4 xl:gap-6 max-w-4xl mx-auto">
                            <FeatureCard feature={features[2]} />
                            <FeatureCard feature={features[3]} />
                            <FeatureCard feature={features[4]} />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}