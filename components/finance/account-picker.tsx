"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useMemo, useRef, useState } from "react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePostingAccounts } from "@/lib/api/hooks";
import type { Account } from "@/lib/api/types/accounts";
import { useAppLocale } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/** Rank accounts for a search: code prefix first, then English or Khmer name. Header accounts are excluded. */
export function filterAccounts(accounts: Account[], search: string, limit = 50): Account[] {
  const term = search.trim().toLowerCase();
  const posting = accounts.filter((a) => a.is_posting && a.is_active);
  if (!term) return posting.slice(0, limit);
  const byCode = posting.filter((a) => a.code.startsWith(term));
  const byName = posting.filter(
    (a) => !a.code.startsWith(term) && (a.name.toLowerCase().includes(term) || a.name_km.includes(search.trim())),
  );
  return [...byCode, ...byName].slice(0, limit);
}

interface AccountPickerProps {
  /** Account id, or null. */
  value: string | null;
  onChange: (accountId: string | null, account: Account | null) => void;
  /** Accounts to choose from; defaults to the posting accounts the user may see. */
  accounts?: Account[];
  /** Restrict the list, e.g. to bank accounts or expense accounts. */
  filter?: (account: Account) => boolean;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  className?: string;
  /** Extra data attributes for grid keyboard navigation. */
  cellProps?: Record<string, string | number>;
}

/**
 * Account search by code or by English or Khmer name (SRS §14.5). Keyboard-first: start typing on
 * the closed field to open it with that text, arrow keys to move, Enter to choose.
 */
export function AccountPicker({ value, onChange, accounts, filter, disabled, invalid, className, cellProps, ...aria }: AccountPickerProps) {
  const t = useTranslations("finance.account");
  const locale = useAppLocale();
  const query = usePostingAccounts();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const source = accounts ?? query.data;
  const all = useMemo(() => (source ?? []).filter((a) => !filter || filter(a)), [source, filter]);
  const selected = all.find((a) => a.id === value) ?? null;
  const results = useMemo(() => filterAccounts(all, search), [all, search]);
  const nameOf = (a: Account) => (locale === "km" ? a.name_km : a.name);

  const choose = (account: Account) => {
    onChange(account.id, account);
    setOpen(false);
    setSearch("");
    trigger.current?.focus();
  };

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          ref={trigger}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          aria-invalid={invalid || undefined}
          disabled={disabled}
          data-grid-enter="native"
          {...cellProps}
          {...aria}
          onKeyDown={(e) => {
            // Typing on the closed field opens the list with that character.
            if (!open && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== " ") {
              e.preventDefault();
              setSearch(e.key);
              setOpen(true);
            }
            if (!open && (e.key === "Backspace" || e.key === "Delete") && !e.ctrlKey && value) {
              e.preventDefault();
              onChange(null, null);
            }
          }}
          className={cn(
            "flex h-8 w-full min-w-0 items-center justify-between gap-1 rounded-lg border border-input bg-transparent px-2 text-left text-sm outline-none",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
            "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
            className,
          )}
        >
          {selected ? (
            <span className="truncate">
              <span className="font-medium tabular-nums">{selected.code}</span> {nameOf(selected)}
            </span>
          ) : (
            <span className="truncate text-muted-foreground">{t("placeholder")}</span>
          )}
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] p-0">
        {/* Filtering is done by filterAccounts so that code prefixes rank first. */}
        <Command shouldFilter={false}>
          <CommandInput value={search} onValueChange={setSearch} placeholder={t("search")} />
          <CommandList id={listId}>
            {!source && query.isPending && <p className="px-3 py-4 text-sm text-muted-foreground">{t("loading")}</p>}
            {!source && query.isError && <p className="px-3 py-4 text-sm text-destructive" role="alert">{t("failed")}</p>}
            {source && results.length === 0 && <CommandEmpty>{t("empty")}</CommandEmpty>}
            {results.map((account) => (
              <CommandItem key={account.id} value={account.id} onSelect={() => choose(account)} className="gap-2">
                <span className="w-12 shrink-0 font-medium tabular-nums">{account.code}</span>
                <span className="min-w-0 flex-1 truncate">{nameOf(account)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t(`types.${account.type}`)} · {t(account.normal_balance)}
                </span>
                <Check className={cn("size-4 shrink-0", account.id === value ? "opacity-100" : "opacity-0")} aria-hidden />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
