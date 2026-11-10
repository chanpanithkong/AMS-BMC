import { create } from "zustand";

// UI-only state (prompt §1: Zustand for sidebar and selected company/branch).
// Non-sensitive preferences are remembered in localStorage; every access is wrapped in try/catch.

const STORAGE_KEY = "ams.ui";

interface Persisted {
  sidebarCollapsed: boolean;
  branchId: string | null;
  companyId: string | null;
}

function load(): Partial<Persisted> {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
  } catch {
    return {};
  }
}

function save(state: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private mode): the preference just does not persist
  }
}

interface UiState extends Persisted {
  mobileNavOpen: boolean;
  hydrated: boolean;
  hydrate: () => void;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;
  setCompany: (companyId: string | null) => void;
  /** null = all branches the user may see. */
  setBranch: (branchId: string | null) => void;
}

export const useUiStore = create<UiState>((set, get) => {
  const persist = () => {
    const { sidebarCollapsed, branchId, companyId } = get();
    save({ sidebarCollapsed, branchId, companyId });
  };
  return {
    sidebarCollapsed: false,
    branchId: null,
    companyId: null,
    mobileNavOpen: false,
    hydrated: false,
    hydrate: () => {
      if (get().hydrated) return;
      set({ ...load(), hydrated: true });
    },
    toggleSidebar: () => {
      set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }));
      persist();
    },
    setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
    setCompany: (companyId) => {
      set({ companyId, branchId: null });
      persist();
    },
    setBranch: (branchId) => {
      set({ branchId });
      persist();
    },
  };
});
