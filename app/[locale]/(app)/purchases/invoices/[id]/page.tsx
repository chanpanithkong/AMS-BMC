import { InvoicePage } from "@/components/arap/invoice-page";

// Client-rendered behind sign-in: opt out of instant-navigation validation (see [locale]/layout.tsx).
export const instant = false;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoicePage kind="AP" id={id} />;
}
