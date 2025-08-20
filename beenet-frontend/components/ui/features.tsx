"use client";

import { Card, CardContent } from '@/components/ui/card'
import { Shield, Users, Sparkles, Zap, Search, Smartphone } from 'lucide-react'

export function Features() {
    return (
        <section className="h-screen flex items-center justify-center bg-muted/5 py-6 md:py-8 lg:py-12 overflow-auto">
            <div className="mx-auto max-w-5xl px-4 md:px-6 lg:px-8">
                <div className="text-center mb-6 md:mb-8">
                    <h2 className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold mb-3 md:mb-4 bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                        Powerful Features
                    </h2>
                    <p className="text-sm md:text-base lg:text-lg text-muted-foreground max-w-2xl mx-auto px-4">
                        Everything you need for unlimited AI research
                    </p>
                </div>
                
                <div className="relative">
                    <div className="relative z-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 lg:gap-5 max-w-6xl mx-auto">
                        <Card className="relative col-span-1 overflow-hidden">
                            <CardContent className="pt-4 pb-4">
                                <div className="relative mx-auto flex aspect-square size-16 md:size-20 lg:size-24 rounded-full border before:absolute before:-inset-2 before:rounded-full before:border dark:border-white/10 dark:before:border-white/5">
                                    <span className="mx-auto block w-fit text-2xl md:text-3xl lg:text-4xl font-semibold">∞</span>
                                </div>
                                <div className="relative z-10 mt-3 md:mt-4 space-y-1 md:space-y-2 text-center px-2">
                                    <h2 className="text-sm md:text-base lg:text-lg font-medium transition">Unlimited</h2>
                                    <p className="text-muted-foreground text-xs md:text-sm">Research without limits using your own API keys.</p>
                                </div>
                            </CardContent>
                        </Card>
                        
                        <Card className="relative col-span-1 overflow-hidden">
                            <CardContent className="pt-4 pb-4">
                                <div className="relative mx-auto flex aspect-square size-16 md:size-20 lg:size-24 rounded-full border before:absolute before:-inset-2 before:rounded-full before:border dark:border-white/10 dark:before:border-white/5">
                                    <Shield className="m-auto size-6 md:size-8 lg:size-10 text-primary" strokeWidth={1} />
                                </div>
                                <div className="relative z-10 mt-3 md:mt-4 space-y-1 md:space-y-2 text-center px-2">
                                    <h2 className="text-sm md:text-base lg:text-lg font-medium transition">Secure</h2>
                                    <p className="text-muted-foreground text-xs md:text-sm">Bank-grade AES-256-GCM encryption protects your data.</p>
                                </div>
                            </CardContent>
                        </Card>
                        
                        <Card className="relative col-span-1 overflow-hidden">
                            <CardContent className="pt-4 pb-4">
                                <div className="relative mx-auto flex aspect-square size-16 md:size-20 lg:size-24 rounded-full border before:absolute before:-inset-2 before:rounded-full before:border dark:border-white/10 dark:before:border-white/5">
                                    <Zap className="m-auto size-6 md:size-8 lg:size-10 text-primary" strokeWidth={1} />
                                </div>
                                <div className="relative z-10 mt-3 md:mt-4 space-y-1 md:space-y-2 text-center px-2">
                                    <h2 className="text-sm md:text-base lg:text-lg font-medium transition">Fast</h2>
                                    <p className="text-muted-foreground text-xs md:text-sm">Real-time streaming with live planning updates.</p>
                                </div>
                            </CardContent>
                        </Card>
                        
                        <Card className="relative col-span-1 overflow-hidden">
                            <CardContent className="pt-4 pb-4">
                                <div className="relative mx-auto flex aspect-square size-16 md:size-20 lg:size-24 rounded-full border before:absolute before:-inset-2 before:rounded-full before:border dark:border-white/10 dark:before:border-white/5">
                                    <Sparkles className="m-auto size-6 md:size-8 lg:size-10 text-primary" strokeWidth={1} />
                                </div>
                                <div className="relative z-10 mt-3 md:mt-4 space-y-1 md:space-y-2 text-center px-2">
                                    <h2 className="text-sm md:text-base lg:text-lg font-medium transition">Smart Agent</h2>
                                    <p className="text-muted-foreground text-xs md:text-sm">AI that plans, researches, and provides answers.</p>
                                </div>
                            </CardContent>
                        </Card>
                        
                        <Card className="relative col-span-1 overflow-hidden">
                            <CardContent className="pt-4 pb-4">
                                <div className="relative mx-auto flex aspect-square size-16 md:size-20 lg:size-24 rounded-full border before:absolute before:-inset-2 before:rounded-full before:border dark:border-white/10 dark:before:border-white/5">
                                    <Search className="m-auto size-6 md:size-8 lg:size-10 text-primary" strokeWidth={1} />
                                </div>
                                <div className="relative z-10 mt-3 md:mt-4 space-y-1 md:space-y-2 text-center px-2">
                                    <h2 className="text-sm md:text-base lg:text-lg font-medium transition">Custom Models</h2>
                                    <p className="text-muted-foreground text-xs md:text-sm">Choose GPT-4, Claude, Llama, Groq, or any model.</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </section>
    )
}
