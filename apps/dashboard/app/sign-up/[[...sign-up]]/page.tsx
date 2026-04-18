"use client";

import { useState } from "react";
import { SignUp } from "@clerk/nextjs";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, ArrowRight, Sparkles } from "lucide-react";

const VALID_CODES = ["BETA2026"];

export default function SignUpPage() {
  const [code, setCode] = useState("");
  const [isValid, setIsValid] = useState(false);
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsChecking(true);
    setError("");

    // Simulate a brief check
    setTimeout(() => {
      if (VALID_CODES.includes(code.toUpperCase().trim())) {
        setIsValid(true);
      } else {
        setError("Codigo invalido. Verifica e intenta de nuevo.");
      }
      setIsChecking(false);
    }, 500);
  };

  if (!isValid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800">
        {/* Background effects */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-green-900/20 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-grid-white/[0.02]" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative w-full max-w-md mx-4"
        >
          <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700/50 rounded-2xl p-8 shadow-2xl">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 mb-4">
                <Lock className="w-8 h-8 text-green-500" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Acceso Beta Privado</h1>
              <p className="text-gray-400 text-sm">
                LeadsCRM esta en beta cerrada. Ingresa tu codigo de invitacion para continuar.
              </p>
            </div>

            {/* Beta badge */}
            <div className="flex items-center justify-center gap-2 mb-6">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium">
                <Sparkles className="w-3 h-3" />
                Early Access
              </span>
            </div>

            {/* Form */}
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-gray-300 mb-2">
                  Codigo de invitacion
                </label>
                <input
                  id="code"
                  type="text"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setError("");
                  }}
                  placeholder="XXXXXX"
                  className="w-full px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all text-center text-lg tracking-widest font-mono"
                  autoComplete="off"
                  autoFocus
                />
              </div>

              <AnimatePresence mode="wait">
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="text-red-400 text-sm text-center"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={!code.trim() || isChecking}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-green-500/25"
              >
                {isChecking ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Verificar codigo
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Footer */}
            <div className="mt-6 pt-6 border-t border-gray-700/50 text-center">
              <p className="text-gray-500 text-sm">
                No tienes codigo?{" "}
                <a
                  href="mailto:contacto@leadscrm.com"
                  className="text-green-400 hover:text-green-300 transition-colors"
                >
                  Solicitar acceso
                </a>
              </p>
            </div>
          </div>

          {/* Decorative elements */}
          <div className="absolute -top-4 -right-4 w-24 h-24 bg-green-500/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-green-500/5 rounded-full blur-3xl" />
        </motion.div>
      </div>
    );
  }

  // Once code is valid, show Clerk SignUp
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex min-h-screen items-center justify-center bg-gray-50"
    >
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium mb-4">
            <Sparkles className="w-3 h-3" />
            Beta Access Granted
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">
            Registrate en LeadsCRM
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Comienza a gestionar tus leads de WhatsApp de forma inteligente
          </p>
        </div>
        <div className="flex justify-center">
          <SignUp
            fallbackRedirectUrl="/dashboard"
            appearance={{
              elements: {
                formButtonPrimary: "bg-green-600 hover:bg-green-700 text-sm normal-case",
                card: "shadow-lg",
                headerTitle: "text-gray-900",
                headerSubtitle: "text-gray-600",
              },
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}
