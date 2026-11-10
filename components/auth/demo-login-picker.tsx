"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useAppLocale } from "@/lib/i18n/navigation";

interface DemoUser {
  role: string;
  username: string;
  full_name: string;
  full_name_km: string;
  mfa: boolean;
}

/** "Sign in as…" role picker for demos. Rendered in mock mode only (prompt §4). */
export function DemoLoginPicker({ onPick, disabled }: { onPick: (username: string, password: string) => void; disabled?: boolean }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const [demo, setDemo] = useState<{ users: DemoUser[]; password: string } | null>(null);

  // The seed is loaded on demand so that it never ships in the live-mode bundle.
  useEffect(() => {
    void import("@/mocks/db/seed").then((m) => setDemo({ users: m.DEMO_USERS, password: m.DEMO_PASSWORD }));
  }, []);
  if (!demo) return null;

  return (
    <section className="rounded-xl border border-dashed bg-card p-4" aria-labelledby="demo-title">
      <h2 id="demo-title" className="text-sm font-semibold">{t("auth.demo.title")}</h2>
      <p className="mb-3 text-xs text-muted-foreground">{t("auth.demo.hint")}</p>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {demo.users.map((user) => (
          <li key={user.username}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(user.username, demo.password)}
              data-testid={`demo-${user.username}`}
              className="flex w-full flex-col rounded-md border px-2.5 py-1.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {t(`roles.${user.role}`)}
                {user.mfa && <span className="rounded border px-1 text-[10px] font-normal text-muted-foreground">{t("auth.demo.mfaTag")}</span>}
              </span>
              <span className="text-xs text-muted-foreground">
                {locale === "km" ? user.full_name_km : user.full_name} · {user.username}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
