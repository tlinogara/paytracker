const NEGATIVE_CURRENCY = /[-−]\s*\$/;
const EMPTY_MARKER = "pending-approvals-empty";

function syncPendingApprovals(): void {
  document.querySelectorAll<HTMLElement>(".pend-list").forEach((list) => {
    const section = list.closest<HTMLElement>("section.collapsible");
    const heading = section?.querySelector<HTMLElement>(".section-toggle h2");
    if (!section || !heading?.textContent?.includes("Pending approvals")) return;

    const cards = Array.from(list.querySelectorAll<HTMLElement>(":scope > .pend-card"));
    const visibleCards = cards.filter((card) => {
      const isNegative = NEGATIVE_CURRENCY.test(card.textContent ?? "");
      if (card.hidden !== isNegative) card.hidden = isNegative;
      return !isNegative;
    });

    visibleCards
      .sort((a, b) => {
        const aName = a.querySelector<HTMLElement>(".name")?.textContent?.trim() ?? "";
        const bName = b.querySelector<HTMLElement>(".name")?.textContent?.trim() ?? "";
        return aName.localeCompare(bName, undefined, { sensitivity: "base", numeric: true });
      })
      .forEach((card, index) => {
        const order = String(index);
        if (card.style.order !== order) card.style.order = order;
      });

    const count = section.querySelector<HTMLElement>(".section-toggle .count");
    const nextCount = `${visibleCards.length} qualified, unpaid`;
    if (count && count.textContent !== nextCount) count.textContent = nextCount;

    const body = section.querySelector<HTMLElement>(".collapsible-body");
    if (!body) return;

    const existingEmpty = body.querySelector<HTMLElement>(`[data-ui-marker="${EMPTY_MARKER}"]`);
    if (visibleCards.length === 0 && cards.length > 0) {
      list.hidden = true;
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
      list.hidden = false;
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
