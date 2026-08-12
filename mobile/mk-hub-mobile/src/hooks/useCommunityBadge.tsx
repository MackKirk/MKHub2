import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useAuth } from "./useAuth";
import { getCommunityPosts } from "../services/community";

interface CommunityBadgeContextValue {
  unreadCount: number;
  loading: boolean;
  refreshUnread: () => Promise<void>;
  /** Optimistically decrease after marking a post viewed. */
  markOneReadLocally: () => void;
  setUnreadCount: (count: number) => void;
}

const CommunityBadgeContext = createContext<
  CommunityBadgeContextValue | undefined
>(undefined);

export const CommunityBadgeProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const { user, token } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refreshUnread = useCallback(async () => {
    if (!user || !token) {
      setUnreadCount(0);
      return;
    }
    try {
      setLoading(true);
      const unread = await getCommunityPosts("unread");
      setUnreadCount(Array.isArray(unread) ? unread.length : 0);
    } catch {
      // Keep last known count on transient errors
    } finally {
      setLoading(false);
    }
  }, [user, token]);

  const markOneReadLocally = useCallback(() => {
    setUnreadCount((n) => Math.max(0, n - 1));
  }, []);

  useEffect(() => {
    if (!user || !token) {
      setUnreadCount(0);
      return;
    }
    void refreshUnread();
  }, [user, token, refreshUnread]);

  useEffect(() => {
    if (!user || !token) return;
    const onChange = (state: AppStateStatus) => {
      if (state === "active") void refreshUnread();
    };
    const sub = AppState.addEventListener("change", onChange);
    const interval = setInterval(() => {
      void refreshUnread();
    }, 60_000);
    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [user, token, refreshUnread]);

  const value = useMemo(
    () => ({
      unreadCount,
      loading,
      refreshUnread,
      markOneReadLocally,
      setUnreadCount
    }),
    [unreadCount, loading, refreshUnread, markOneReadLocally]
  );

  return (
    <CommunityBadgeContext.Provider value={value}>
      {children}
    </CommunityBadgeContext.Provider>
  );
};

export function useCommunityBadge(): CommunityBadgeContextValue {
  const ctx = useContext(CommunityBadgeContext);
  if (!ctx) {
    throw new Error(
      "useCommunityBadge must be used within CommunityBadgeProvider"
    );
  }
  return ctx;
}
