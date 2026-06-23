import { useState, type ReactNode } from "react";

/**
 * A section that can be expanded/collapsed by clicking its heading.
 * Reuses the existing `.section-head` look so it matches the rest of the UI.
 */
export default function Collapsible({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: ReactNode;
  count?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="collapsible">
      <button
        className="section-head section-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <h2>
          <span className={`chev ${open ? "open" : ""}`} aria-hidden="true">
            ›
          </span>
          {title}
        </h2>
        {count != null && <span className="count">{count}</span>}
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </section>
  );
}
