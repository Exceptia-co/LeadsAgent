"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

const benefits = [
  "Sin tarjeta de credito",
  "Configuracion en 5 minutos",
  "Soporte incluido",
];

export function CTASection() {
  return (
    <section className="py-24 bg-black relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-green-900/30 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-green-500/50 to-transparent" />
      </div>

      <div className="max-w-4xl mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="text-center"
        >
          {/* Heading */}
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
            Listo para transformar tu
            <span className="block bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
              WhatsApp en una maquina de ventas?
            </span>
          </h2>

          <p className="text-neutral-400 text-lg mb-8 max-w-2xl mx-auto">
            Unete a cientos de negocios que ya usan LeadsCRM para automatizar su
            WhatsApp y cerrar mas ventas.
          </p>

          {/* Benefits */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            viewport={{ once: true }}
            className="flex flex-wrap justify-center gap-6 mb-10"
          >
            {benefits.map((benefit) => (
              <div
                key={benefit}
                className="flex items-center gap-2 text-neutral-300"
              >
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span>{benefit}</span>
              </div>
            ))}
          </motion.div>

          {/* CTA Button */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            viewport={{ once: true }}
          >
            <Link
              href="/sign-up"
              className="group inline-flex items-center justify-center gap-3 h-16 px-10 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold text-lg transition-all duration-300 hover:shadow-lg hover:shadow-green-500/30 hover:scale-105"
            >
              <span>Empezar Ahora Gratis</span>
              <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </motion.div>

          {/* Trust badge */}
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            viewport={{ once: true }}
            className="mt-8 text-sm text-neutral-500"
          >
            Mas de{" "}
            <span className="text-green-400 font-semibold">500+ leads</span>{" "}
            gestionados este mes
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}
