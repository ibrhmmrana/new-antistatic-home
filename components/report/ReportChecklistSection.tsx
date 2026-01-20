"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import type { ChecklistSection } from "@/lib/report/types";

interface ReportChecklistSectionProps {
  section: ChecklistSection;
}

export default function ReportChecklistSection({ section }: ReportChecklistSectionProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  
  const toggleItem = (key: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedItems(newExpanded);
  };
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'good':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'warn':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      default:
        return <XCircle className="w-5 h-5 text-red-600" />;
    }
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good':
        return 'text-green-600';
      case 'warn':
        return 'text-yellow-600';
      default:
        return 'text-red-600';
    }
  };
  
  const needWork = section.checks.filter(c => c.status === 'bad' || c.status === 'warn').length;
  const total = section.checks.length;
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8 shadow-md">
      {/* Section Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold text-gray-900">{section.title}</h2>
          <div className="text-lg font-semibold text-gray-700">
            {section.score}/{section.maxScore}
          </div>
        </div>
        {total > 0 && (
          <p className="text-sm text-gray-600">
            {total} things reviewed, {needWork} need work
          </p>
        )}
      </div>
      
      {/* Checklist Items */}
      {section.checks.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No checklist items available for this section.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {section.checks.map((check) => {
            const isExpanded = expandedItems.has(check.key);
            
            return (
              <div
                key={check.key}
                className="border border-gray-200 rounded-xl overflow-hidden shadow-sm"
              >
                {/* Item Header */}
                <button
                  onClick={() => toggleItem(check.key)}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 flex-1">
                    {getStatusIcon(check.status)}
                    <span className="font-medium text-gray-900">{check.label}</span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  )}
                </button>
                
                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-3">
                    {/* Why it matters */}
                    <div>
                      <h5 className="text-sm font-semibold text-gray-900 mb-1">Why it matters</h5>
                      <p className="text-sm text-gray-600">{check.whyItMatters}</p>
                    </div>
                    
                    {/* What we found */}
                    <div>
                      <h5 className="text-sm font-semibold text-gray-900 mb-1">What we found</h5>
                      <p className="text-sm text-gray-600">{check.whatWeFound}</p>
                    </div>
                    
                    {/* What we were looking for */}
                    <div>
                      <h5 className="text-sm font-semibold text-gray-900 mb-1">What we were looking for</h5>
                      <p className="text-sm text-gray-600">{check.whatWeWereLookingFor}</p>
                    </div>
                    
                    {/* How to fix */}
                    <div>
                      <h5 className="text-sm font-semibold text-gray-900 mb-1">How to fix</h5>
                      <p className="text-sm text-gray-600">{check.howToFix}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
