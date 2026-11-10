import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AllocationGrid } from "@/components/finance/allocation-grid";
import { AmountInput, AmountText } from "@/components/finance/amount";
import { filterAccounts } from "@/components/finance/account-picker";
import { JournalLineGrid } from "@/components/finance/journal-line-grid";
import { StatusBadge } from "@/components/workflow/status-badge";
import { authApi } from "@/lib/api/endpoints/auth";
import { apiContext } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session";
import type { Allocations, OpenInvoice } from "@/lib/money/allocation";
import { emptyJournalLine, type JournalLineDraft } from "@/lib/money/journal";
import en from "@/messages/en.json";
import km from "@/messages/km.json";
import { DEMO_PASSWORD } from "@/mocks/db/seed";
import { seedAccounts } from "@/mocks/db/coa";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/dev/components",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function Wrapper({ children, locale = "en" }: { children: ReactNode; locale?: "en" | "km" }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <NextIntlClientProvider locale={locale} messages={locale === "km" ? km : en} timeZone="Asia/Phnom_Penh">
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

async function signInAsAccountant() {
  const session = await authApi.login({ username: "acct", password: DEMO_PASSWORD });
  apiContext.accessToken = session.access_token;
  apiContext.companyId = session.user.default_company_id;
  useSession.setState({ status: "authenticated", user: session.user, companies: session.companies });
}

const accounts = seedAccounts();

describe("AmountInput", () => {
  function Harness({ currency }: { currency: string }) {
    const [value, setValue] = useState("");
    return (
      <Wrapper>
        <AmountInput value={value} onValueChange={setValue} currency={currency} aria-label="Amount" />
        <output data-testid="wire">{value}</output>
      </Wrapper>
    );
  }

  it("keeps a decimal string, rounds on blur and shows separators", async () => {
    const user = userEvent.setup();
    render(<Harness currency="USD" />);
    const input = screen.getByLabelText("Amount");
    await user.type(input, "1250.5");
    await user.tab();
    expect(screen.getByTestId("wire")).toHaveTextContent("1250.50");
    expect(input).toHaveValue("1,250.50");
  });

  it("uses no decimals for KHR", async () => {
    const user = userEvent.setup();
    render(<Harness currency="KHR" />);
    await user.type(screen.getByLabelText("Amount"), "4100000");
    await user.tab();
    expect(screen.getByTestId("wire")).toHaveTextContent("4100000");
    expect(screen.getByLabelText("Amount")).toHaveValue("4,100,000");
  });

  it("accepts pasted text with a currency symbol and separators", async () => {
    const user = userEvent.setup();
    render(<Harness currency="USD" />);
    await user.click(screen.getByLabelText("Amount"));
    await user.paste("$1,250.00");
    await user.tab();
    expect(screen.getByTestId("wire")).toHaveTextContent("1250.00");
  });

  it("ignores letters", async () => {
    const user = userEvent.setup();
    render(<Harness currency="USD" />);
    await user.type(screen.getByLabelText("Amount"), "12abc3");
    await user.tab();
    expect(screen.getByTestId("wire")).toHaveTextContent("123.00");
  });
});

describe("AmountText and StatusBadge", () => {
  it("shows negatives in brackets by default and status as text", () => {
    render(
      <Wrapper>
        <AmountText value="-1250" currency="USD" withCode />
        <StatusBadge status="POSTED" />
      </Wrapper>,
    );
    expect(screen.getByText("(1,250.00) USD")).toBeInTheDocument();
    expect(screen.getByText("Posted")).toBeInTheDocument();
  });

  it("renders status text in Khmer", () => {
    render(<Wrapper locale="km"><StatusBadge status="DRAFT" /></Wrapper>);
    expect(screen.getByText(km.status.DRAFT)).toBeInTheDocument();
  });
});

describe("AccountPicker search", () => {
  it("never offers header accounts", () => {
    expect(filterAccounts(accounts, "", 200).some((a) => !a.is_posting)).toBe(false);
    expect(filterAccounts(accounts, "1100")).toEqual([]);
  });

  it("ranks code prefixes first and searches English and Khmer names", () => {
    expect(filterAccounts(accounts, "62")[0].code).toBe("6200");
    expect(filterAccounts(accounts, "rent exp").map((a) => a.code)).toEqual(["6100"]);
    expect(filterAccounts(accounts, "ចំណាយជួល").map((a) => a.code)).toContain("6100");
  });
});

describe("JournalLineGrid", () => {
  function Harness({ initial }: { initial: JournalLineDraft[] }) {
    const [lines, setLines] = useState(initial);
    return (
      <Wrapper>
        <JournalLineGrid lines={lines} onChange={setLines} accounts={accounts} />
      </Wrapper>
    );
  }
  const start = () => [
    emptyJournalLine("USD", { key: "a", account_id: "acc-6200", debit: "1000.00" }),
    emptyJournalLine("USD", { key: "b", account_id: "acc-2150", credit: "999.00" }),
  ];

  it("shows totals and the difference, then Balanced once corrected", async () => {
    await signInAsAccountant();
    const user = userEvent.setup();
    render(<Harness initial={start()} />);
    expect(screen.getByTestId("total-debit")).toHaveTextContent("1,000.00");
    expect(screen.getByTestId("total-credit")).toHaveTextContent("999.00");
    expect(screen.getByTestId("balance-indicator")).toHaveTextContent("Debits and credits differ by 1.00");

    const credit = screen.getByLabelText("Credit, line 2");
    await user.clear(credit);
    await user.type(credit, "1000");
    await user.tab();
    expect(screen.getByTestId("balance-indicator")).toHaveTextContent("Balanced");
    expect(screen.getByTestId("balance-indicator")).toHaveAttribute("data-balanced", "true");
  });

  it("adds a line with Ctrl+Enter and removes it with Ctrl+Delete", async () => {
    await signInAsAccountant();
    const user = userEvent.setup();
    render(<Harness initial={start()} />);
    await user.click(screen.getByLabelText("Description, line 1"));
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(screen.getAllByTestId("journal-line")).toHaveLength(3);
    await user.click(screen.getByLabelText("Description, line 2"));
    await user.keyboard("{Control>}{Delete}{/Control}");
    expect(screen.getAllByTestId("journal-line")).toHaveLength(2);
  });

  it("adds a row when Enter is pressed on the last line", async () => {
    await signInAsAccountant();
    const user = userEvent.setup();
    render(<Harness initial={start()} />);
    await user.click(screen.getByLabelText("Description, line 2"));
    await user.keyboard("{Enter}");
    expect(screen.getAllByTestId("journal-line")).toHaveLength(3);
  });
});

describe("AllocationGrid", () => {
  const invoices: OpenInvoice[] = [
    { id: "i1", number: "INV-125", date: "2027-02-10", due_date: "2027-03-12", currency: "USD", outstanding: "300.00" },
    { id: "i2", number: "INV-131", date: "2027-03-02", due_date: "2027-04-01", currency: "USD", outstanding: "500.00" },
  ];
  function Harness({ amount }: { amount: string }) {
    const [allocations, setAllocations] = useState<Allocations>({});
    return (
      <Wrapper>
        <AllocationGrid invoices={invoices} amount={amount} currency="USD" allocations={allocations} onChange={setAllocations} />
      </Wrapper>
    );
  }

  it("auto-allocates oldest first and shows what remains", async () => {
    const user = userEvent.setup();
    render(<Harness amount="700.00" />);
    await user.click(screen.getByRole("button", { name: "Auto-allocate (oldest first)" }));
    expect(screen.getByLabelText("Allocate amount for INV-125")).toHaveValue("300.00");
    expect(screen.getByLabelText("Allocate amount for INV-131")).toHaveValue("400.00");
    expect(within(screen.getByTestId("unallocated")).getByText("0.00")).toBeInTheDocument();
  });

  it("blocks allocation above an invoice and above the receipt", async () => {
    const user = userEvent.setup();
    render(<Harness amount="350.00" />);
    await user.type(screen.getByLabelText("Allocate amount for INV-125"), "400");
    await user.tab();
    expect(screen.getByText("Allocation exceeds invoice outstanding balance")).toBeInTheDocument();
    expect(screen.getByTestId("allocation-error")).toHaveTextContent("Allocated amount exceeds receipt amount");
  });

  it("warns about an unapplied amount", async () => {
    const user = userEvent.setup();
    render(<Harness amount="350.00" />);
    await user.type(screen.getByLabelText("Allocate amount for INV-125"), "300");
    await user.tab();
    expect(screen.getByTestId("unapplied-warning")).toHaveTextContent("50.00 USD");
  });
});
