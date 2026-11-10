"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileText, Search, Truck, UserRound, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { miscApi } from "@/lib/api/endpoints/org";
import type { SearchResult } from "@/lib/api/types/org";
import { useAppRouter } from "@/lib/i18n/navigation";

const TYPE_ICON: Record<SearchResult["type"], LucideIcon> = {
  account: BookOpen, customer: UserRound, supplier: Truck, document: FileText,
};
const TYPES: SearchResult["type"][] = ["account", "customer", "supplier", "document"];

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Global search over accounts, customers, suppliers and documents by number (SRS §14.1). Ctrl/⌘+K opens it. */
export function GlobalSearch() {
  const t = useTranslations("shell.search");
  const router = useAppRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const term = useDebounced(text.trim(), 250);
  const enabled = open && term.length >= 2;

  const query = useQuery({
    queryKey: ["search", term],
    queryFn: ({ signal }) => miscApi.search(term, signal),
    enabled,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = query.data?.data ?? [];
  const go = (result: SearchResult) => {
    setOpen(false);
    setText("");
    router.push(result.href);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="w-9 justify-center px-0 text-muted-foreground lg:w-64 lg:justify-start lg:px-2.5"
        aria-label={t("open")}
        aria-keyshortcuts="Control+K"
      >
        <Search aria-hidden />
        <span className="hidden truncate lg:inline">{t("open")}</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1 font-mono text-[10px] lg:inline">Ctrl K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title={t("open")} description={t("placeholder")}>
        {/* Results come filtered from the server, so cmdk's own filtering is off. */}
        <Command shouldFilter={false}>
        <CommandInput value={text} onValueChange={setText} placeholder={t("placeholder")} />
        <CommandList>
          {!enabled && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("hint")}</p>}
          {enabled && query.isPending && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("searching")}</p>}
          {enabled && query.isError && <p className="px-3 py-6 text-center text-sm text-destructive" role="alert">{t("failed")}</p>}
          {enabled && query.isSuccess && results.length === 0 && <CommandEmpty>{t("empty")}</CommandEmpty>}
          {enabled &&
            TYPES.map((type) => {
              const group = results.filter((r) => r.type === type);
              if (!group.length) return null;
              const Icon = TYPE_ICON[type];
              return (
                <CommandGroup key={type} heading={t(`types.${type}`)}>
                  {group.map((result) => (
                    <CommandItem key={`${type}-${result.id}`} value={`${type}-${result.id}`} onSelect={() => go(result)}>
                      <Icon aria-hidden />
                      <span className="truncate">{result.label}</span>
                      <span className="ml-auto truncate text-xs text-muted-foreground">{result.sublabel}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
