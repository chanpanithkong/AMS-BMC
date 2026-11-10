"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authApi } from "@/lib/api/endpoints/auth";
import { AppLink } from "@/lib/i18n/navigation";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import { AuthCard, describedBy, Field } from "./auth-layout";

const schema = z.object({ email: z.email("auth.forgot.emailInvalid") });
type Values = z.infer<typeof schema>;

/** Forgot password. The answer never reveals whether the account exists (FR-AUTH-004). */
export function ForgotPasswordForm() {
  const t = useTranslations();
  const describe = useDescribeError();
  const [sent, setSent] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "" } });
  const error = form.formState.errors.email?.message;

  const submit = async ({ email }: Values) => {
    setAlert(null);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (e) {
      setAlert(describe(e).message);
    }
  };

  return (
    <AuthCard title={t("auth.forgot.title")} subtitle={sent ? undefined : t("auth.forgot.subtitle")}>
      {sent ? (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm" role="status">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          {t("auth.forgot.sent")}
        </p>
      ) : (
        <form onSubmit={form.handleSubmit(submit)} noValidate className="mb-4 space-y-4">
          {alert && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{alert}</p>}
          <Field id="email" label={t("auth.forgot.email")} error={error && t(error)}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              aria-invalid={Boolean(error)}
              aria-describedby={describedBy("email", error)}
              {...form.register("email")}
            />
          </Field>
          <Button type="submit" className="w-full" size="lg" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            {t("auth.forgot.submit")}
          </Button>
        </form>
      )}
      <div className="text-center">
        <AppLink href="/login" className="text-sm text-primary underline-offset-4 hover:underline">
          {t("auth.forgot.backToLogin")}
        </AppLink>
      </div>
    </AuthCard>
  );
}
