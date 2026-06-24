import { monthLabel } from "../lib/format";

export default function MonthBar({
  month,
  isCurrentMonth,
  setMonth,
  labelSuffix,
}: {
  month: Date;
  isCurrentMonth: boolean;
  setMonth: (d: Date) => void;
  labelSuffix?: string;
}) {
  return (
    <div className="monthbar">
      <div className="month-nav">
        <button
          className="btn-step"
          aria-label="Previous month"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        >
          ‹
        </button>
        <span className="label">
          {monthLabel(month)}{labelSuffix ? ` ${labelSuffix}` : ""}
        </span>
        <button
          className="btn-step"
          aria-label="Next month"
          disabled={isCurrentMonth}
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        >
          ›
        </button>
      </div>
    </div>
  );
}
