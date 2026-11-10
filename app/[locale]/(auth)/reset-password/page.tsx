import { ResetPasswordForm } from "@/components/auth/reset-password-form";

// Client-rendered behind sign-in: opt out of instant-navigation validation (see [locale]/layout.tsx).
export const instant = false;

export default function Page() {
  return <ResetPasswordForm />;
}
