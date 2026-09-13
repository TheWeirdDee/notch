"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export interface DocSection {
  id: string;
  label: string;
}

export function DocsNav({ sections }: { sections: DocSection[] }) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "overview");

  useEffect(() => {
    const handleScroll = () => {
      // Offset to trigger highlight slightly before the section header reaches top of viewport
      const threshold = 180;
      let currentActive = sections[0]?.id ?? "overview";

      for (const section of sections) {
        const el = document.getElementById(section.id);
        if (el) {
          const rect = el.getBoundingClientRect();
          // If the top of the element has scrolled past threshold (or is within view)
          if (rect.top <= threshold) {
            currentActive = section.id;
          }
        }
      }

      setActiveId(currentActive);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [sections]);

  return (
    <aside className="lg:sticky lg:top-8">
      <p className="mb-4 text-xs text-ink-soft uppercase tracking-wider font-medium">Documentation</p>
      <nav aria-label="Documentation sections" className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
        {sections.map(({ id, label }) => {
          const isActive = activeId === id;
          return (
            <a
              key={id}
              href={`#${id}`}
              onClick={() => setActiveId(id)}
              className={`text-sm transition-all px-3 py-2 rounded-sm lg:rounded-none lg:px-3 lg:py-2.5 ${
                isActive
                  ? "bg-ink text-bone font-medium lg:bg-[#f7f3eb] lg:text-ink lg:border-l-2 lg:border-cut lg:font-semibold"
                  : "border border-line text-ink-soft hover:bg-ink hover:text-bone lg:border-0 lg:border-l-2 lg:border-transparent lg:hover:border-line lg:hover:text-ink lg:hover:bg-transparent"
              }`}
            >
              {label}
            </a>
          );
        })}
      </nav>
      <Link
        href="/verify"
        className="mt-7 hidden border border-line p-4 text-sm font-medium hover:bg-panel transition-colors lg:block"
      >
        Open cashflow dashboard
      </Link>
    </aside>
  );
}
