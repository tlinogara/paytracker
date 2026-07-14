const NEGATIVE_SIGN = /[-−–—﹣－]\s*\$/u;
const ACCOUNTING_NEGATIVE = /\(\s*\$\s*[\d,]+(?:\.\d+)?\s*\)/u;
const EMPTY_MARKER = "pending-approvals-empty";

function containsNegativeCurrency(value: string): boolean {
  return NEGATIVE_SIGN.test(value) || ACCOUNTING_NEGATIVE.test(value);
}

function proposedAmountText(card: HTMLElement): string {
  const approveButton = card.querySelector<HTMLElement>(".btn-approve");
  if (approveButton?.textContent) return approveButton.textContent;

  const explanation = card.querySelector<HTMLElement>(".why");
  if (explanation?.textContent) {
    const text = explanation.textContent;
    const equalsIndex = text.lastIndexOf("=");
    if (equalsIndex >= 0) return text.slice(equalsIndex + 1);
    return text;
  }

  return card.textContent ?? "";
}

function setCardVisible(card: HTMLElement, visible: boolean): void {
  card.dataset.pendingApprovalVisible = visible ? "true" : "false";
  if (visible) {
    card.style.removeProperty("display");
    card.removeAttribute("aria-hidden");
  } else {
    card.style.setProperty("display", "none", "important");
    card.setAttribute("aria-hidden", "true");
  }
}

function syncPendingApprovals(): void {
  document.querySelectorAll<HTMLElement>(".pend-list").forEach((list) => {
    const section = list.closest<HTMLElement>("section.collapsible");
    const heading = section?.querySelector<HTMLElement>(".section-toggle h2");
    if (!section || !heading?.textContent?.includes("Pending approvals")) return;

    const cards = Array.from(list.querySelectorAll<HTMLElement>(":scope > .pend-card"));
    const visibleCards = cards.filter((card) => {
      const isNegative = containsNegativeCurrency(proposedAmountText(card));
      setCardVisible(card, !isNegative);
      return !isNegative;
    });

    visibleCards
      .sort((a, b) => {
        const aName = a.querySelector<HTMLElement>(".name")?.textContent?.trim() ?? "";
        const bName = b.querySelector<HTMLElement>(".name")?.textContent?.trim() ?? "";
        return aName.localeCompare(bName, undefined, { sensitivity: "base", numeric: true });
      })
      .forEach((card) => list.appendChild(card));

    const count = section.querySelector<HTMLElement>(".section-toggle .count");
    const nextCount = `${visibleCards.length} qualified, unpaid`;
    if (count && count.textContent !== nextCount) count.textContent = nextCount;

    const body = section.querySelector<HTMLElement>(".collapsible-body");
    if (!body) return;

    const existingEmpty = body.querySelector<HTMLElement>(`[data-ui-marker="${EMPTY_MARKER}"]`);
    if (visibleCards.length === 0 && cards.length > 0) {
      list.style.setProperty("display", "none", "important");
      if (!existingEmpty) {
        const wrapper = document.createElement("div");
        wrapper.className = "tablewrap";
        wrapper.dataset.uiMarker = EMPTY_MARKER;

        const message = document.createElement("div");
        message.className = "empty";
        message.textContent = "No newly qualified bonus payouts.";
        wrapper.appendChild(message);
        body.appendChild(wrapper);
      }
    } else {
      list.style.removeProperty("display");
      existingEmpty?.remove();
    }
  });
}

let queued = false;
function queueSync(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    syncPendingApprovals();
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", queueSync, { once: true });
  } else {
    queueSync();
  }

  new MutationObserver(queueSync).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}
