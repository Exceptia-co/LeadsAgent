"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Search, Send, User, Users, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Template } from "../templates/TemplateCard";
import BulkSendMessageModal from "./BulkSendMessageModal";
import FloatingLeadSelectionBanner from "./FloatingLeadSelectionBanner";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  status: string;
  whatsappAuthorized?: boolean;
}

interface BulkProactiveMessageSenderProps {
  templates: Template[];
  onBulkSendMessage: (
    leadIds: string[],
    templateId?: string,
    content?: string,
    variables?: { [key: string]: string },
  ) => Promise<void>;
  selectedTemplate?: Template | null;
}

// Simple Checkbox component
const Checkbox = ({
  checked,
  indeterminate,
  onChange,
  ...props
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) => {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate || false;
      }}
      onChange={onChange}
      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 focus:ring-2 focus:ring-offset-0"
      {...props}
    />
  );
};

const ITEMS_PER_PAGE = 10;

export default function BulkProactiveMessageSender({
  templates,
  onBulkSendMessage,
  selectedTemplate,
}: BulkProactiveMessageSenderProps) {
  const { getToken } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);

  // Modal state
  const [showBulkSendModal, setShowBulkSendModal] = useState(false);

  useEffect(() => {
    fetchLeads();
  }, []);

  useEffect(() => {
    // Filter leads for proactive messages
    const filtered = leads.filter((lead) => {
      const matchesSearch =
        lead.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.phone.includes(searchTerm);
      // Consent is opt-in: the server rejects null/undefined too, so a lead
      // without an explicit true must not look sendable here.
      const isAuthorized = lead.whatsappAuthorized === true;
      return matchesSearch && isAuthorized;
    });
    setFilteredLeads(filtered);
    setCurrentPage(1); // Reset to first page when filtering
  }, [leads, searchTerm]);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/leads?limit=200`, {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const result = await response.json();

      setLeads(result?.data ?? result?.leads ?? []);
    } catch (error) {
      console.error("Error fetching leads:", error);
    } finally {
      setLoading(false);
    }
  };

  // Pagination calculations
  const totalPages = Math.ceil(filteredLeads.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentLeads = filteredLeads.slice(startIndex, endIndex);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const currentPageLeadIds = currentLeads.map((lead) => lead.id);
      setSelectedLeads((prev) => new Set([...Array.from(prev), ...currentPageLeadIds]));
    } else {
      const currentPageLeadIds = new Set(currentLeads.map((lead) => lead.id));
      setSelectedLeads(
        (prev) => new Set(Array.from(prev).filter((id) => !currentPageLeadIds.has(id))),
      );
    }
  };

  const handleSelectLead = (leadId: string, checked: boolean) => {
    setSelectedLeads((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(leadId);
      } else {
        newSet.delete(leadId);
      }
      return newSet;
    });
  };

  const clearSelection = () => {
    setSelectedLeads(new Set());
  };

  const openBulkSendModal = () => {
    setShowBulkSendModal(true);
  };

  const closeBulkSendModal = () => {
    setShowBulkSendModal(false);
  };

  const handleBulkSendMessage = async (
    templateId?: string,
    content?: string,
    variables?: { [key: string]: string },
  ) => {
    const selectedLeadIds = Array.from(selectedLeads);

    try {
      await onBulkSendMessage(selectedLeadIds, templateId, content, variables);
      clearSelection();
      closeBulkSendModal();
    } catch (error) {
      throw error; // Re-throw to handle in modal
    }
  };

  // Check states for "select all" checkbox
  const currentPageLeadIds = new Set(currentLeads.map((lead) => lead.id));
  const selectedCurrentPageLeads = Array.from(currentPageLeadIds).filter((id) =>
    selectedLeads.has(id),
  );
  const isAllCurrentPageSelected =
    currentPageLeadIds.size > 0 && selectedCurrentPageLeads.length === currentPageLeadIds.size;
  const isSomeCurrentPageSelected =
    selectedCurrentPageLeads.length > 0 &&
    selectedCurrentPageLeads.length < currentPageLeadIds.size;

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-gray-900">Mensajes Proactivos</h2>
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Search */}
      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            placeholder="Buscar leads por nombre o teléfono..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-3 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
        </div>
      </Card>

      {/* Floating Lead Selection Banner */}
      <FloatingLeadSelectionBanner
        selectedCount={selectedLeads.size}
        totalLeads={filteredLeads.length}
        onSendBulkMessage={openBulkSendModal}
        onClearSelection={clearSelection}
        isLoading={loading}
      />

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <Checkbox
                    checked={isAllCurrentPageSelected}
                    indeterminate={isSomeCurrentPageSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nombre
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Teléfono
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {currentLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className={`hover:bg-gray-50 ${selectedLeads.has(lead.id) ? "bg-green-50" : ""}`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Checkbox
                      checked={selectedLeads.has(lead.id)}
                      onChange={(e) => handleSelectLead(lead.id, e.target.checked)}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {lead.name || "Sin nombre"}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{lead.phone}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{lead.email || "-"}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge variant="outline" className="text-xs">
                      {lead.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-700">
                  Mostrando <span className="font-medium">{startIndex + 1}</span> a{" "}
                  <span className="font-medium">{Math.min(endIndex, filteredLeads.length)}</span> de{" "}
                  <span className="font-medium">{filteredLeads.length}</span> resultados
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm text-gray-700">
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {filteredLeads.length === 0 && !loading && (
        <Card className="p-12 text-center">
          <User className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No hay leads disponibles</h3>
          <p className="text-gray-500">
            {searchTerm
              ? "No se encontraron leads con los criterios de búsqueda."
              : "No hay leads autorizados para WhatsApp disponibles."}
          </p>
        </Card>
      )}

      {/* Bulk Send Message Modal */}
      {showBulkSendModal && (
        <BulkSendMessageModal
          isOpen={showBulkSendModal}
          onClose={closeBulkSendModal}
          onSend={handleBulkSendMessage}
          selectedLeads={Array.from(selectedLeads)
            .map((id) => leads.find((lead) => lead.id === id)!)
            .filter(Boolean)}
          templates={templates}
          selectedTemplate={selectedTemplate}
        />
      )}
    </div>
  );
}
