"use client";

import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import * as Label from "@radix-ui/react-label";
import { X, ChevronDown, Loader2 } from "lucide-react";
import { CreateLeadData, LeadStatus, STATUS_LABELS } from "../types";

interface AddLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (lead: any) => void;
}

interface FormData {
  name: string;
  email: string;
  phone: string;
  status: LeadStatus;
  source: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
  source?: string;
  general?: string;
}

export function AddLeadModal({ isOpen, onClose, onSuccess }: AddLeadModalProps) {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    phone: "",
    status: "NUEVO",
    source: "manual",
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);

  // Reset form when modal opens/closes
  React.useEffect(() => {
    if (!isOpen) {
      setFormData({
        name: "",
        email: "",
        phone: "",
        status: "NUEVO",
        source: "manual",
      });
      setErrors({});
    }
  }, [isOpen]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Phone is required
    if (!formData.phone.trim()) {
      newErrors.phone = "El número de teléfono es obligatorio";
    } else {
      // Basic phone validation
      const phoneRegex = /^[+]?[1-9]\d{1,14}$/;
      const cleanPhone = formData.phone.replace(/[\s\-\(\)]/g, "");
      if (!phoneRegex.test(cleanPhone)) {
        newErrors.phone = "Formato de teléfono inválido";
      }
    }

    // Email validation (optional but if provided, should be valid)
    if (formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email.trim())) {
        newErrors.email = "Formato de email inválido";
      }
    }

    // Name validation (optional but if provided, should not be empty)
    if (formData.name.trim() && formData.name.trim().length < 2) {
      newErrors.name = "El nombre debe tener al menos 2 caracteres";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      // Limpiar el número de teléfono: remover espacios, guiones, paréntesis
      // y el símbolo + para la base de datos
      let cleanPhone = formData.phone.replace(/[\s\-\(\)]/g, "");

      // Si el número empieza con +, lo guardamos sin el +
      if (cleanPhone.startsWith("+")) {
        cleanPhone = cleanPhone.substring(1);
      }

      const leadData: CreateLeadData = {
        name: formData.name.trim() || undefined,
        phone: cleanPhone, // Enviamos el número sin el +
        status: formData.status,
      };

      // Only add optional fields if they have values
      if (formData.email.trim()) {
        leadData.email = formData.email.trim();
      }

      if (formData.source.trim()) {
        leadData.source = formData.source.trim();
      }

      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";
      const response = await fetch(`${API_BASE_URL}/public/leads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(leadData),
      });

      if (!response.ok) {
        const errorData = await response.json();

        // Manejar específicamente el error de duplicado
        if (response.status === 400 && errorData.message?.includes("Ya existe un lead")) {
          setErrors({
            phone: "Ya existe un lead con este número de teléfono",
          });
          return;
        }

        throw new Error(errorData.message || errorData.error || "Error al crear el lead");
      }

      const newLead = await response.json();

      // Añadir el + al número para mostrar en la UI
      if (newLead.phone && !newLead.phone.startsWith("+")) {
        newLead.phone = "+" + newLead.phone;
      }

      onSuccess(newLead);
      onClose();
    } catch (error) {
      console.error("Error creating lead:", error);

      // Si es un error de duplicado específico
      if (error instanceof Error && error.message.includes("Ya existe un lead")) {
        setErrors({
          phone: error.message,
        });
      } else {
        setErrors({
          general: error instanceof Error ? error.message : "Error al crear el lead",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear field error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg w-full max-w-md p-6 z-50">
          <div className="flex items-center justify-between mb-2">
            <Dialog.Title className="text-xl font-semibold text-gray-900">Nuevo Lead</Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="text-sm text-gray-600 mb-4">
            Completa los datos para crear un nuevo lead en el sistema.
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* General Error */}
            {errors.general && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-red-800 text-sm">{errors.general}</p>
              </div>
            )}

            {/* Name Field */}
            <div>
              <Label.Root htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Nombre (opcional)
              </Label.Root>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                  errors.name ? "border-red-300" : "border-gray-300"
                }`}
                placeholder="Nombre del lead"
                disabled={isLoading}
              />
              {errors.name && <p className="text-red-600 text-xs mt-1">{errors.name}</p>}
            </div>

            {/* Phone Field */}
            <div>
              <Label.Root htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                Teléfono *
              </Label.Root>
              <input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => handleInputChange("phone", e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                  errors.phone ? "border-red-300" : "border-gray-300"
                }`}
                placeholder="+34 666 123 456"
                disabled={isLoading}
                required
              />
              {errors.phone && <p className="text-red-600 text-xs mt-1">{errors.phone}</p>}
            </div>

            {/* Email Field */}
            <div>
              <Label.Root htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email (opcional)
              </Label.Root>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                  errors.email ? "border-red-300" : "border-gray-300"
                }`}
                placeholder="email@ejemplo.com"
                disabled={isLoading}
              />
              {errors.email && <p className="text-red-600 text-xs mt-1">{errors.email}</p>}
            </div>

            {/* Status Field */}
            <div>
              <Label.Root className="block text-sm font-medium text-gray-700 mb-1">
                Estado
              </Label.Root>
              <Select.Root
                value={formData.status}
                onValueChange={(value) => handleInputChange("status", value as LeadStatus)}
              >
                <Select.Trigger className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white text-left flex items-center justify-between">
                  <Select.Value>{STATUS_LABELS[formData.status]}</Select.Value>
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="bg-white border border-gray-300 rounded-md shadow-lg z-50">
                    <Select.Viewport className="p-1">
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <Select.Item
                          key={value}
                          value={value}
                          className="px-3 py-2 text-sm hover:bg-green-50 cursor-pointer rounded-sm outline-none"
                        >
                          <Select.ItemText>{label}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>

            {/* Source Field */}
            <div>
              <Label.Root htmlFor="source" className="block text-sm font-medium text-gray-700 mb-1">
                Fuente (opcional)
              </Label.Root>
              <input
                id="source"
                type="text"
                value={formData.source}
                onChange={(e) => handleInputChange("source", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="manual, website, referido..."
                disabled={isLoading}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {isLoading ? "Creando..." : "Crear Lead"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
