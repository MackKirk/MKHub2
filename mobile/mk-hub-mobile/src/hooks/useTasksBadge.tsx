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
import { countOpenTasks, getMyTasks } from "../services/tasks";
import type { TaskGroupedResponse } from "../types/tasks";

interface TasksContextValue {
  grouped: TaskGroupedResponse | null;
  openCount: number;
  acceptedCount: number;
  inProgressCount: number;
  loading: boolean;
  refreshTasks: () => Promise<void>;
  setGroupedFromLocal: (grouped: TaskGroupedResponse) => void;
}

const TasksContext = createContext<TasksContextValue | undefined>(undefined);

const EMPTY: TaskGroupedResponse = {
  accepted: [],
  in_progress: [],
  done: []
};

export const TasksProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const { user, token } = useAuth();
  const [grouped, setGrouped] = useState<TaskGroupedResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshTasks = useCallback(async () => {
    if (!user || !token) {
      setGrouped(null);
      return;
    }
    try {
      setLoading(true);
      const data = await getMyTasks();
      setGrouped(data);
    } catch {
      // Keep last known counts on transient errors
    } finally {
      setLoading(false);
    }
  }, [user, token]);

  const setGroupedFromLocal = useCallback((next: TaskGroupedResponse) => {
    setGrouped(next);
  }, []);

  useEffect(() => {
    if (!user || !token) {
      setGrouped(null);
      return;
    }
    void refreshTasks();
  }, [user, token, refreshTasks]);

  useEffect(() => {
    if (!user || !token) return;
    const onChange = (state: AppStateStatus) => {
      if (state === "active") void refreshTasks();
    };
    const sub = AppState.addEventListener("change", onChange);
    const interval = setInterval(() => {
      void refreshTasks();
    }, 60_000);
    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [user, token, refreshTasks]);

  const data = grouped ?? EMPTY;
  const acceptedCount = data.accepted?.length ?? 0;
  const inProgressCount = data.in_progress?.length ?? 0;
  const openCount = countOpenTasks(data);

  const value = useMemo(
    () => ({
      grouped,
      openCount,
      acceptedCount,
      inProgressCount,
      loading,
      refreshTasks,
      setGroupedFromLocal
    }),
    [
      grouped,
      openCount,
      acceptedCount,
      inProgressCount,
      loading,
      refreshTasks,
      setGroupedFromLocal
    ]
  );

  return (
    <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
  );
};

export function useTasksBadge(): TasksContextValue {
  const ctx = useContext(TasksContext);
  if (!ctx) {
    throw new Error("useTasksBadge must be used within TasksProvider");
  }
  return ctx;
}
