"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Menu, X } from "lucide-react";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-lg border-b border-neutral-800/50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <span className="text-white font-bold text-xl">LeadsCRM</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            <Link
              href="/sign-in"
              className="text-neutral-300 hover:text-white transition-colors text-sm font-medium"
            >
              Iniciar Sesion
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center h-10 px-6 rounded-full bg-green-500 text-white font-medium text-sm transition-all duration-300 hover:bg-green-600 hover:shadow-lg hover:shadow-green-500/25"
            >
              Empezar Gratis
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 text-neutral-400 hover:text-white transition-colors"
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-neutral-800 bg-black/95 backdrop-blur-lg"
          >
            <div className="px-4 py-4 space-y-4">
              <Link
                href="/sign-in"
                onClick={() => setIsOpen(false)}
                className="block text-neutral-300 hover:text-white transition-colors text-sm font-medium py-2"
              >
                Iniciar Sesion
              </Link>
              <Link
                href="/sign-up"
                onClick={() => setIsOpen(false)}
                className="block w-full text-center py-3 rounded-full bg-green-500 text-white font-medium text-sm transition-all duration-300 hover:bg-green-600"
              >
                Empezar Gratis
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
