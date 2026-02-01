"use client";

import type { InstagramCommentSnapshot } from "@/lib/report/snapshotTypes";

interface ReportInstagramCommentsProps {
  comments: InstagramCommentSnapshot[];
}

/**
 * Displays extracted Instagram comments in the report.
 * Used in both /report/[scanId]/analysis and /r/[reportId].
 */
export default function ReportInstagramComments({ comments }: ReportInstagramCommentsProps) {
  if (!comments?.length) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8 shadow-sm">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">💬 Instagram Comments</h2>
      <p className="text-sm text-gray-600 mb-4">
        Comments extracted from recent posts (used for AI engagement analysis).
      </p>
      <div className="space-y-3 max-h-[480px] overflow-y-auto">
        {comments.map((comment, index) => (
          <div
            key={`${comment.authorUsername ?? "anon"}-${index}`}
            className="border border-gray-100 rounded-lg p-4 hover:border-gray-200 transition-colors"
          >
            <div className="flex items-start gap-2">
              {comment.authorUsername && (
                <span className="text-sm font-medium text-gray-700 shrink-0">
                  @{comment.authorUsername}
                </span>
              )}
              <p className="text-sm text-gray-800 flex-1">{comment.text}</p>
            </div>
            {comment.postContext && (
              <p className="text-xs text-gray-500 mt-2 truncate" title={comment.postContext}>
                {comment.postContext}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
