import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

function currentMonthParam(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function isValidMonthParam(raw: string | null): raw is string {
  if (!raw) return false;
  const m = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!m) return false;
  const mon = Number(m[2]);
  return mon >= 1 && mon <= 12;
}

function paramToDate(param: string): Date {
  const [y, mo] = param.split("-").map(Number);
  return new Date(y, mo - 1, 1);
}

function dateToParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Selected month, stored in the URL (?month=YYYY-MM) so it persists across
 * navigation between Dashboard and Enhancers, survives refresh, and makes
 * links shareable. Falls back to the current month when absent or invalid.
 *
 * IMPORTANT: the returned `month` Date is memoized on the canonical
 * "YYYY-MM" string, so its reference is stable across renders while the
 * month is unchanged. Effects that depend on `month` therefore fire only
 * when the month actually changes — not on every render.
 */
export function useMonth(): {
  month: Date;
  monthParam: string; // canonical "YYYY-MM"
  setMonth: (d: Date) => void;
  isCurrentMonth: boolean;
} {
  const [params, setParams] = useSearchParams();
  const raw = params.get("month");

  // Canonical string is the source of truth; the Date is derived from it.
  const monthParam = isValidMonthParam(raw) ? raw : currentMonthParam();

  // Stable Date reference: only rebuilt when monthParam changes.
  const month = useMemo(() => paramToDate(monthParam), [monthParam]);

  const setMonth = useCallback(
    (d: Date) => {
      const target = dateToParam(d);
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          // Omit the param for the current month to keep URLs clean.
          if (target === currentMonthParam()) next.delete("month");
          else next.set("month", target);
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  return {
    month,
    monthParam,
    setMonth,
    isCurrentMonth: monthParam === currentMonthParam(),
  };
}
