"use client";

import type { Prescription } from "@/lib/report/snapshotTypes";

interface PrescriptionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prescription: Prescription | undefined;
}

export default function PrescriptionDrawer({
  open,
  onOpenChange,
  prescription,
}: PrescriptionDrawerProps) {
  return (
    <>
      {/* Overlay with fade */}
      <div
        className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-300 ease-out"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
        aria-hidden="true"
        onClick={() => onOpenChange(false)}
      />
      {/* Drawer: outer padding + rounded corners. When closed, translate off by 100% + gap so nothing shows. */}
      <div
        className="fixed top-4 right-4 bottom-4 left-4 z-50 flex flex-col bg-white shadow-xl overflow-hidden transition-[transform] duration-300 ease-out rounded-xl md:left-auto md:top-6 md:right-6 md:bottom-6 md:w-full md:max-w-lg"
        style={{
          transform: open ? "translateX(0)" : "translateX(calc(100% + 2rem))",
          pointerEvents: open ? "auto" : "none",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prescription-drawer-title"
      >
        <div className="flex-1 overflow-y-auto p-5 pb-6 md:p-8 min-h-0">
          {prescription ? (
            <>
              <h2 id="prescription-drawer-title" className="text-xl font-semibold text-gray-900 mb-4">
                {prescription.title}
              </h2>
              {/* Module badge */}
              <div className="mb-4 p-4 rounded-lg bg-gray-50 border border-gray-200">
                <div className="font-medium text-gray-900">{prescription.moduleName}</div>
                <div className="text-sm text-gray-500">{prescription.moduleTagline}</div>
              </div>
              {/* Why this matters */}
              <div className="mb-4">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Why this matters
                </h3>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {prescription.whyThisMatters}
                </p>
              </div>
              {/* How to fix */}
              <div className="mb-6">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  How to fix
                </h3>
                <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                  {prescription.howToFix.map((step, i) => (
                    <li key={i} className="pl-1">
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
              {/* CTA: Sign up to app */}
              <a
                href="https://app.antistatic.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3 px-4 rounded-lg font-medium text-center text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                Sign up
              </a>
            </>
          ) : (
            <p className="text-sm text-gray-500">No prescription selected.</p>
          )}
        </div>
        <div className="flex-shrink-0 p-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-6 md:pb-6 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full py-3 md:py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}
