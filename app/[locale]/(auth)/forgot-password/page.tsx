import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

// Client-rendered behind sign-in: opt out of instant-navigation validation (see [locale]/layout.tsx).
export const instant = false;

export default function Page() {
  return <ForgotPasswordForm />;
}
