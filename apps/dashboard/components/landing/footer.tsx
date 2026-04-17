"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-black border-t border-neutral-800">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <span className="text-white font-bold text-xl">LeadsCRM</span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-8 text-sm text-neutral-400">
            <Link href="/sign-in" className="hover:text-white transition-colors">
              Iniciar Sesion
            </Link>
            <Link href="/sign-up" className="hover:text-white transition-colors">
              Registrarse
            </Link>
          </div>

          {/* Copyright */}
          <p className="text-sm text-neutral-500">
            &copy; {new Date().getFullYear()} LeadsCRM. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
