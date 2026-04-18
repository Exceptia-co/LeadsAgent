"use client";

import React, { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import * as Label from "@radix-ui/react-label";
import { X, ChevronDown, Loader2 } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { Lead, LeadStatus, STATUS_LABELS } from "../types";

interface EditLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  lead: Lead | null;
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

export function EditLeadModal({ isOpen, onClose, onSuccess, lead }: EditLeadModalProps) {
  const { getToken } = useAuth();
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    phone: "",
    status: "NUEVO",
    source: "",
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);

  // Load lead data when modal opens or lead changes
  useEffect(() => {
    if (lead && isOpen) {
      setFormData({
        name: lead.name || "",
        email: lead.email || "",
        phone: lead.phone || "",
        status: lead.status,
        source: lead.source || "",
      });
      setErrors({});
    }
  }, [lead, isOpen]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Phone is required
    if (!formData.phone.trim()) {
      newErrors.phone = "El número de teléfono es obligatorio";
    } else {
      // Basic phone validation
      const phoneRegex = /^[+]?[1-9]\d{1,14}$/;
      const cleanPhone = formData.phone.replace(/[\s\-\()]/g, "");
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

    if (!validateForm() || !lead) {
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      // Limpiar el número de teléfono: remover espacios, guiones, paréntesis
      // y el símbolo + para la base de datos
      let cleanPhone = formData.phone.replace(/[\s\-\()]/g, "");

      // Si el número empieza con +, lo guardamos sin el +
      if (cleanPhone.startsWith("+")) {
        cleanPhone = cleanPhone.substring(1);
      }

      const updateData = {
        name: formData.name.trim() || undefined,
        phone: cleanPhone,
        status: formData.status,
        email: formData.email.trim() || undefined,
        source: formData.source.trim() || undefined,
      };

      // Get authentication token from Clerk
      // Using default template which should work with @clerk/backend verifyToken
      const token = await getToken();

      if (!token) {
        throw new Error("No se pudo obtener el token de autenticación");
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };

      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";
      const response = await fetch(`${API_BASE_URL}/leads/${lead.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(updateData),
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

        throw new Error(errorData.message || errorData.error || "Error al actualizar el lead");
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error("Error updating lead:", error);
      console.error("Lead ID:", lead.id);
      console.error("API URL:", process.env.NEXT_PUBLIC_API_URL);

      // Si es un error de duplicado específico
      if (error instanceof Error && error.message.includes("Ya existe un lead")) {
        setErrors({
          phone: error.message,
        });
      } else {
        setErrors({
          general: error instanceof Error ? error.message : "Error al actualizar el lead",
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

  if (!lead) return null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg w-full max-w-md p-6 z-50">
          <div className="flex items-center justify-between mb-2">
            <Dialog.Title className="text-xl font-semibold text-gray-900">Editar Lead</Dialog.Title>
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
            Actualiza la información del lead.
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
                Nombre
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
                Email
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
                Fuente
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
                {isLoading ? "Actualizando..." : "Actualizar"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
