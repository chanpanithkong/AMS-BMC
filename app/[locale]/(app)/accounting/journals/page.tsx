import { JournalListPage } from "@/components/gl/journal-list";

// Client-rendered behind sign-in: opt out of instant-navigation validation (see [locale]/layout.tsx).
export const instant = false;

export default function Page() {
  return <JournalListPage />;
}
