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
          {competitors.userRank 
            ? `You're ranking #${competitors.userRank} out of ${competitors.count} competitors`
            : `You're ranking below ${competitors.count} competitors`}
        </h3>
        
        <div className="max-h-96 overflow-y-auto space-y-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {(() => {
            const userBusiness = competitors.list.find(c => c.isTargetBusiness);
            const userRank = competitors.userRank || (userBusiness ? userBusiness.rank : null);
            
            if (!userRank || userRank <= 10) {
              // If user is in top 10, show top 10
              return competitors.list.slice(0, 10).map((competitor) => (
                <div key={competitor.rank} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs text-gray-600">🍴</span>
                    </div>
                    <div>
                      <div className={`font-medium text-sm ${competitor.isTargetBusiness ? 'text-blue-600 font-semibold' : 'text-gray-900'}`}>
                        {competitor.name}
                      </div>
                      {competitor.rating && (
                        <div className="text-xs text-gray-500">
                          {competitor.rating} ⭐ {competitor.reviewCount ? `${competitor.reviewCount} reviews` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                  <div
                    className={`text-sm font-medium ${
                      competitor.isTargetBusiness 
                        ? 'text-blue-600 font-semibold'
                        : competitor.rank <= 3 
                        ? 'text-green-600' 
                        : 'text-orange-600'
                    }`}
                  >
                    {competitor.rank === 1
                      ? '1st'
                      : competitor.rank === 2
                      ? '2nd'
                      : competitor.rank === 3
                      ? '3rd'
                      : `${competitor.rank}th`}
                  </div>
                </div>
              ));
            }
            
            // User is ranked 11th or lower
            // Show at least 9 businesses above them
            const showAbove = Math.max(9, userRank - 1);
            const aboveCompetitors = competitors.list.slice(0, showAbove);
            const userCompetitor = userBusiness;
            const belowCompetitors = competitors.list.slice(userRank);
            
            return (
              <>
                {/* Competitors above user */}
                {aboveCompetitors.map((competitor) => (
                  <div key={competitor.rank} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs text-gray-600">🍴</span>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{competitor.name}</div>
                        {competitor.rating && (
                          <div className="text-xs text-gray-500">
                            {competitor.rating} ⭐ {competitor.reviewCount ? `${competitor.reviewCount} reviews` : ''}
                          </div>
                        )}
                      </div>
                    </div>
                    <div
                      className={`text-sm font-medium ${
                        competitor.rank <= 3 ? 'text-green-600' : 'text-orange-600'
                      }`}
                    >
                      {competitor.rank === 1
                        ? '1st'
                        : competitor.rank === 2
                        ? '2nd'
                        : competitor.rank === 3
                        ? '3rd'
                        : `${competitor.rank}th`}
                    </div>
                  </div>
                ))}
                
                {/* Divider */}
                {userRank > 10 && (
                  <div className="flex items-center gap-2 my-2 py-2 border-t border-gray-200">
                    <div className="flex-1 h-px bg-gray-200"></div>
                    <span className="text-xs text-gray-500 px-2">... and others ...</span>
                    <div className="flex-1 h-px bg-gray-200"></div>
                  </div>
                )}
                
                {/* User's business */}
                {userCompetitor && (
                  <div className="flex items-center justify-between bg-blue-50 rounded-lg p-2 -mx-2">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-blue-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs text-blue-600">✓</span>
                      </div>
                      <div>
                        <div className="font-semibold text-blue-600 text-sm">{userCompetitor.name} (You)</div>
                        {userCompetitor.rating && (
                          <div className="text-xs text-gray-600">
                            {userCompetitor.rating} ⭐ {userCompetitor.reviewCount ? `${userCompetitor.reviewCount} reviews` : ''}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-blue-600">
                      {userRank === 1
                        ? '1st'
                        : userRank === 2
                        ? '2nd'
                        : userRank === 3
                        ? '3rd'
                        : `${userRank}th`}
                    </div>
                  </div>
                )}
                
                {/* Competitors below user (optional, show a few) */}
                {belowCompetitors.slice(0, 3).map((competitor) => (
                  <div key={competitor.rank} className="flex items-center justify-between opacity-60">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs text-gray-600">🍴</span>
                      </div>
                      <div>
                        <div className="font-medium text-gray-600 text-sm">{competitor.name}</div>
                        {competitor.rating && (
                          <div className="text-xs text-gray-400">
                            {competitor.rating} ⭐ {competitor.reviewCount ? `${competitor.reviewCount} reviews` : ''}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-sm font-medium text-gray-500">
                      {competitor.rank === 1
                        ? '1st'
                        : competitor.rank === 2
                        ? '2nd'
                        : competitor.rank === 3
                        ? '3rd'
                        : `${competitor.rank}th`}
                    </div>
                  </div>
                ))}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
