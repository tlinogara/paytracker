import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

const MONTH_STORAGE_KEY = "paytrack:selectedMonth";

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

function readStoredMonthParam(): string | null {
  if (typeof window === "undefined") return null;
  const stored = window.sessionStorage.getItem(MONTH_STORAGE_KEY);
  return isValidMonthParam(stored) ? stored : null;
}

function writeStoredMonthParam(monthParam: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(MONTH_STORAGE_KEY, monthParam);
}

export function monthHref(path: string, monthParam: string): string {
  const [pathname, rawSearch = ""] = path.split("?");
  const params = new URLSearchParams(rawSearch);

  if (monthParam === currentMonthParam()) {
    params.delete("month");
  } else {
    params.set("month", monthParam);
  }

  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

export function useMonthLink(): (path: string) => string {
  const [params] = useSearchParams();
  const raw = params.get("month");

  const monthParam = useMemo(() => {
    if (isValidMonthParam(raw)) return raw;
    return readStoredMonthParam() ?? currentMonthParam();
  }, [raw]);

  return useCallback((path: string) => monthHref(path, monthParam), [monthParam]);
}

export function useMonth(): {
  month: Date;
  monthParam: string;
  setMonth: (d: Date) => void;
  isCurrentMonth: boolean;
} {
  const [params, setParams] = useSearchParams();
  const raw = params.get("month");

  const monthParam = useMemo(() => {
    if (isValidMonthParam(raw)) return raw;
    return readStoredMonthParam() ?? currentMonthParam();
  }, [raw]);

  const month = useMemo(() => paramToDate(monthParam), [monthParam]);

  useEffect(() => {
    writeStoredMonthParam(monthParam);
  }, [monthParam]);

  const setMonth = useCallback(
    (d: Date) => {
      const target = dateToParam(d);
      writeStoredMonthParam(target);
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
