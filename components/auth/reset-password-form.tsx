"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authApi } from "@/lib/api/endpoints/auth";
import { AppLink } from "@/lib/i18n/navigation";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import { AuthCard, describedBy, Field } from "./auth-layout";

// Password policy: at least 12 characters (SRS §6.1). The server applies the full policy.
const schema = z
  .object({
    new_password: z.string().min(12, "auth.reset.policy"),
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, { path: ["confirm"], message: "auth.reset.mismatch" });
type Values = z.infer<typeof schema>;

/** Reset password from the single-use link (token in the query string). */
export function ResetPasswordForm() {
  const t = useTranslations();
  const describe = useDescribeError();
  const token = useSearchParams().get("token");
  const [done, setDone] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { new_password: "", confirm: "" } });
  const errors = form.formState.errors;

  const submit = async ({ new_password }: Values) => {
    setAlert(null);
    try {
      await authApi.resetPassword({ token: token ?? "", new_password });
      setDone(true);
    } catch (e) {
      const described = describe(e);
      // Field-level messages come localised from the server (SRS §13.2).
      if (described.fieldErrors.new_password) form.setError("new_password", { message: described.fieldErrors.new_password });
      else setAlert(described.message);
    }
  };

  const message = (key?: string) => (key ? (key.startsWith("auth.") ? t(key) : key) : undefined);
  const loginLink = (
    <div className="text-center">
      <AppLink href="/login" className="text-sm text-primary underline-offset-4 hover:underline">
        {t("auth.forgot.backToLogin")}
      </AppLink>
    </div>
  );

  if (!token) {
    return (
      <AuthCard title={t("auth.reset.title")}>
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
          {t("auth.reset.missingToken")}
        </p>
        {loginLink}
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("auth.reset.title")} subtitle={done ? undefined : t("auth.reset.policy")}>
      {done ? (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm" role="status">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          {t("auth.reset.done")}
        </p>
      ) : (
        <form onSubmit={form.handleSubmit(submit)} noValidate className="mb-4 space-y-4">
          {alert && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{alert}</p>}
          <Field id="new_password" label={t("auth.reset.newPassword")} error={message(errors.new_password?.message)}>
            <Input
              id="new_password"
              type="password"
              autoComplete="new-password"
              autoFocus
              aria-invalid={Boolean(errors.new_password)}
              aria-describedby={describedBy("new_password", errors.new_password?.message)}
              {...form.register("new_password")}
            />
          </Field>
          <Field id="confirm" label={t("auth.reset.confirmPassword")} error={message(errors.confirm?.message)}>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirm)}
              aria-describedby={describedBy("confirm", errors.confirm?.message)}
              {...form.register("confirm")}
            />
          </Field>
          <Button type="submit" className="w-full" size="lg" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            {t("auth.reset.submit")}
          </Button>
        </form>
      )}
      {loginLink}
    </AuthCard>
  );
}
