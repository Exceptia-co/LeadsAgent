"use client";

import React, { useState, useEffect } from "react";
import { CheckCircle, XCircle, AlertCircle, Info, X } from "lucide-react";
import { Toast, setToastListener } from "../hooks/use-toast";

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    // Set up the global toast listener
    setToastListener((toast) => {
      setToasts((prev) => [...prev, toast]);

      // Auto remove toast after duration
      if (toast.duration) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toast.id));
        }, toast.duration);
      }
    });

    return () => {
      setToastListener(null);
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const getIcon = (type: Toast["type"]) => {
    switch (type) {
      case "success":
        return <CheckCircle className="h-5 w-5 text-green-400" />;
      case "error":
        return <XCircle className="h-5 w-5 text-red-400" />;
      case "warning":
        return <AlertCircle className="h-5 w-5 text-yellow-400" />;
      case "info":
        return <Info className="h-5 w-5 text-green-400" />;
    }
  };

  const getStyles = (type: Toast["type"]) => {
    switch (type) {
      case "success":
        return "bg-white border-green-200 shadow-lg";
      case "error":
        return "bg-white border-red-200 shadow-lg";
      case "warning":
        return "bg-white border-yellow-200 shadow-lg";
      case "info":
        return "bg-white border-green-200 shadow-lg";
    }
  };

  const getTextColor = (type: Toast["type"]) => {
    switch (type) {
      case "success":
        return "text-green-800";
      case "error":
        return "text-red-800";
      case "warning":
        return "text-yellow-800";
      case "info":
        return "text-green-800";
    }
  };

  return (
    <>
      {children}

      {/* Toast Container */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              flex items-start p-4 mb-2 w-96 border rounded-lg
              ${getStyles(toast.type)}
              animate-in slide-in-from-bottom-5 fade-in duration-300
            `}
          >
            <div className="flex-shrink-0 mt-0.5">{getIcon(toast.type)}</div>
            <div className="ml-3 flex-1">
              {toast.title && (
                <p className={`text-sm font-semibold ${getTextColor(toast.type)}`}>{toast.title}</p>
              )}
              <p className={`text-sm ${getTextColor(toast.type)} ${toast.title ? "mt-1" : ""}`}>
                {toast.message}
              </p>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-4 flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
