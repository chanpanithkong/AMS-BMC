"use client";

import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/api/hooks";
import type { JournalEntry } from "@/lib/api/types/journals";
import { useCurrentCompany } from "@/lib/auth/session";
import { useAppLocale } from "@/lib/i18n/navigation";
import { D } from "@/lib/money/decimal";
import { isPostedState } from "./journal-shared";

/**
 * Printable journal voucher (SRS §15.4): company, number, dates, lines in base currency, totals and
 * signature blocks. Shown only when printing; unposted journals carry a DRAFT watermark.
 */
export function JournalVoucher({ journal }: { journal: JournalEntry }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const format = useFormatters();
  const company = useCurrentCompany();
  const base = company?.base_currency ?? "USD";
  const posted = isPostedState(journal);
  const cell = "border border-black/40 px-1.5 py-1 align-top";
  return (
    <div className="relative hidden text-[10pt] text-black print:block" data-testid="journal-voucher">
      {!posted && (
        <span className="pointer-events-none fixed inset-0 flex items-center justify-center text-[96pt] font-bold text-black/10" style={{ transform: "rotate(-30deg)" }}>
          {t("gl.journal.voucher.draftWatermark")}
        </span>
      )}
      <header className="mb-3 flex justify-between border-b border-black pb-2">
        <div>
          <p className="font-semibold">{company?.name}</p>
          <p>{company?.name_km}</p>
        </div>
        <div className="text-right">
          <p className="text-base font-bold">{t("gl.journal.voucher.title")}</p>
          <p>{journal.journal_no ?? `${t("gl.journals.draftNo")} · ${journal.reference}`}</p>
          <p>{t(`status.${journal.status}`)} · {t(`gl.type.${journal.type}`)}</p>
        </div>
      </header>
      <dl className="mb-3 grid grid-cols-4 gap-x-4 gap-y-1">
        <dt>{t("gl.journal.fields.postingDate")}</dt><dd>{format.date(journal.posting_date)}</dd>
        <dt>{t("gl.journal.fields.documentDate")}</dt><dd>{format.date(journal.document_date)}</dd>
        <dt>{t("gl.journal.fields.reference")}</dt><dd>{journal.reference}</dd>
        <dt>{t("gl.journal.fields.period")}</dt><dd>{journal.period}</dd>
        <dt className="col-span-1">{t("gl.journal.fields.description")}</dt><dd className="col-span-3">{journal.description}</dd>
      </dl>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={cell}>#</th>
            <th className={`${cell} text-left`}>{t("finance.journal.account")}</th>
            <th className={`${cell} text-left`}>{t("finance.journal.description")}</th>
            <th className={`${cell} text-right`}>{t("finance.journal.debit")} ({base})</th>
            <th className={`${cell} text-right`}>{t("finance.journal.credit")} ({base})</th>
          </tr>
        </thead>
        <tbody>
          {journal.lines.map((l) => (
            <tr key={l.id}>
              <td className={cell}>{l.line_no}</td>
              <td className={cell}>{l.account_code} {locale === "km" ? l.account_name_km : l.account_name}</td>
              <td className={cell}>
                {l.description}
                {l.currency !== base && <span> ({format.amount(D(l.debit).plus(l.credit), l.currency, { withCode: true })} @ {l.rate})</span>}
              </td>
              <td className={`${cell} text-right tabular-nums`}>{D(l.debit_base).isZero() ? "" : format.amount(l.debit_base, base)}</td>
              <td className={`${cell} text-right tabular-nums`}>{D(l.credit_base).isZero() ? "" : format.amount(l.credit_base, base)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td className={cell} colSpan={3}>{t("common.total")}</td>
            <td className={`${cell} text-right tabular-nums`}>{format.amount(journal.totals.debit_base, base)}</td>
            <td className={`${cell} text-right tabular-nums`}>{format.amount(journal.totals.credit_base, base)}</td>
          </tr>
        </tfoot>
      </table>
      <div className="mt-10 grid grid-cols-3 gap-6" data-print="keep">
        {[
          [t("gl.journal.voucher.preparedBy"), journal.preparer_name],
          [t("gl.journal.voucher.approvedBy"), journal.approver_name ?? ""],
          [t("gl.journal.voucher.postedBy"), posted ? journal.history.find((h) => h.action === "POSTED")?.user_name ?? "" : ""],
        ].map(([label, name]) => (
          <div key={label} className="border-t border-black pt-1">
            <p className="font-medium">{label}</p>
            <p>{name}</p>
            <p className="mt-6 text-[8pt]">{t("gl.journal.voucher.signature")}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
