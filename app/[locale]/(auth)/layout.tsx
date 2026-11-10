import { AuthLayout } from "@/components/auth/auth-layout";

// Client-rendered behind sign-in: opt out of instant-navigation validation (see [locale]/layout.tsx).
export const instant = false;

export default function Layout({ children }: LayoutProps<"/[locale]">) {
  return <AuthLayout>{children}</AuthLayout>;
}
