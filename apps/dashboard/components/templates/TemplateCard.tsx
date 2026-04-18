"use client";

import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Edit, Trash2, Send } from "lucide-react";

export interface Template {
  id: string;
  name: string;
  category: string;
  subject?: string;
  content: string;
  variables: string[];
  usageCount?: number;
  isActive?: boolean;
  createdAt?: string;
}

interface TemplateCardProps {
  template: Template;
  onEdit: (template: Template) => void;
  onDelete: (id: string) => void;
  onUse: (template: Template) => void;
}

export default function TemplateCard({ template, onEdit, onDelete, onUse }: TemplateCardProps) {
  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900 mb-1">{template.name}</h3>
          <div className="flex items-center space-x-2 mb-2">
            <Badge variant="outline" className="text-xs">
              {template.category}
            </Badge>
            {template.usageCount !== undefined && (
              <span className="text-xs text-gray-500">{template.usageCount} usos</span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gray-50 p-3 rounded-lg mb-3">
        <p className="text-sm text-gray-700 line-clamp-3">
          {template.content.length > 100
            ? template.content.substring(0, 100) + "..."
            : template.content}
        </p>
      </div>

      {template.variables && template.variables.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 mb-1">Variables:</p>
          <div className="flex flex-wrap gap-1">
            {template.variables.map((variable) => (
              <span
                key={variable}
                className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800"
              >
                {`{{${variable}}}`}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t">
        <div className="flex space-x-2">
          <button
            onClick={() => onEdit(template)}
            className="p-2 text-gray-400 hover:text-gray-600"
            title="Editar"
          >
            <Edit className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(template.id)}
            className="p-2 text-gray-400 hover:text-red-600"
            title="Eliminar"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={() => onUse(template)}
          className="flex items-center px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
        >
          <Send className="h-4 w-4 mr-1" />
          Usar
        </button>
      </div>
    </Card>
  );
}
