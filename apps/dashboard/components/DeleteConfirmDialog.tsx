"use client";

import React from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { AlertTriangle } from "lucide-react";

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  leadName?: string | null;
  leadPhone?: string;
}

export function DeleteConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  leadName,
  leadPhone,
}: DeleteConfirmDialogProps) {
  return (
    <AlertDialog.Root open={isOpen} onOpenChange={onClose}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg w-full max-w-md p-6 z-50">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
            </div>
            <div className="flex-1">
              <AlertDialog.Title className="text-lg font-semibold text-gray-900">
                Eliminar Lead
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-2 text-sm text-gray-600">
                ¿Estás seguro de que quieres eliminar el lead{" "}
                <span className="font-semibold">{leadName || "Sin nombre"}</span> con el número{" "}
                <span className="font-semibold">{leadPhone}</span>?
              </AlertDialog.Description>
              <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <p className="text-sm text-yellow-800">
                  Esta acción no se puede deshacer. Se eliminarán permanentemente todos los datos
                  asociados a este lead.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <AlertDialog.Cancel asChild>
              <button className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors">
                Cancelar
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                onClick={onConfirm}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
              >
                Eliminar Lead
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
