"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Card } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { useLeads } from "../../../lib/api";
import {
  STATUS_LABELS,
  STATUS_VARIANTS,
  type Lead,
  type SortableLeadField,
  type SortOrder,
} from "../../../types";
import { AddLeadModal } from "../../../components/AddLeadModal";
import { EditLeadModal } from "../../../components/EditLeadModal";
import { DeleteConfirmDialog } from "../../../components/DeleteConfirmDialog";
import { SortableTableHeader } from "../../../components/ui/SortableTableHeader";
import {
  Users,
  Search,
  Plus,
  Filter,
  Edit2,
  Trash2,
  Eye,
  X,
} from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { useToast } from "../../../components/ui/toast";
import { useDebounce } from "../../../hooks/use-debounce";

export default function LeadsPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Sorting state
  const [sortBy, setSortBy] = useState<SortableLeadField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Bulk selection state
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [isAllSelected, setIsAllSelected] = useState(false);

  // Ref to maintain focus on search input
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [shouldMaintainFocus, setShouldMaintainFocus] = useState(false);

  // Debounce the search term to avoid too many API calls
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  // Use debounced search term for API call
  const { leads, pagination, isLoading, isError, refetch, isRefreshing } =
    useLeads(
      currentPage,
      20,
      debouncedSearchTerm,
      // NOTE: Ordenamiento se maneja client-side por ahora, no pasamos parámetros de sortBy/sortOrder
    );

  const { getToken } = useAuth();
  const { showToast } = useToast();
  const success = (message: string, title?: string) =>
    showToast({
      type: "success",
      title: title || "Éxito",
      description: message,
    });
  const showError = (message: string, title?: string) =>
    showToast({ type: "error", title: title || "Error", description: message });

  // Reset to first page when search term changes
  useEffect(() => {
    if (debouncedSearchTerm !== "") {
      setCurrentPage(1);
    }
  }, [debouncedSearchTerm]);

  // Update selection when leads change
  useEffect(() => {
    if (leads.length > 0) {
      const currentSelectedIds = new Set(selectedLeads);
      const currentLeadIds = leads.map((lead) => lead.id);
      const validSelectedIds = selectedLeads.filter((id) =>
        currentLeadIds.includes(id),
      );

      if (validSelectedIds.length !== selectedLeads.length) {
        setSelectedLeads(validSelectedIds);
      }

      // Update isAllSelected based on current page leads
      const allCurrentLeadsSelected =
        currentLeadIds.length > 0 &&
        currentLeadIds.every((id) => currentSelectedIds.has(id));
      setIsAllSelected(allCurrentLeadsSelected);
    } else {
      setIsAllSelected(false);
    }
  }, [leads, selectedLeads]);

  // Track when we're actively searching (for UI feedback)
  useEffect(() => {
    const wasSearching = isSearching;
    setIsSearching(searchTerm !== debouncedSearchTerm);

    // If we just finished searching and should maintain focus, refocus the input
    if (
      wasSearching &&
      !isSearching &&
      shouldMaintainFocus &&
      searchInputRef.current
    ) {
      searchInputRef.current.focus();
      setShouldMaintainFocus(false);
    }
  }, [searchTerm, debouncedSearchTerm, isSearching, shouldMaintainFocus]);

  // Maintain focus after data updates if user was typing
  useEffect(() => {
    if (shouldMaintainFocus && searchInputRef.current && !isLoading) {
      // Use setTimeout to ensure focus happens after render
      const timeoutId = setTimeout(() => {
        if (searchInputRef.current && shouldMaintainFocus) {
          searchInputRef.current.focus();
          // Restore cursor position to the end
          const len = searchInputRef.current.value.length;
          searchInputRef.current.setSelectionRange(len, len);
        }
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [leads, isLoading, shouldMaintainFocus]);

  // Sort the leads client-side since backend doesn't support sorting yet
  const sortedLeads = useMemo(() => {
    if (!leads || leads.length === 0) return leads;

    const sorted = [...leads].sort((a, b) => {
      let aValue: any = a[sortBy];
      let bValue: any = b[sortBy];

      // Handle different data types
      if (sortBy === "createdAt" || sortBy === "updatedAt") {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      } else if (sortBy === "score") {
        aValue = aValue ? Number(aValue) : 0;
        bValue = bValue ? Number(bValue) : 0;
      } else if (typeof aValue === "string") {
        aValue = aValue.toLowerCase();
        bValue = bValue ? bValue.toLowerCase() : "";
      }

      // Handle null/undefined values
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return sortOrder === "asc" ? -1 : 1;
      if (bValue == null) return sortOrder === "asc" ? 1 : -1;

      if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
      if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [leads, sortBy, sortOrder]);

  // Handle sorting
  const handleSort = (field: SortableLeadField) => {
    if (sortBy === field) {
      // If clicking the same column, cycle through: asc -> desc -> none -> asc
      if (sortOrder === "asc") {
        setSortOrder("desc");
      } else if (sortOrder === "desc") {
        setSortBy("createdAt"); // Reset to default
        setSortOrder("desc");
      }
    } else {
      // If clicking a different column, start with ascending
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  // Handle individual lead selection
  const handleLeadSelect = (leadId: string, selected: boolean) => {
    if (selected) {
      setSelectedLeads((prev) => [...prev, leadId]);
    } else {
      setSelectedLeads((prev) => prev.filter((id) => id !== leadId));
    }
  };

  // Handle select all toggle
  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      const currentPageLeadIds = sortedLeads.map((lead) => lead.id);
      setSelectedLeads((prev) => {
        const newSelection = new Set([...prev, ...currentPageLeadIds]);
        return Array.from(newSelection);
      });
    } else {
      const currentPageLeadIds = new Set(sortedLeads.map((lead) => lead.id));
      setSelectedLeads((prev) =>
        prev.filter((id) => !currentPageLeadIds.has(id)),
      );
    }
  };

  // Handle bulk WhatsApp authorization update
  const handleBulkWhatsAppUpdate = async (authorized: boolean) => {
    if (selectedLeads.length === 0) {
      showError("Selecciona al menos un lead para actualizar");
      return;
    }

    console.log("🔄 Starting bulk WhatsApp update:", {
      leadIds: selectedLeads,
      authorized,
      count: selectedLeads.length,
    });

    setIsBulkUpdating(true);
    try {
      const response = await fetch("/api/public/leads/bulk-update-whatsapp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadIds: selectedLeads,
          whatsappAuthorized: authorized,
        }),
      });

      console.log("📡 Response received:", {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("✅ Success result:", result);
        success(
          result.message ||
            `${selectedLeads.length} leads actualizados exitosamente`,
        );
        setSelectedLeads([]); // Clear selection
        refetch(); // Refresh the leads list
      } else {
        let errorMessage = "Error desconocido al actualizar los leads";

        try {
          // Clone response to read it safely
          const responseClone = response.clone();
          const errorData = await responseClone.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
          console.error("❌ Error response:", errorData);
        } catch (parseError) {
          console.error("❌ Failed to parse error response:", parseError);
          try {
            const textResponse = await response.text();
            console.error("❌ Raw error response:", textResponse);
            if (textResponse.trim()) {
              errorMessage = textResponse;
            } else {
              errorMessage = `Error ${response.status}: ${response.statusText}`;
            }
          } catch (textError) {
            console.error("❌ Failed to read response as text:", textError);
            errorMessage = `Error ${response.status}: ${response.statusText}`;
          }
        }

        showError(errorMessage);
      }
    } catch (error) {
      console.error("💥 Network/unexpected error:", error);
      if (
        error instanceof TypeError &&
        error.message.includes("Failed to fetch")
      ) {
        showError("Error de conexión: No se pudo conectar con el servidor");
      } else if (error instanceof SyntaxError) {
        showError(
          "Error de respuesta: El servidor devolvió una respuesta inválida",
        );
      } else {
        showError("Error inesperado al actualizar los leads");
      }
    } finally {
      setIsBulkUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Gestión de Leads</h1>
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Gestión de Leads</h1>
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">
            Error al cargar los leads. Verifica que el servidor backend esté
            funcionando.
          </p>
          <button
            onClick={() => refetch()}
            className="mt-2 text-red-600 hover:text-red-800 underline"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // Use sorted leads for display
  const displayLeads = sortedLeads;

  const handleLeadCreated = () => {
    setIsModalOpen(false);
    success("Lead creado exitosamente");
    refetch(); // Refresh the leads list
  };

  const handleEditClick = (lead: Lead) => {
    setSelectedLead(lead);
    setIsEditModalOpen(true);
  };

  const handleEditSuccess = () => {
    setIsEditModalOpen(false);
    success("Lead actualizado exitosamente");
    refetch(); // Refresh the leads list
    setSelectedLead(null);
  };

  const handleDeleteClick = (lead: Lead) => {
    setSelectedLead(lead);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedLead) return;

    try {
      const token = await getToken();
      const response = await fetch(`/api/leads/${selectedLead.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        success("Lead eliminado exitosamente");
        refetch(); // Refresh the leads list
      } else {
        const error = await response.json();
        showError(error.message || "Error al eliminar el lead");
      }
    } catch (error) {
      console.error("Error deleting lead:", error);
      showError("Error al eliminar el lead");
    } finally {
      setIsDeleteDialogOpen(false);
      setSelectedLead(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Gestión de Leads</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center px-4 py-2 bg-green-500 text-white rounded-full hover:bg-green-600 transition-all hover:shadow-lg hover:shadow-green-500/25"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Lead
        </button>
      </div>

      {/* Filters and Search */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Buscar por nombre, teléfono o email..."
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setShouldMaintainFocus(true);
              }}
              onBlur={() => setShouldMaintainFocus(false)}
            />
            {/* Clear search button */}
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setShouldMaintainFocus(true);
                  // Focus back on input after clearing
                  setTimeout(() => {
                    searchInputRef.current?.focus();
                  }, 0);
                }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1} // Prevent this button from taking focus
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {/* Search indicator */}
            {isSearching && (
              <div className="absolute right-10 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-500"></div>
              </div>
            )}
          </div>
          <button className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <Filter className="h-4 w-4 mr-2" />
            Filtros
          </button>
        </div>
        {/* Active search indicator */}
        {debouncedSearchTerm && (
          <div className="mt-3 text-sm text-gray-600">
            Mostrando resultados para:{" "}
            <span className="font-medium">"{debouncedSearchTerm}"</span>
          </div>
        )}
      </Card>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">
              {pagination?.total || 0}
            </p>
            <p className="text-sm text-gray-500">Total Leads</p>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">
              {leads.filter((l: Lead) => l.status === "NUEVO").length}
            </p>
            <p className="text-sm text-gray-500">Nuevos</p>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-yellow-600">
              {leads.filter((l: Lead) => l.status === "QUALIFIED").length}
            </p>
            <p className="text-sm text-gray-500">Calificados</p>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">
              {leads.filter((l: Lead) => l.status === "GANADO").length}
            </p>
            <p className="text-sm text-gray-500">Ganados</p>
          </div>
        </Card>
      </div>

      {/* Floating Action Bar */}
      {selectedLeads.length > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-white rounded-full shadow-2xl border border-gray-200 px-6 py-4 flex items-center space-x-4 animate-in slide-in-from-bottom-2 fade-in duration-300">
            <div className="flex items-center space-x-2 text-gray-700">
              <div className="flex items-center justify-center w-6 h-6 bg-green-100 rounded-full">
                <span className="text-xs font-bold text-green-600">
                  {selectedLeads.length}
                </span>
              </div>
              <span className="text-sm font-medium">
                {selectedLeads.length === 1
                  ? "lead seleccionado"
                  : "leads seleccionados"}
              </span>
            </div>

            <div className="h-6 w-px bg-gray-200"></div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => handleBulkWhatsAppUpdate(true)}
                disabled={isBulkUpdating}
                className="flex items-center px-4 py-2 text-sm bg-green-600 text-white rounded-full hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg"
                title="Autorizar WhatsApp para todos los seleccionados"
              >
                {isBulkUpdating ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                ) : (
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
                Autorizar
              </button>

              <button
                onClick={() => handleBulkWhatsAppUpdate(false)}
                disabled={isBulkUpdating}
                className="flex items-center px-4 py-2 text-sm bg-red-600 text-white rounded-full hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg"
                title="Desautorizar WhatsApp para todos los seleccionados"
              >
                {isBulkUpdating ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                ) : (
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
                Desautorizar
              </button>

              <button
                onClick={() => setSelectedLeads([])}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-all duration-200"
                title="Limpiar selección"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leads Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <SortableTableHeader
                    label="Lead"
                    field="name"
                    currentSort={{ field: sortBy, order: sortOrder }}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <SortableTableHeader
                    label="Teléfono"
                    field="phone"
                    currentSort={{ field: sortBy, order: sortOrder }}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <SortableTableHeader
                    label="Estado"
                    field="status"
                    currentSort={{ field: sortBy, order: sortOrder }}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <SortableTableHeader
                    label="Score"
                    field="score"
                    currentSort={{ field: sortBy, order: sortOrder }}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <SortableTableHeader
                    label="Fecha"
                    field="createdAt"
                    currentSort={{ field: sortBy, order: sortOrder }}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                      title="Seleccionar todos en esta página"
                    />
                    <span>WhatsApp IA</span>
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {displayLeads.length > 0 ? (
                displayLeads.map((lead: Lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <Users className="h-5 w-5 text-gray-600" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {lead.name || "Sin nombre"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {lead.phone}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={STATUS_VARIANTS[lead.status]}>
                        {STATUS_LABELS[lead.status]}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {lead.score ? Number(lead.score).toFixed(1) : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(lead.createdAt).toLocaleDateString("es-ES")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-3">
                        {/* Selection checkbox for bulk operations */}
                        <input
                          type="checkbox"
                          checked={selectedLeads.includes(lead.id)}
                          onChange={(e) =>
                            handleLeadSelect(lead.id, e.target.checked)
                          }
                          className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded flex-shrink-0"
                          title="Seleccionar para operación masiva"
                        />
                        {/* WhatsApp status badge */}
                        {lead.whatsappAuthorized ? (
                          <div className="flex items-center px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                            <svg
                              className="w-3 h-3 mr-1 flex-shrink-0"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                            <span className="whitespace-nowrap">
                              Autorizado
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                            <svg
                              className="w-3 h-3 mr-1 flex-shrink-0"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                clipRule="evenodd"
                              />
                            </svg>
                            <span className="whitespace-nowrap">
                              No autorizado
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-3">
                        <button
                          className="text-green-600 hover:text-green-900 transition-colors"
                          title="Ver detalles"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleEditClick(lead)}
                          className="text-yellow-600 hover:text-yellow-900 transition-colors"
                          title="Editar lead"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(lead)}
                          className="text-red-600 hover:text-red-900 transition-colors"
                          title="Eliminar lead"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <Users className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                    <p className="text-gray-500">
                      {debouncedSearchTerm
                        ? `No se encontraron leads que coincidan con "${debouncedSearchTerm}"`
                        : "No hay leads disponibles"}
                    </p>
                    {debouncedSearchTerm && (
                      <button
                        onClick={() => {
                          setSearchTerm("");
                          setShouldMaintainFocus(true);
                          // Focus back on input after clearing
                          setTimeout(() => {
                            searchInputRef.current?.focus();
                          }, 0);
                        }}
                        className="mt-2 text-green-600 hover:text-green-800 underline"
                      >
                        Limpiar búsqueda
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination - Hide if searching and no results, or if only one page */}
        {pagination && pagination.totalPages > 1 && (
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Mostrando {(pagination.page - 1) * pagination.limit + 1} a{" "}
              {Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
              de {pagination.total} resultados
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={!pagination.hasPrev}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <span className="px-3 py-1 text-sm">
                Página {pagination.page} de {pagination.totalPages}
              </span>
              <button
                onClick={() =>
                  setCurrentPage(
                    Math.min(pagination.totalPages, currentPage + 1),
                  )
                }
                disabled={!pagination.hasNext}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Add Lead Modal */}
      <AddLeadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleLeadCreated}
      />

      {/* Edit Lead Modal */}
      <EditLeadModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={handleEditSuccess}
        lead={selectedLead}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false);
          setSelectedLead(null);
        }}
        onConfirm={handleDeleteConfirm}
        leadName={selectedLead?.name}
        leadPhone={selectedLead?.phone}
      />
    </div>
  );
}
