'use client';

import { Step } from '@/app/types';

const STEPS: { key: Step; label: string }[] = [
  { key: 'brief', label: 'Brief' },
  { key: 'concepts', label: '6 Conceptos' },
  { key: 'refine', label: 'Afinación' },
  { key: 'done', label: 'Listo' },
];

const ORDER: Step[] = ['brief', 'concepts', 'refine', 'done'];

interface Props {
  currentStep: Step;
}

export default function StepIndicator({ currentStep }: Props) {
  const currentIdx = ORDER.indexOf(currentStep);

  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <div key={step.key} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  done
                    ? 'bg-[#e42820] text-white'
                    : active
                    ? 'bg-[#e42820]/10 border border-[#e42820] text-[#e42820]'
                    : 'bg-gray-100 border border-gray-200 text-gray-400'
                }`}
              >
                {done ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  idx + 1
                )}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${active ? 'text-gray-900' : done ? 'text-gray-500' : 'text-gray-300'}`}>
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`w-6 h-px ${idx < currentIdx ? 'bg-[#e42820]' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
