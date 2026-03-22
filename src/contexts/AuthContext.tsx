import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import * as GoogleAPI from "@/lib/google-api";

/** Google userinfo shape (oauth2 userinfo v2) + optional display fields */
export type AuthUser = {
  id: string;
  email: string;
  name?: string;
  given_name?: string;
  picture?: string;
};

interface AuthContextType {
  session: { user: AuthUser } | null;
  user: AuthUser | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

function mapUserInfo(info: {
  id?: string;
  sub?: string;
  email?: string;
  name?: string;
  given_name?: string;
  picture?: string;
}): AuthUser {
  const id = info.sub ?? info.id ?? "";
  const email = info.email ?? "";
  return {
    id,
    email,
    name: info.name,
    given_name: info.given_name,
    picture: info.picture,
  };
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        if (!GoogleAPI.loadGapi) {
          setUser(null);
          return;
        }
        await GoogleAPI.loadGapi();
        await GoogleAPI.initGoogleAuth();
        const info = await GoogleAPI.checkAuthStatus();
        if (cancelled) return;
        if (info?.email) {
          setUser(mapUserInfo(info));
        } else {
          setUser(null);
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async () => {
    setLoading(true);
    try {
      await GoogleAPI.loadGapi();
      await GoogleAPI.initGoogleAuth();
      const info = await GoogleAPI.signIn();
      if (info?.email) {
        setUser(mapUserInfo(info));
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    GoogleAPI.signOut();
    setUser(null);
    setLoading(false);
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      session: user ? { user } : null,
      user,
      loading,
      signIn,
      signOut,
    }),
    [user, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
