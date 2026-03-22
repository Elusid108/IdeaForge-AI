import { createContext, useContext, ReactNode } from "react";

export type AuthUser = { id: string; email: string };

interface AuthContextType {
  session: { user: AuthUser } | null;
  user: AuthUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const MOCK_USER: AuthUser = { id: "1", email: "test@example.com" };

const AuthContext = createContext<AuthContextType>({
  session: { user: MOCK_USER },
  user: MOCK_USER,
  loading: false,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const signOut = async () => {
    /* no-op: mock user stays signed in for local-first dev */
  };

  return (
    <AuthContext.Provider
      value={{
        session: { user: MOCK_USER },
        user: MOCK_USER,
        loading: false,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
