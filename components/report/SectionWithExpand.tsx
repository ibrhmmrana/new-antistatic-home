"use client";

import { useState, Fragment } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

const DEFAULT_MAX_VISIBLE = 3;

interface SectionWithExpandProps<T> {
  /** All items (rows) in the section */
  items: T[];
  /** Render a single row; second arg is the index in the full list */
  renderRow: (item: T, index: number) => React.ReactNode;
  /** Max rows to show before "Expand" (default 3) */
  maxVisible?: number;
  /** Optional wrapper className for the list container (e.g. space-y-2) */
  className?: string;
}

/**
 * Renders a list of rows. If there are more than maxVisible rows, shows the first
 * maxVisible, then a centered "Expand" button (arrow down). When expanded, shows
 * all rows and a "Collapse" button (arrow up).
 */
export default function SectionWithExpand<T>({
  items,
  renderRow,
  maxVisible = DEFAULT_MAX_VISIBLE,
  className = "",
}: SectionWithExpandProps<T>) {
  const [expanded, setExpanded] = useState(false);
  const total = items.length;
  const shouldCollapse = total > maxVisible;
  const visibleItems = shouldCollapse && !expanded ? items.slice(0, maxVisible) : items;
  const hiddenCount = total - maxVisible;

  return (
    <div className={className}>
      {visibleItems.map((item, i) => (
        <Fragment key={i}>{renderRow(item, i)}</Fragment>
      ))}
      {shouldCollapse && (
        <div className="flex justify-center py-3">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded-lg px-3 py-2 transition-colors"
            aria-expanded={expanded}
          >
            {expanded ? (
              <>
                <ChevronUp className="w-4 h-4" aria-hidden />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" aria-hidden />
                Show {hiddenCount} more
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
