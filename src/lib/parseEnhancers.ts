import type { EnhancerMetric } from "./types";

export interface DraftRule {
  brand: string;
  label: string;
  pct: number | null;
  flat_amount: number | null;
  metric: EnhancerMetric;
  threshold: number;
  confident: boolean;
}

const BRAND_HINTS: Array<{ re: RegExp; brand: string }> = [
  { re: /mclaren/i, brand: "McLaren" },
  { re: /aston\s*martin/i, brand: "Aston Martin" },
  { re: /rolls[\s-]*royce/i, brand: "Rolls-Royce" },
  { re: /lamborghini/i, brand: "Lamborghini" },
  { re: /bentley/i, brand: "Bentley" },
];

function detectBrandHeading(line: string): string | null {
  for (const h of BRAND_HINTS) {
    if (h.re.test(line) && /enhancer|salespeople|:/i.test(line)) return h.brand;
  }
  return null;
}

function extractPct(line: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*%/.exec(line);
  return m ? Number(m[1]) : null;
}

function extractFlat(line: string): number | null {
  const m = /\$\s*([\d,]+(?:\.\d+)?)/.exec(line);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

function extractThreshold(line: string): { value: number; confident: boolean } {
  const cleaned = line.replace(/\d+(?:\.\d+)?\s*%/g, " ");
  const verbNum = /(?:sell|sold|selling|collect|acquire)\s+(\d{1,2})/i.exec(cleaned);
  const numNoun = /\b(\d{1,2})\s*\+?\s*(?:new|used|pre-?owned|acquisition|trade|consign|car|unit|deposit|order|rolls|bentley|aston|mclaren|lamborghini)/i.exec(cleaned);
  const hit = verbNum ?? numNoun;
  if (hit) {
    const n = Number(hit[1]);
    if (n >= 1 && n <= 20) return { value: n, confident: true };
  }
  return { value: 1, confident: false };
}

function guessMetric(line: string): { metric: EnhancerMetric; confident: boolean } {
  const l = line.toLowerCase();
  if (/previous client|orphan|deposit|unica|time clock|csi|avg gp|gross per|accessory|compliance|whispers|\besa\b|activation/.test(l)) {
    return { metric: "manual", confident: true };
  }
  const hasTrade = /trade|acquisition|consign/.test(l);
  if (hasTrade) {
    if (/trade/.test(l) && /acquisition/.test(l)) return { metric: "trades_acquisitions", confident: true };
    if (/acquisition/.test(l)) return { metric: "acquisitions", confident: true };
    return { metric: "trades", confident: true };
  }
  if (/priority|magenta/.test(l)) return { metric: "priority_units", confident: true };
  const saysNew = /\bnew\b/.test(l);
  const saysUsed = /pre-?owned|\bused\b|\blbo\b/.test(l);
  const saysSell = /sell|sold/.test(l);
  if (saysSell && saysNew && !saysUsed) return { metric: "new_units", confident: true };
  if (saysSell && saysUsed && !saysNew) return { metric: "used_units", confident: true };
  if (saysSell && /car|vehicle|unit/.test(l) && !saysNew && !saysUsed) {
    return { metric: "total_units", confident: false };
  }
  return { metric: "manual", confident: false };
}

function splitOrClauses(line: string): string[] {
  if (/\bor\b/i.test(line) && /\d/.test(line)) {
    const parts = line.split(/\s+or\s+/i);
    if (parts.filter((p) => /\d/.test(p)).length >= 2) {
      const pct = /(\d+(?:\.\d+)?\s*%)/.exec(line)?.[1] ?? "";
      return parts.map((p, i) => (i === 0 ? p : `${pct} ${p}`.trim()));
    }
  }
  return [line];
}

export function parseEnhancerText(text: string): DraftRule[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const drafts: DraftRule[] = [];
  let currentBrand = "";
  for (const rawLine of lines) {
    const heading = detectBrandHeading(rawLine);
    if (heading) {
      currentBrand = heading;
      continue;
    }
    const lineHasFlat = extractFlat(rawLine) != null;
    if (extractPct(rawLine) == null && !lineHasFlat) continue;
    if (/^[0-9A-Z]{5,8}$/.test(rawLine)) continue;
    for (const line of splitOrClauses(rawLine)) {
      const pct = extractPct(line);
      const flat = extractFlat(line);
      if (pct == null && flat == null) continue;
      const { metric, confident: metricOK } = guessMetric(line);
      const th = metric === "manual" ? { value: 1, confident: true } : extractThreshold(line);
      const label = line.replace(/\s+/g, " ").slice(0, 160);
      drafts.push({
        brand: currentBrand || "All brands",
        label,
        pct: flat != null ? null : pct,
        flat_amount: flat,
        metric,
        threshold: th.value,
        confident: flat == null && metricOK && th.confident && Boolean(currentBrand),
      });
    }
  }
  return drafts;
}
