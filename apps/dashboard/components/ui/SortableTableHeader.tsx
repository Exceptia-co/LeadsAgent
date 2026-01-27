"use client";

import React from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { SortOrder, SortableLeadField } from "../../types";

interface SortableTableHeaderProps {
  field: SortableLeadField;
  label: string;
  currentSort: {
    field: SortableLeadField;
    order: SortOrder;
  };
  onSort: (field: SortableLeadField) => void;
  className?: string;
}

export function SortableTableHeader({
  field,
  label,
  currentSort,
  onSort,
  className = "",
}: SortableTableHeaderProps) {
  const isActive = currentSort.field === field;
  const isAscending = isActive && currentSort.order === "asc";
  const isDescending = isActive && currentSort.order === "desc";

  const handleClick = () => {
    onSort(field);
  };

  const getSortIcon = () => {
    if (isAscending) {
      return <ChevronUp className="h-4 w-4" />;
    }
    if (isDescending) {
      return <ChevronDown className="h-4 w-4" />;
    }
    return <ChevronsUpDown className="h-4 w-4 opacity-50" />;
  };

  const getSortAriaLabel = () => {
    if (isAscending) {
      return `Ordenado por ${label} ascendente. Click para descendente.`;
    }
    if (isDescending) {
      return `Ordenado por ${label} descendente. Click para quitar orden.`;
    }
    return `Click para ordenar por ${label}`;
  };

  return (
    <button
      onClick={handleClick}
      className={`
        flex items-center justify-between w-full text-left
        hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-inset
        ${isActive ? "text-gray-900" : "text-gray-500"}
        ${className}
      `}
      aria-label={getSortAriaLabel()}
      title={getSortAriaLabel()}
    >
      <span className="text-xs font-medium uppercase tracking-wider">
        {label}
      </span>
      <span
        className={`ml-1 transition-colors ${isActive ? "text-gray-700" : "text-gray-400"}`}
      >
        {getSortIcon()}
      </span>
    </button>
  );
}
