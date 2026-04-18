"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser, UserButton } from "@clerk/nextjs";
import { clsx } from "clsx";
import { ToastProvider } from "../../components/ui/toast";
import { TemplateProvider } from "../../contexts/TemplateContext";
import { WhatsAppProvider } from "../../contexts/WhatsAppContext";

// Utility function for combining classes
const cn = (...classes: any[]) => clsx(classes);
import {
  BarChart3,
  Users,
  Settings,
  Menu,
  X,
  Brain,
  Phone,
  Shield,
  MessageSquare,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: BarChart3 },
  { name: "Leads", href: "/dashboard/leads", icon: Users },
  { name: "WhatsApp", href: "/dashboard/whatsapp", icon: Phone },
  { name: "Estadisticas IA", href: "/dashboard/whatsapp-stats", icon: Shield },
  { name: "IA Assistant", href: "/dashboard/ai", icon: Brain },
  { name: "Configuracion", href: "/dashboard/settings", icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();

  // Mostrar loading mientras carga la autenticacion
  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-green-500 border-t-transparent"></div>
          <p className="text-gray-500 text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  // Si no esta autenticado, el middleware debe redirigir,
  // pero agregamos una proteccion adicional
  if (!isSignedIn) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center p-8 bg-white rounded-2xl shadow-lg max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <Shield className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Acceso no autorizado</h2>
          <p className="mt-2 text-gray-600">Por favor, inicia sesion para acceder al dashboard.</p>
          <Link
            href="/sign-in"
            className="mt-6 inline-flex items-center justify-center h-10 px-6 rounded-full bg-green-500 text-white font-medium transition-all hover:bg-green-600 hover:shadow-lg hover:shadow-green-500/25"
          >
            Iniciar Sesion
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <TemplateProvider>
        <WhatsAppProvider>
          <div className="h-full bg-gray-50">
            {/* Mobile sidebar */}
            <div
              className={cn(
                "fixed inset-0 z-50 lg:hidden transition-opacity duration-300",
                sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
              )}
            >
              <div
                className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm"
                onClick={() => setSidebarOpen(false)}
              />
              <div
                className={cn(
                  "fixed inset-y-0 left-0 flex w-72 flex-col bg-white shadow-2xl transition-transform duration-300",
                  sidebarOpen ? "translate-x-0" : "-translate-x-full",
                )}
              >
                <div className="flex h-16 items-center justify-between px-4 border-b border-gray-100">
                  <Link href="/dashboard" className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                      <MessageSquare className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-lg font-bold text-gray-900">LeadsCRM</span>
                  </Link>
                  <button
                    type="button"
                    className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <nav className="flex-1 px-3 py-4 space-y-1">
                  {navigation.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={cn(
                          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                          isActive
                            ? "bg-green-50 text-green-700"
                            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                        )}
                        onClick={() => setSidebarOpen(false)}
                      >
                        <div
                          className={cn(
                            "flex items-center justify-center w-9 h-9 rounded-lg transition-colors",
                            isActive
                              ? "bg-green-500 text-white"
                              : "bg-gray-100 text-gray-500 group-hover:bg-gray-200 group-hover:text-gray-700",
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        {item.name}
                      </Link>
                    );
                  })}
                </nav>
                <div className="p-4 border-t border-gray-100">
                  <div className="flex items-center gap-3 px-2">
                    <UserButton
                      appearance={{
                        elements: {
                          avatarBox: "h-10 w-10 ring-2 ring-green-500/20",
                        },
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {user?.firstName || user?.emailAddresses?.[0]?.emailAddress || "Usuario"}
                      </p>
                      <p className="text-xs text-gray-500 truncate">Ver perfil</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop sidebar */}
            <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-72 lg:flex-col">
              <div className="flex flex-col flex-grow bg-white border-r border-gray-100 overflow-y-auto">
                <div className="flex items-center h-16 px-4 border-b border-gray-100">
                  <Link href="/dashboard" className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                      <MessageSquare className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-lg font-bold text-gray-900">LeadsCRM</span>
                  </Link>
                </div>
                <nav className="flex-1 px-3 py-4 space-y-1">
                  {navigation.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={cn(
                          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                          isActive
                            ? "bg-green-50 text-green-700"
                            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                        )}
                      >
                        <div
                          className={cn(
                            "flex items-center justify-center w-9 h-9 rounded-lg transition-colors",
                            isActive
                              ? "bg-green-500 text-white"
                              : "bg-gray-100 text-gray-500 group-hover:bg-gray-200 group-hover:text-gray-700",
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        {item.name}
                      </Link>
                    );
                  })}
                </nav>
                <div className="p-4 border-t border-gray-100">
                  <div className="flex items-center gap-3 px-2">
                    <UserButton
                      appearance={{
                        elements: {
                          avatarBox: "h-10 w-10 ring-2 ring-green-500/20",
                        },
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {user?.firstName || user?.emailAddresses?.[0]?.emailAddress || "Usuario"}
                      </p>
                      <p className="text-xs text-gray-500">Ver perfil</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Main content */}
            <div className="lg:pl-72 flex flex-col flex-1 h-full">
              {/* Mobile header */}
              <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-100 lg:hidden">
                <div className="flex items-center justify-between h-16 px-4">
                  <button
                    type="button"
                    className="p-2 rounded-full text-gray-500 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    onClick={() => setSidebarOpen(true)}
                  >
                    <Menu className="h-6 w-6" />
                  </button>
                  <Link href="/dashboard" className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                      <MessageSquare className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-lg font-bold text-gray-900">LeadsCRM</span>
                  </Link>
                  <UserButton
                    appearance={{
                      elements: {
                        avatarBox: "h-9 w-9",
                      },
                    }}
                  />
                </div>
              </div>
              <main className="flex-1 p-4 lg:p-8">{children}</main>
            </div>
          </div>
        </WhatsAppProvider>
      </TemplateProvider>
    </ToastProvider>
  );
}
