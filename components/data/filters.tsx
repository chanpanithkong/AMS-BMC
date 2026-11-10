"use client";

import { Download, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Filters kept in the URL query string, so that a filtered list can be bookmarked and shared
 * (prompt §6). `keys` lists the parameters this list owns.
 */
export function useUrlFilters<K extends string>(keys: readonly K[]) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const serialised = params.toString();

  const filters = useMemo(() => {
    const current = new URLSearchParams(serialised);
    return Object.fromEntries(keys.map((key) => [key, current.get(key) ?? ""])) as Record<K, string>;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keys is a constant list per screen
  }, [serialised]);

  const setFilters = useCallback(
    (patch: Partial<Record<K, string | null>>) => {
      const next = new URLSearchParams(serialised);
      for (const [key, value] of Object.entries(patch) as [K, string | null][]) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.replace(pathname + (qs ? `?${qs}` : ""), { scroll: false });
    },
    [serialised, pathname, router],
  );

  const clear = useCallback(
    () => setFilters(Object.fromEntries(keys.map((key) => [key, null])) as Partial<Record<K, null>>),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keys is a constant list per screen
    [setFilters],
  );

  const active = keys.some((key) => filters[key] !== "");
  return { filters, setFilters, clear, active };
}

interface FilterBarProps {
  /** Current search text (from the URL). */
  search?: string;
  onSearch?: (text: string) => void;
  searchPlaceholder?: string;
  /** Screen-specific filter controls. */
  children?: ReactNode;
  onClear?: () => void;
  canClear?: boolean;
  /** Right-aligned actions: column toggle, export. */
  actions?: ReactNode;
}

/** Search box plus filter controls above a list (SRS NFR-USA-007). */
export function FilterBar({ search, onSearch, searchPlaceholder, children, onClear, canClear, actions }: FilterBarProps) {
  const t = useTranslations("data.filters");
  const [text, setText] = useState(search ?? "");
  const [synced, setSynced] = useState(search ?? "");

  // Follow outside changes (back button, "clear filters").
  if ((search ?? "") !== synced) {
    setSynced(search ?? "");
    setText(search ?? "");
  }

  // Debounce typing before it reaches the URL and the server.
  useEffect(() => {
    if (!onSearch || text === (search ?? "")) return;
    const id = setTimeout(() => onSearch(text), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on typing only
  }, [text]);

  return (
    <div className="mb-3 flex flex-wrap items-end gap-2" data-print="hide">
      {onSearch && (
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={searchPlaceholder ?? t("search")}
            aria-label={searchPlaceholder ?? t("search")}
            className="pl-8"
          />
        </div>
      )}
      {children}
      {onClear && canClear && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X aria-hidden />
          {t("clear")}
        </Button>
      )}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}

interface StatusTab {
  /** "" = all statuses. */
  value: string;
  label: string;
  count?: number;
}

interface StatusTabsProps {
  tabs: StatusTab[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}

/** Status tabs above a document list, e.g. Draft / Submitted / Approved / Posted / Reversed (SCR-04). */
export function StatusTabs({ tabs, value, onChange, label }: StatusTabsProps) {
  return (
    <div role="tablist" aria-label={label} className="mb-3 flex gap-1 overflow-x-auto border-b" data-print="hide">
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value || "all"}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(e) => {
              // Arrow keys move between tabs, as the tabs pattern expects.
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              const index = tabs.findIndex((x) => x.value === value);
              const next = tabs[(index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
              onChange(next.value);
              const buttons = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
              buttons?.[tabs.indexOf(next)]?.focus();
            }}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export type ExportFormat = "pdf" | "xlsx" | "csv";

interface ExportMenuProps {
  formats?: ExportFormat[];
  onExport: (format: ExportFormat) => void;
  disabled?: boolean;
}

/** Export to PDF, Excel or CSV. Exports are produced by the server and audited (SRS §15.4). */
export function ExportMenu({ formats = ["pdf", "xlsx", "csv"], onExport, disabled }: ExportMenuProps) {
  const t = useTranslations("data.export");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Download aria-hidden />
          {t("label")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {formats.map((format) => (
          <DropdownMenuItem key={format} onSelect={() => onExport(format)}>
            {t(format)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
