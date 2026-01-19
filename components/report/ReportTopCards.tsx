"use client";

import { AlertTriangle } from "lucide-react";
import type { ImpactCard, CompetitorsCard } from "@/lib/report/types";

interface ReportTopCardsProps {
  impact: ImpactCard;
  competitors: CompetitorsCard;
  businessName: string;
  websiteUrl: string | null;
}

export default function ReportTopCards({
  impact,
  competitors,
  businessName,
  websiteUrl,
}: ReportTopCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-6 mb-8">
      {/* Impact Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          {impact.estimatedLossMonthly !== null
            ? `You could be losing ~$${impact.estimatedLossMonthly}/month due to ${impact.topProblems.length} problems`
            : `You have ${impact.topProblems.length} problems to fix`}
        </h3>
        
        {/* Business Info */}
        <div className="flex items-center gap-3 mb-4">
          {impact.businessAvatar ? (
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
              <img
                src={impact.businessAvatar}
                alt={businessName}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-lg bg-gray-200 flex-shrink-0 flex items-center justify-center">
              <span className="text-gray-400 text-xs">{businessName.charAt(0)}</span>
            </div>
          )}
          <div>
            <div className="font-medium text-gray-900">{businessName}</div>
            {websiteUrl && (
              <div className="text-sm text-gray-500">{websiteUrl.replace(/^https?:\/\//, '')}</div>
            )}
          </div>
        </div>
        
        {/* Top Problems */}
        <div className="space-y-2">
          {impact.topProblems.map((problem, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-gray-700">{problem.label}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Competitors Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          You're ranking below {competitors.count} competitors
        </h3>
        
        {/* Scrollable list showing 5 items, scroll to see more */}
        <div className="max-h-[280px] overflow-y-auto space-y-2 pr-2">
          {competitors.list.map((competitor) => (
            <div 
              key={competitor.rank} 
              className={`flex items-center justify-between py-2 ${
                competitor.isTargetBusiness ? 'bg-blue-50 rounded-lg px-2 -mx-2' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                  competitor.isTargetBusiness ? 'bg-blue-200' : 'bg-gray-100'
                }`}>
                  <span className="text-xs">🍴</span>
                </div>
                <div>
                  <div className={`font-medium text-sm ${
                    competitor.isTargetBusiness ? 'text-blue-600' : 'text-gray-900'
                  }`}>
                    {competitor.name}{competitor.isTargetBusiness ? ' (You)' : ''}
                  </div>
                  {competitor.rating && (
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <span>{competitor.rating}</span>
                      <span className="text-yellow-500">⭐</span>
                    </div>
                  )}
                </div>
              </div>
              <div className={`text-sm font-medium flex-shrink-0 ${
                competitor.isTargetBusiness
                  ? 'text-blue-600'
                  : competitor.rank <= 3 
                  ? 'text-green-600' 
                  : 'text-orange-600'
              }`}>
                {competitor.rank === 1 ? '1st'
                  : competitor.rank === 2 ? '2nd'
                  : competitor.rank === 3 ? '3rd'
                  : `${competitor.rank}th`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
