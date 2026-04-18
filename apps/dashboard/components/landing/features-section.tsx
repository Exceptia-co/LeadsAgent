"use client";

import { motion } from "framer-motion";
import { MessageSquare, Brain, Users, BarChart3, Zap, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const features = [
  {
    title: "WhatsApp Automatizado",
    description:
      "Conecta tu WhatsApp Business y responde automaticamente a tus clientes con IA, 24/7.",
    icon: MessageSquare,
    color: "from-green-500 to-emerald-500",
    bgColor: "bg-green-500/10",
  },
  {
    title: "IA Conversacional",
    description: "Asistente inteligente que entiende el contexto y responde como un humano.",
    icon: Brain,
    color: "from-purple-500 to-violet-500",
    bgColor: "bg-purple-500/10",
  },
  {
    title: "Gestion de Leads",
    description: "Organiza, califica y da seguimiento a todos tus prospectos en un solo lugar.",
    icon: Users,
    color: "from-blue-500 to-cyan-500",
    bgColor: "bg-blue-500/10",
  },
  {
    title: "Analytics Avanzados",
    description: "Metricas en tiempo real: conversion, respuesta, engagement y mas.",
    icon: BarChart3,
    color: "from-orange-500 to-amber-500",
    bgColor: "bg-orange-500/10",
  },
  {
    title: "Respuesta Instantanea",
    description: "Tiempo de respuesta de segundos, no horas. Nunca pierdas un lead.",
    icon: Zap,
    color: "from-yellow-500 to-orange-500",
    bgColor: "bg-yellow-500/10",
  },
  {
    title: "Seguro y Privado",
    description: "Tus datos y conversaciones protegidos con encriptacion de nivel empresarial.",
    icon: Shield,
    color: "from-slate-500 to-gray-500",
    bgColor: "bg-slate-500/10",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
    },
  },
};

export function FeaturesSection() {
  return (
    <section className="py-24 bg-neutral-950 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-black to-neutral-950" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-green-900/20 via-transparent to-transparent" />

      <div className="max-w-7xl mx-auto px-4 relative z-10">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="inline-block px-4 py-1 rounded-full bg-green-500/10 text-green-400 text-sm font-medium mb-4">
            Caracteristicas
          </span>
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
            Todo lo que necesitas para
            <span className="bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
              {" "}
              vender mas
            </span>
          </h2>
          <p className="text-neutral-400 text-lg max-w-2xl mx-auto">
            Herramientas poderosas para automatizar tu WhatsApp y convertir mas leads en clientes.
          </p>
        </motion.div>

        {/* Features grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              variants={itemVariants}
              className={cn(
                "group relative p-6 rounded-2xl border border-neutral-800 bg-neutral-900/50 backdrop-blur-sm",
                "hover:border-neutral-700 transition-all duration-300",
                "hover:shadow-lg hover:shadow-green-500/5",
              )}
            >
              {/* Icon */}
              <div
                className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center mb-4",
                  feature.bgColor,
                )}
              >
                <feature.icon
                  className={cn(
                    "w-6 h-6 bg-gradient-to-br bg-clip-text",
                    feature.color.replace("from-", "text-").split(" ")[0],
                  )}
                />
              </div>

              {/* Content */}
              <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-green-400 transition-colors">
                {feature.title}
              </h3>
              <p className="text-neutral-400 text-sm leading-relaxed">{feature.description}</p>

              {/* Hover gradient effect */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
