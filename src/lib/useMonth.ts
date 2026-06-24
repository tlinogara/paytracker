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

export function useMonth(): {
  month: Date;
  monthParam: string;
  setMonth: (d: Date) => void;
  isCurrentMonth: boolean;
} {
  const [params, setParams] = useSearchParams();
  const raw = params.get("month");
  const monthParam = isValidMonthParam(raw) ? raw : currentMonthParam();
  const month = useMemo(() => paramToDate(monthParam), [monthParam]);

  const setMonth = useCallback(
    (d: Date) => {
      const target = dateToParam(d);
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
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
