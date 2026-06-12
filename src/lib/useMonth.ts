import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

function startOfThisMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function parseMonthParam(raw: string | null): Date {
  // Expect "YYYY-MM"; fall back to the current month on anything invalid.
  if (raw) {
    const m = /^(\d{4})-(\d{2})$/.exec(raw);
    if (m) {
      const year = Number(m[1]);
      const mon = Number(m[2]);
      if (mon >= 1 && mon <= 12) return new Date(year, mon - 1, 1);
    }
  }
  return startOfThisMonth();
}

function toMonthParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Selected month, stored in the URL (?month=YYYY-MM) so it persists across
 * navigation between Dashboard and Enhancers, survives refresh, and makes
 * links shareable. Falls back to the current month when absent or invalid.
 */
export function useMonth(): {
  month: Date;
  setMonth: (d: Date) => void;
  isCurrentMonth: boolean;
} {
  const [params, setParams] = useSearchParams();
  const month = parseMonthParam(params.get("month"));

  const setMonth = useCallback(
    (d: Date) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          // Omit the param entirely for the current month to keep URLs clean.
          if (toMonthParam(d) === toMonthParam(startOfThisMonth())) {
            next.delete("month");
          } else {
            next.set("month", toMonthParam(d));
          }
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  return {
    month,
    setMonth,
    isCurrentMonth: toMonthParam(month) === toMonthParam(startOfThisMonth()),
  };
}
