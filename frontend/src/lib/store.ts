import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { User as FirebaseUser } from 'firebase/auth';

// Session storage adapter (survives reloads, clears on browser close)
const sessionStorageAdapter: StateStorage = {
  getItem: (name) => sessionStorage.getItem(name),
  setItem: (name, value) => sessionStorage.setItem(name, value),
  removeItem: (name) => sessionStorage.removeItem(name),
};

// ── Auth Store ───────────────────────────────────────────
interface AuthState {
  user: FirebaseUser | null;
  userData: any | null;
  isAuthenticated: boolean;
  loading: boolean;
  setUser: (user: FirebaseUser | null) => void;
  setUserData: (userData: any) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      userData: null,
      isAuthenticated: false,
      loading: true,
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setUserData: (userData) => set({ userData }),
      setLoading: (loading) => set({ loading }),
      logout: () =>
        set({
          user: null,
          userData: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'carebridge-auth',
      storage: createJSONStorage(() => sessionStorageAdapter),
      partialize: (state) => ({
        userData: state.userData,
        isAuthenticated: state.isAuthenticated,
      } as AuthState),
    }
  )
);

// ── UI Store ─────────────────────────────────────────────
interface UIState {
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
  toggleSidebar: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      theme: 'light' as const,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setTheme: (theme: 'light' | 'dark') => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' as const : 'light' as const })),
    }),
    { name: 'carebridge-ui' }
  )
);

// ── Chat Store ───────────────────────────────────────────
interface ChatState {
  activeConversationId: string | null;
  conversations: any[];
  messages: any[];
  isLoading: boolean;
  setActiveConversation: (id: string | null) => void;
  setConversations: (conversations: any[]) => void;
  setMessages: (messages: any[]) => void;
  addMessage: (message: any) => void;
  setLoading: (loading: boolean) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  activeConversationId: null,
  conversations: [],
  messages: [],
  isLoading: false,
  setActiveConversation: (id) => set({ activeConversationId: id }),
  setConversations: (conversations) => set({ conversations }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  setLoading: (isLoading) => set({ isLoading }),
}));
