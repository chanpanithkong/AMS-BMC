import { create } from "zustand";
import { apiContext } from "@/lib/api/client";
import { authApi } from "@/lib/api/endpoints/auth";
import type { CompanyRef, LoginRequest, SessionResponse, SessionUser } from "@/lib/api/types/auth";
import type { DateFormat } from "@/lib/format/dates";
import type { NegativeStyle } from "@/lib/money/format";
import { useUiStore } from "@/lib/stores/ui";

// Session state. The access token lives only in memory (apiContext); after a page reload the session
// is restored through POST /auth/refresh and its HttpOnly cookie (SRS §13.1, prompt §9).

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
  companies: CompanyRef[];
  /** Why the last session ended, shown on the login page. */
  endReason: "idle" | "expired" | null;
  restore: () => Promise<void>;
  login: (request: LoginRequest) => Promise<SessionUser>;
  logout: (reason?: "idle" | "expired") => Promise<void>;
  setPreferences: (prefs: { date_format?: DateFormat; negative_style?: NegativeStyle }) => void;
}

function applySession(response: SessionResponse) {
  apiContext.accessToken = response.access_token;
  const ui = useUiStore.getState();
  ui.hydrate();
  const remembered = useUiStore.getState().companyId;
  const company =
    response.companies.find((c) => c.id === remembered) ??
    response.companies.find((c) => c.id === response.user.default_company_id) ??
    response.companies[0];
  if (company && company.id !== remembered) ui.setCompany(company.id);
  apiContext.companyId = company?.id ?? null;
}

export const useSession = create<SessionState>((set, get) => ({
  status: "loading",
  user: null,
  companies: [],
  endReason: null,

  restore: async () => {
    try {
      const response = await authApi.refresh();
      applySession(response);
      set({ status: "authenticated", user: response.user, companies: response.companies });
    } catch {
      apiContext.accessToken = null;
      set({ status: "unauthenticated", user: null, companies: [] });
    }
  },

  login: async (request) => {
    const response = await authApi.login(request);
    applySession(response);
    set({ status: "authenticated", user: response.user, companies: response.companies, endReason: null });
    return response.user;
  },

  logout: async (reason) => {
    if (get().status === "authenticated") {
      try {
        await authApi.logout();
      } catch {
        // The local session ends even if the server cannot be reached.
      }
    }
    apiContext.accessToken = null;
    set({ status: "unauthenticated", user: null, companies: [], endReason: reason ?? null });
  },

  setPreferences: (prefs) => {
    const user = get().user;
    if (user) set({ user: { ...user, ...prefs } });
  },
}));

// When a refresh fails mid-session, drop to the login page.
apiContext.onSessionLost = () => {
  if (useSession.getState().status === "authenticated") {
    useSession.setState({ status: "unauthenticated", user: null, companies: [], endReason: "expired" });
  }
};

// Keep the X-Company-Id header in step with the company selector.
useUiStore.subscribe((state) => {
  if (state.companyId) apiContext.companyId = state.companyId;
});

/** The selected company, or the first one the user may access. */
export function useCurrentCompany(): CompanyRef | null {
  const companies = useSession((s) => s.companies);
  const companyId = useUiStore((s) => s.companyId);
  return companies.find((c) => c.id === companyId) ?? companies[0] ?? null;
}
