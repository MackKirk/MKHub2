import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import * as SecureStore from "expo-secure-store";
import {
  loginRequest,
  getCurrentUserProfile,
  getCurrentUser
} from "../services/auth";
import { api } from "../services/api";
import type { MeProfileResponse, MeUser } from "../types/auth";

interface AuthContextValue {
  user: MeUser | null;
  token: string | null;
  roles: string[];
  permissions: string[];
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ACCESS_TOKEN_KEY = "MK_HUB_ACCESS_TOKEN";
const REFRESH_TOKEN_KEY = "MK_HUB_REFRESH_TOKEN";

async function loadSessionData(accessToken: string) {
  applyTokenToClient(accessToken);
  const [profile, me] = await Promise.all([
    getCurrentUserProfile(),
    getCurrentUser()
  ]);
  const user: MeUser = {
    ...profile.user,
    first_name: profile.profile?.first_name ?? profile.user.first_name,
    last_name: profile.profile?.last_name ?? profile.user.last_name,
    roles: me.roles
  };
  return { user, roles: me.roles, permissions: me.permissions };
}

function applyTokenToClient(accessToken: string | null) {
  if (accessToken) {
    api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [user, setUser] = useState<MeUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const restoreSession = useCallback(async () => {
    try {
      const storedToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      if (!storedToken) {
        return;
      }
      setToken(storedToken);
      const session = await Promise.race([
        loadSessionData(storedToken),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Session restore timeout")), 20000)
        )
      ]);
      setUser(session.user);
      setRoles(session.roles);
      setPermissions(session.permissions);
    } catch {
      await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      setUser(null);
      setToken(null);
      setRoles([]);
      setPermissions([]);
      applyTokenToClient(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = useCallback(async (identifier: string, password: string) => {
    setIsLoading(true);
    try {
      const tokenResponse = await loginRequest(identifier, password);
      await SecureStore.setItemAsync(
        ACCESS_TOKEN_KEY,
        tokenResponse.access_token
      );
      await SecureStore.setItemAsync(
        REFRESH_TOKEN_KEY,
        tokenResponse.refresh_token
      );
      setToken(tokenResponse.access_token);
      const session = await loadSessionData(tokenResponse.access_token);
      setUser(session.user);
      setRoles(session.roles);
      setPermissions(session.permissions);
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const rt = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      if (rt) {
        await api.post("/auth/logout", { refresh_token: rt });
      }
    } catch {
      /* best-effort */
    }
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    setUser(null);
    setToken(null);
    setRoles([]);
    setPermissions([]);
    applyTokenToClient(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      roles,
      permissions,
      isLoading,
      login,
      logout
    }),
    [user, token, roles, permissions, isLoading, login, logout]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
};
