import { ReportCatalogue } from "@/components/reports/catalogue-page";

// Client-rendered behind sign-in: opt out of instant-navigation validation (see [locale]/layout.tsx).
export const instant = false;

export default function Page() {
  return <ReportCatalogue />;
}
