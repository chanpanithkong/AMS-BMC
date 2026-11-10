import { ComingSoonPage } from "@/components/feedback/pages";

// Client-rendered behind sign-in: opt out of instant-navigation validation (see [locale]/layout.tsx).
export const instant = false;

// Screens that later phases deliver. Each menu route resolves here until its own page exists.
export default function Page() {
  return <ComingSoonPage />;
}
