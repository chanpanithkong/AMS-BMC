"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Eye, EyeOff, Info, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/auth/session";
import { isMock } from "@/lib/config";
import { formatTime } from "@/lib/format/dates";
import { AppLink, useAppRouter } from "@/lib/i18n/navigation";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import { canAccessPath, homePath } from "@/lib/rbac/menu";
import { config } from "@/lib/config";
import { AuthCard, describedBy, Field } from "./auth-layout";
import { DemoLoginPicker } from "./demo-login-picker";

// Client validation helps the user; the server decides (SRS §12.2). Messages are translation keys.
const credentialsSchema = z.object({
  username: z.string().trim().min(1, "auth.login.usernameRequired"),
  password: z.string().min(1, "auth.login.passwordRequired"),
});
type Credentials = z.infer<typeof credentialsSchema>;

const otpSchema = z.object({ otp: z.string().regex(/^\d{6}$/, "auth.mfa.required") });
type OtpValues = z.infer<typeof otpSchema>;

/** SCR-01 Login: credentials, then the MFA (TOTP) step when the account requires it. */
export function LoginForm() {
  const t = useTranslations();
  const describe = useDescribeError();
  const router = useAppRouter();
  const search = useSearchParams();
  const status = useSession((s) => s.status);
  const endReason = useSession((s) => s.endReason);
  const login = useSession((s) => s.login);

  const [step, setStep] = useState<"credentials" | "mfa">("credentials");
  const [showPassword, setShowPassword] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  // Kept in memory only for the MFA step, then dropped.
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  const form = useForm<Credentials>({ resolver: zodResolver(credentialsSchema), defaultValues: { username: "", password: "" } });
  const otpForm = useForm<OtpValues>({ resolver: zodResolver(otpSchema), defaultValues: { otp: "" } });
  const busy = form.formState.isSubmitting || otpForm.formState.isSubmitting;

  // After sign-in, go to the page the user asked for (if their role allows it) or their home page.
  useEffect(() => {
    if (status !== "authenticated") return;
    const user = useSession.getState().user;
    if (!user) return;
    const access = { roles: user.roles, permissions: user.permissions, flags: { inventory: config.featureInventory } };
    const next = search.get("next");
    router.replace(next && next.startsWith("/") && !next.startsWith("//") && canAccessPath(access, next.split("?")[0]) ? next : homePath(access));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once when the session becomes active
  }, [status]);

  // Next.js may keep this page mounted while hidden: do not leave the password in form state.
  const forgetCredentials = () => {
    form.reset({ username: "", password: "" });
    otpForm.reset({ otp: "" });
    setCredentials(null);
    // Next.js may show this same instance to the next person who signs in.
    setStep("credentials");
    setAlert(null);
  };

  const fail = (error: unknown) => {
    if (isApiError(error) && error.code === "LOCKED") {
      const until = error.details.find((d) => d.field === "locked_until")?.value;
      setAlert(until ? t("auth.login.lockedUntil", { time: formatTime(until) }) : describe(error).message);
      setStep("credentials");
      return;
    }
    setAlert(describe(error).message);
  };

  const submitCredentials = async (values: Credentials) => {
    setAlert(null);
    setCredentials(values);
    try {
      await login(values);
      forgetCredentials();
    } catch (error) {
      if (isApiError(error) && error.code === "MFA_REQUIRED") {
        otpForm.reset({ otp: "" });
        setStep("mfa");
      } else {
        fail(error);
      }
    }
  };

  const submitOtp = async ({ otp }: OtpValues) => {
    if (!credentials) return setStep("credentials");
    setAlert(null);
    try {
      await login({ ...credentials, otp });
      forgetCredentials();
    } catch (error) {
      fail(error);
      otpForm.setFocus("otp");
    }
  };

  const signInAs = (username: string, password: string) => {
    form.reset({ username, password });
    setStep("credentials");
    void form.handleSubmit(submitCredentials)();
  };

  const errors = form.formState.errors;
  const otpError = otpForm.formState.errors.otp?.message;
  const notice = endReason === "idle" ? t("auth.login.sessionIdle") : endReason === "expired" ? t("auth.login.sessionExpired") : null;

  return (
    <div className="space-y-4">
      <AuthCard
        title={step === "mfa" ? t("auth.mfa.title") : t("auth.login.title")}
        subtitle={step === "mfa" ? t("auth.mfa.subtitle") : t("auth.login.subtitle")}
      >
        {notice && !alert && (
          <p className="mb-4 flex items-start gap-2 rounded-lg border border-info/30 bg-info/5 p-3 text-sm" role="status">
            <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
            {notice}
          </p>
        )}
        {alert && (
          <p className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert" data-testid="login-error">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {alert}
          </p>
        )}

        {step === "credentials" ? (
          <form onSubmit={form.handleSubmit(submitCredentials)} noValidate className="space-y-4">
            <Field id="username" label={t("auth.login.username")} error={errors.username?.message && t(errors.username.message)}>
              <Input
                id="username"
                autoComplete="username"
                autoFocus
                aria-invalid={Boolean(errors.username)}
                aria-describedby={describedBy("username", errors.username?.message)}
                {...form.register("username")}
              />
            </Field>
            <Field id="password" label={t("auth.login.password")} error={errors.password?.message && t(errors.password.message)}>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="pr-9"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={describedBy("password", errors.password?.message)}
                  {...form.register("password")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-0.5 right-0.5"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? t("auth.login.hidePassword") : t("auth.login.showPassword")}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                </Button>
              </div>
            </Field>
            <Button type="submit" className="w-full" size="lg" disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              {t("auth.login.submit")}
            </Button>
            <div className="text-center">
              <AppLink href="/forgot-password" className="text-sm text-primary underline-offset-4 hover:underline">
                {t("auth.login.forgot")}
              </AppLink>
            </div>
          </form>
        ) : (
          <form onSubmit={otpForm.handleSubmit(submitOtp)} noValidate className="space-y-4">
            <Field id="otp" label={t("auth.mfa.code")} error={otpError && t(otpError)}>
              <Input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                className="text-center font-mono text-lg tracking-[0.4em]"
                aria-invalid={Boolean(otpError)}
                aria-describedby={describedBy("otp", otpError)}
                {...otpForm.register("otp")}
              />
            </Field>
            {isMock && <DemoOtpHint />}
            <Button type="submit" className="w-full" size="lg" disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              {t("auth.mfa.submit")}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => { setAlert(null); setStep("credentials"); }}>
              {t("auth.mfa.back")}
            </Button>
          </form>
        )}
      </AuthCard>
      {isMock && step === "credentials" && <DemoLoginPicker disabled={busy} onPick={signInAs} />}
    </div>
  );
}

function DemoOtpHint() {
  const t = useTranslations("auth.mfa");
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    void import("@/mocks/db/seed").then((m) => setCode(m.DEMO_OTP));
  }, []);
  if (!code) return null;
  return <p className="text-center text-xs text-muted-foreground" data-testid="demo-otp">{t("demoHint", { code })}</p>;
}
