"use client";

import { motion } from "framer-motion";
import { Spotlight } from "./spotlight";
import { TextGenerateEffect } from "./text-generate";
import Link from "next/link";
import { MessageSquare, Zap, BarChart3 } from "lucide-react";

export function HeroSection() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-black/[0.96] antialiased bg-grid-white/[0.02] relative overflow-hidden">
      <Spotlight
        className="-top-40 left-0 md:left-60 md:-top-20"
        fill="white"
      />

      <div className="p-4 max-w-7xl mx-auto relative z-10 w-full pt-20 md:pt-0">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex justify-center mb-8"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 text-green-400 text-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            Automatizacion WhatsApp con IA
          </span>
        </motion.div>

        {/* Main heading */}
        <h1 className="text-4xl md:text-7xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400 bg-opacity-50 pb-4">
          Convierte conversaciones <br />
          <span className="text-green-400">en ventas</span>
        </h1>

        {/* Subheading with animation */}
        <div className="mt-4 max-w-3xl mx-auto text-center">
          <TextGenerateEffect
            words="CRM inteligente con automatizacion WhatsApp. Gestiona leads, responde automaticamente y cierra mas ventas con el poder de la IA."
            className="text-neutral-300 text-lg md:text-xl"
          />
        </div>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          className="flex flex-col sm:flex-row gap-4 justify-center mt-10"
        >
          <Link
            href="/sign-up"
            className="group relative inline-flex h-14 items-center justify-center gap-2 overflow-hidden rounded-full bg-green-500 px-8 font-medium text-white transition-all duration-300 hover:bg-green-600 hover:shadow-lg hover:shadow-green-500/25"
          >
            <span>Comenzar Gratis</span>
            <svg
              className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Link>

          <Link
            href="/sign-in"
            className="inline-flex h-14 items-center justify-center gap-2 rounded-full border border-neutral-700 bg-neutral-900/50 px-8 font-medium text-neutral-300 backdrop-blur-sm transition-all duration-300 hover:border-neutral-600 hover:bg-neutral-800/50"
          >
            <span>Iniciar Sesion</span>
          </Link>
        </motion.div>

        {/* Feature highlights */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1 }}
          className="flex flex-wrap justify-center gap-6 mt-16 text-sm text-neutral-400"
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-500" />
            <span>Respuestas automaticas 24/7</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            <span>IA conversacional</span>
          </div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-500" />
            <span>Analytics en tiempo real</span>
          </div>
        </motion.div>
      </div>

      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent pointer-events-none" />
    </div>
  );
}
