import React from 'react';
import { Check, X, Clock } from 'lucide-react';

const STAGES = [
  { id: 'DRAFT', label: 'Draft' },
  { id: 'UNDER_REVIEW', label: 'Under Review' },
  { id: 'EVALUATION', label: 'Evaluation' },
  { id: 'PENDING_APPROVAL', label: 'Approval Gate' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'IN_PRODUCTION', label: 'In Production' }
];

export default function LifecycleStepper({ currentStatus, isBlocked }) {
  const currentIndex = STAGES.findIndex(s => s.id === currentStatus);
  const normalizedIndex = currentIndex === -1 ? 0 : currentIndex;

  return (
    <div className="stepper">
      {STAGES.map((stage, idx) => {
        const isCompleted = idx < normalizedIndex;
        const isCurrent = idx === normalizedIndex;

        let statusClass = '';
        if (isCompleted) statusClass = 'completed';
        else if (isCurrent) statusClass = isBlocked ? 'blocked' : 'active';

        return (
          <div key={stage.id} className={`step-item ${statusClass}`}>
            <div className="step-circle">
              {isCompleted ? (
                <Check size={14} />
              ) : isCurrent && isBlocked ? (
                <X size={14} />
              ) : isCurrent ? (
                <Clock size={14} />
              ) : (
                idx + 1
              )}
            </div>
            <div className="step-label">{stage.label}</div>
          </div>
        );
      })}
    </div>
  );
}
