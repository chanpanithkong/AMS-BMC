"use client";

import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { useFormatters } from "@/lib/api/hooks";
import { D, parseAmountInput, toWire, type AmountLike } from "@/lib/money/decimal";
import { formatAmount } from "@/lib/money/format";
import { cn } from "@/lib/utils";

interface AmountTextProps {
  value: AmountLike;
  currency: string;
  /** Show the currency code after the number. Amount columns carry the code in their header instead. */
  withCode?: boolean;
  /** Render "—" for zero (ledger-style debit/credit columns). */
  blankZero?: boolean;
  className?: string;
}

/** Read-only amount: right-aligned, tabular figures, negatives per the user's preference (SRS §14.1). */
export function AmountText({ value, currency, withCode, blankZero, className }: AmountTextProps) {
  const format = useFormatters();
  const negative = D(value).isNegative();
  if (blankZero && D(value).isZero()) {
    return <span className={cn("amount block text-muted-foreground", className)}>—</span>;
  }
  return (
    <span className={cn("amount block", negative && "text-destructive", className)} data-negative={negative || undefined}>
      {format.amount(value, currency, { withCode })}
    </span>
  );
}

interface AmountInputProps extends Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> {
  /** Decimal string ("1250.00"), or "" when empty. Never a number. */
  value: string;
  onValueChange: (value: string) => void;
  /** Sets the number of decimals: USD 2, KHR 0, others from settings. */
  currency: string;
  allowNegative?: boolean;
}

/**
 * Amount entry. Works on decimal strings only; shows thousands separators when not focused; accepts
 * pasted text such as "$1,250.00" or "(1,250.00)"; rounds to the currency's minor unit on blur.
 */
export function AmountInput({ value, onValueChange, currency, allowNegative, className, onFocus, onBlur, ...props }: AmountInputProps) {
  // While the field has focus (or holds text that is not a number) the raw text is shown.
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const selectAll = useRef(false);

  // On focus the formatted text is swapped for the raw amount; select it once that has rendered,
  // so that typing replaces the amount.
  useLayoutEffect(() => {
    if (!selectAll.current) return;
    selectAll.current = false;
    input.current?.select();
  });

  const display = draft ?? (value === "" ? "" : formatAmount(value, currency, { negative: "minus" }));

  const commit = (text: string, round: boolean) => {
    const parsed = parseAmountInput(text, { allowNegative });
    if (parsed === null) {
      setInvalid(true);
      return false;
    }
    setInvalid(false);
    onValueChange(parsed === "" ? "" : round ? toWire(parsed, currency) : parsed);
    return true;
  };

  return (
    <Input
      {...props}
      ref={input}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={display}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={cn("amount", className)}
      onFocus={(e) => {
        selectAll.current = true;
        setDraft(value);
        onFocus?.(e);
      }}
      onChange={(e) => {
        const text = e.target.value;
        // Digits, separators, a leading minus and accounting brackets only.
        if (!/^[\d.,\s()-]*$/.test(text)) return;
        setDraft(text);
        commit(text, false);
      }}
      onPaste={(e) => {
        const parsed = parseAmountInput(e.clipboardData.getData("text"), { allowNegative });
        e.preventDefault();
        if (parsed === null) return setInvalid(true);
        setDraft(parsed);
        commit(parsed, false);
      }}
      onBlur={(e) => {
        // Keep text that is not a number on screen so the user can correct it.
        if (commit(draft ?? "", true)) setDraft(null);
        onBlur?.(e);
      }}
    />
  );
}
