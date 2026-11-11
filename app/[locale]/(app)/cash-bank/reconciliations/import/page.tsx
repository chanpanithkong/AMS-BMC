import { StatementImportPage } from "@/components/cb/statement-import-page";

// Client-rendered behind sign-in: opt out of instant-navigation validation (see [locale]/layout.tsx).
export const instant = false;

export default function Page() {
  return <StatementImportPage />;
}
