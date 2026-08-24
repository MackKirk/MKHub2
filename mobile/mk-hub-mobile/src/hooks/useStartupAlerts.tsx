import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useAuth } from "./useAuth";
import { PendingItemsModal, type PendingHours } from "../components/alerts/PendingItemsModal";
import { NotificationsModal } from "../components/alerts/NotificationsModal";
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from "../services/notifications";
import {
  getPendingOnboardingDocuments,
  getPendingSignatureRequests
} from "../services/documentsToSign";
import {
  getWeekStartSunday,
  getWeeklyAttendanceSummary
} from "../services/shifts";
import { getMyTasks } from "../services/tasks";
import type { InboxNotification, OnboardingDocumentRow, SignatureRequestRow } from "../types/inbox";
import type { TaskItem } from "../types/tasks";
import { requestClockLog } from "../lib/clockNavigation";
import {
  goToAppTab,
  goToSignPlaceholder,
  openNotificationTarget
} from "../lib/inboxNavigation";
import {
  attachHoursReminderListeners,
  clearHoursReminderRegistration,
  setupHoursReminders
} from "../lib/hoursReminderNotifications";
import { formatWeekdayLong, previousWeekday } from "../lib/workdays";
import { formatDateLocal } from "../lib/dateUtils";

const DUE_SOON_DAYS = 7;
const TASK_LIMIT = 4;
const DOC_LIMIT = 4;

type PendingSnapshot = {
  hours: PendingHours | null;
  loggedToday: boolean;
  tasks: TaskItem[];
  otherOpenTaskCount: number;
  signatureRequests: SignatureRequestRow[];
  onboardingDocs: OnboardingDocumentRow[];
  hasContent: boolean;
};

interface StartupAlertsContextValue {
  openNotifications: () => void;
  notificationUnread: number;
}

const StartupAlertsContext = createContext<StartupAlertsContextValue | undefined>(
  undefined
);

function dayHasLoggedHours(
  days: {
    date: string;
    hours_worked_minutes?: number;
    clock_in?: string | null;
    clock_out?: string | null;
  }[],
  dateStr: string
): boolean {
  return days.some(
    (day) =>
      day.date === dateStr &&
      ((day.hours_worked_minutes || 0) > 0 || !!(day.clock_in && day.clock_out))
  );
}

function isDueSoon(dueDate: string | null | undefined, now = Date.now()): boolean {
  if (!dueDate) return false;
  const t = new Date(dueDate).getTime();
  if (Number.isNaN(t)) return false;
  return t <= now + DUE_SOON_DAYS * 86400000;
}

async function fetchPending(userId: string): Promise<PendingSnapshot> {
  const prev = previousWeekday();
  const prevDate = formatDateLocal(prev);
  const todayDate = formatDateLocal(new Date());
  const weeks = new Set([
    formatDateLocal(getWeekStartSunday(prev)),
    formatDateLocal(getWeekStartSunday())
  ]);

  const [grouped, signatures, onboarding, ...summaries] = await Promise.all([
    getMyTasks().catch(() => ({ accepted: [], in_progress: [], done: [] })),
    getPendingSignatureRequests(),
    getPendingOnboardingDocuments(),
    ...[...weeks].map((weekStart) =>
      getWeeklyAttendanceSummary(weekStart, userId).catch(() => ({ days: [] }))
    )
  ]);

  const allDays = summaries.flatMap((summary) => summary?.days ?? []);
  const missedPrev = !dayHasLoggedHours(allDays, prevDate);
  const openTasks = [...(grouped.accepted ?? []), ...(grouped.in_progress ?? [])];
  const dueTasks = openTasks
    .filter((task) => isDueSoon(task.due_date))
    .sort((a, b) => {
      const aT = a.due_date ? new Date(a.due_date).getTime() : 0;
      const bT = b.due_date ? new Date(b.due_date).getTime() : 0;
      return aT - bT;
    });
  const shownTasks = dueTasks.slice(0, TASK_LIMIT);
  const otherOpen = Math.max(0, openTasks.length - shownTasks.length);
  const onboardingDocs = onboarding
    .slice()
    .sort((a, b) => (a.remaining_days ?? 99) - (b.remaining_days ?? 99))
    .slice(0, DOC_LIMIT);
  const signatureRequests = signatures.slice(0, DOC_LIMIT);

  return {
    hours: missedPrev
      ? { label: formatWeekdayLong(prev), date: prevDate }
      : null,
    loggedToday: dayHasLoggedHours(allDays, todayDate),
    tasks: shownTasks,
    otherOpenTaskCount: otherOpen,
    signatureRequests,
    onboardingDocs,
    hasContent:
      missedPrev ||
      shownTasks.length > 0 ||
      otherOpen > 0 ||
      signatureRequests.length > 0 ||
      onboardingDocs.length > 0
  };
}

export const StartupAlertsProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const { user, token, isLoading } = useAuth();
  const [pendingVisible, setPendingVisible] = useState(false);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [hours, setHours] = useState<PendingHours | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [otherOpenTaskCount, setOtherOpenTaskCount] = useState(0);
  const [signatureRequests, setSignatureRequests] = useState<SignatureRequestRow[]>([]);
  const [onboardingDocs, setOnboardingDocs] = useState<OnboardingDocumentRow[]>([]);

  const [notifVisible, setNotifVisible] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [notificationUnread, setNotificationUnread] = useState(0);

  const dismissedThisForeground = useRef(false);
  const userIdRef = useRef<string | null>(null);

  const applyPending = useCallback((snapshot: PendingSnapshot) => {
    setHours(snapshot.hours);
    setTasks(snapshot.tasks);
    setOtherOpenTaskCount(snapshot.otherOpenTaskCount);
    setSignatureRequests(snapshot.signatureRequests);
    setOnboardingDocs(snapshot.onboardingDocs);
  }, []);

  const loadAndMaybeShowPending = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!user?.id) return;
      try {
        setPendingLoading(true);
        const snapshot = await fetchPending(user.id);
        applyPending(snapshot);
        await setupHoursReminders(snapshot.loggedToday);
        if (!snapshot.hasContent) {
          setPendingVisible(false);
          return;
        }
        if (opts?.force || !dismissedThisForeground.current) {
          setPendingVisible(true);
        }
      } catch {
        void setupHoursReminders(false);
      } finally {
        setPendingLoading(false);
      }
    },
    [applyPending, user?.id]
  );

  const refreshNotifications = useCallback(async () => {
    try {
      const [items, count] = await Promise.all([
        listNotifications({ limit: 40 }),
        getUnreadNotificationCount()
      ]);
      setNotifications(items);
      setNotificationUnread(count);
    } catch {
      setNotifications([]);
    }
  }, []);

  const openNotifications = useCallback(() => {
    setNotifVisible(true);
    setNotifLoading(true);
    void refreshNotifications().finally(() => setNotifLoading(false));
  }, [refreshNotifications]);

  const dismissPending = useCallback(() => {
    dismissedThisForeground.current = true;
    setPendingVisible(false);
  }, []);

  useEffect(() => attachHoursReminderListeners(), []);

  useEffect(() => {
    if (isLoading) return;
    if (!user?.id || !token) {
      userIdRef.current = null;
      dismissedThisForeground.current = false;
      setPendingVisible(false);
      setNotifVisible(false);
      setNotificationUnread(0);
      void clearHoursReminderRegistration();
      return;
    }
    const isNewLogin = userIdRef.current !== user.id;
    userIdRef.current = user.id;
    if (isNewLogin) dismissedThisForeground.current = false;
    void loadAndMaybeShowPending({ force: isNewLogin });
    void refreshNotifications();
  }, [isLoading, user?.id, token, loadAndMaybeShowPending, refreshNotifications]);

  useEffect(() => {
    if (!user?.id || !token) return;
    const onChange = (state: AppStateStatus) => {
      if (state === "background") {
        dismissedThisForeground.current = false;
        return;
      }
      if (state === "active") {
        void loadAndMaybeShowPending();
        void refreshNotifications();
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [user?.id, token, loadAndMaybeShowPending, refreshNotifications]);

  const value = useMemo(
    () => ({ openNotifications, notificationUnread }),
    [openNotifications, notificationUnread]
  );

  return (
    <StartupAlertsContext.Provider value={value}>
      {children}
      <PendingItemsModal
        visible={pendingVisible}
        loading={pendingLoading}
        hours={hours}
        tasks={tasks}
        otherOpenTaskCount={otherOpenTaskCount}
        signatureRequests={signatureRequests}
        onboardingDocs={onboardingDocs}
        onDismiss={dismissPending}
        onLogHours={() => {
          if (hours?.date) requestClockLog(hours.date);
          dismissPending();
          goToAppTab("Clock");
        }}
        onOpenTasks={() => {
          dismissPending();
          goToAppTab("Tasks");
        }}
        onOpenSign={() => {
          dismissPending();
          goToSignPlaceholder();
        }}
      />
      <NotificationsModal
        visible={notifVisible}
        loading={notifLoading}
        unreadCount={notificationUnread}
        items={notifications}
        onClose={() => setNotifVisible(false)}
        onOpen={(item) => {
          if (!item.read) {
            void markNotificationRead(item.id)
              .then(() => refreshNotifications())
              .catch(() => undefined);
          }
          setNotifVisible(false);
          openNotificationTarget(item);
        }}
        onMarkAllRead={() => {
          void markAllNotificationsRead()
            .then(() => refreshNotifications())
            .catch(() => undefined);
        }}
      />
    </StartupAlertsContext.Provider>
  );
};

export function useStartupAlerts(): StartupAlertsContextValue {
  const ctx = useContext(StartupAlertsContext);
  if (!ctx) {
    throw new Error("useStartupAlerts must be used within StartupAlertsProvider");
  }
  return ctx;
}
