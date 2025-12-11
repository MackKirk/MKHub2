import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState
} from "react";
import * as SecureStore from "expo-secure-store";
import { loginRequest, getCurrentUserProfile } from "../services/auth";
import { api } from "../services/api";
import type { MeProfileResponse } from "../types/auth";

interface AuthContextValue {
  user: MeProfileResponse["user"] | null;
  token: string | null;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ACCESS_TOKEN_KEY = "MK_HUB_ACCESS_TOKEN";
const REFRESH_TOKEN_KEY = "MK_HUB_REFRESH_TOKEN";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [user, setUser] = useState<MeProfileResponse["user"] | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const applyTokenToClient = useCallback((accessToken: string | null) => {
    if (accessToken) {
      api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
    } else {
      delete api.defaults.headers.common.Authorization;
    }
  }, []);

  const restoreSession = useCallback(async () => {
    try {
      const storedToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      if (!storedToken) {
        setIsLoading(false);
        return;
      }
      setToken(storedToken);
      applyTokenToClient(storedToken);
      const profile = await getCurrentUserProfile();
      setUser(profile.user);
    } catch {
      await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      setUser(null);
      setToken(null);
      applyTokenToClient(null);
    } finally {
      setIsLoading(false);
    }
  }, [applyTokenToClient]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = useCallback(
    async (identifier: string, password: string) => {
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
        applyTokenToClient(tokenResponse.access_token);
        const profile = await getCurrentUserProfile();
        setUser(profile.user);
      } catch (error) {
        // Re-throw error so LoginScreen can handle it
        console.error("Login error:", error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [applyTokenToClient]
  );

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    setUser(null);
    setToken(null);
    applyTokenToClient(null);
  }, [applyTokenToClient]);

  const value: AuthContextValue = {
    user,
    token,
    isLoading,
    login,
    logout
  };

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


