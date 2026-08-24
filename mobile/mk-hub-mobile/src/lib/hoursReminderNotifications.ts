import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { CommonActions } from "@react-navigation/native";
import { navigationRef } from "../navigation/HubMenuProvider";
import { registerDeviceToken, unregisterDeviceToken } from "../services/notifications";
import { isWeekday } from "./workdays";

const REMINDER_ID = "mkhub-hours-reminder";
const CHANNEL_ID = "hours-reminders";
const PERMISSION_ASKED_KEY = "mkhub_hours_reminder_permission_asked";

function isExpoGo(): boolean {
  return (
    Constants.appOwnership === "expo" ||
    Constants.executionEnvironment === "storeClient"
  );
}

let remotePushReady = false;
let lastExpoToken: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

function goToClock(): void {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(
    CommonActions.navigate({
      name: "App",
      params: {
        screen: "MainTabs",
        params: { screen: "Clock" }
      }
    })
  );
}

export function attachHoursReminderListeners(): () => void {
  const received = Notifications.addNotificationResponseReceivedListener(() => {
    goToClock();
  });
  return () => received.remove();
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Hours reminders",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 180, 80, 180]
  });
}

export async function requestHoursReminderPermission(): Promise<boolean> {
  if (!Device.isDevice) return false;
  await ensureAndroidChannel();
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") {
    const asked = await AsyncStorage.getItem(PERMISSION_ASKED_KEY);
    if (asked === "1" && !current.canAskAgain) return false;
    const next = await Notifications.requestPermissionsAsync();
    await AsyncStorage.setItem(PERMISSION_ASKED_KEY, "1");
    status = next.status;
  }
  return status === "granted";
}

async function registerRemotePushToken(): Promise<boolean> {
  if (isExpoGo()) {
    remotePushReady = false;
    return false;
  }
  try {
    const extra = Constants.expoConfig?.extra as
      | { eas?: { projectId?: string } }
      | undefined;
    const projectId = extra?.eas?.projectId;
    const result = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = result.data;
    if (!token) return false;
    lastExpoToken = token;
    await registerDeviceToken(
      token,
      Platform.OS === "ios" ? "ios" : "android"
    );
    remotePushReady = true;
    return true;
  } catch {
    remotePushReady = false;
    return false;
  }
}

export function getRegisteredExpoPushToken(): string | null {
  return lastExpoToken;
}

export async function clearHoursReminderRegistration(): Promise<void> {
  const token = lastExpoToken;
  lastExpoToken = null;
  remotePushReady = false;
  try {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
  } catch {
    /* already gone */
  }
  if (token) {
    try {
      await unregisterDeviceToken(token);
    } catch {
      /* best-effort */
    }
  }
}

export function hasRemoteHoursPush(): boolean {
  return remotePushReady;
}

function nextReminderDate(hasLoggedToday: boolean, now = new Date()): Date {
  const target = new Date(now);
  target.setSeconds(0, 0);
  target.setMilliseconds(0);
  target.setHours(18, 0, 0, 0);

  const bumpToWeekday = (date: Date) => {
    while (date.getDay() === 0 || date.getDay() === 6) {
      date.setDate(date.getDate() + 1);
      date.setHours(18, 0, 0, 0);
    }
    return date;
  };

  if (!isWeekday(now) || hasLoggedToday || now >= target) {
    target.setDate(target.getDate() + 1);
  }
  return bumpToWeekday(target);
}

export async function syncHoursReminder(hasLoggedToday: boolean): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
  } catch {
    /* already gone */
  }

  if (remotePushReady) return;

  const granted = await requestHoursReminderPermission();
  if (!granted) return;

  const when = nextReminderDate(hasLoggedToday);
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: "Log your hours",
      body: "Don't forget to log today's hours in MK Hub.",
      sound: "default",
      data: { screen: "Clock", type: "hours_reminder" }
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      channelId: CHANNEL_ID
    }
  });
}

export async function setupHoursReminders(hasLoggedToday: boolean): Promise<void> {
  const granted = await requestHoursReminderPermission();
  if (!granted) {
    remotePushReady = false;
    return;
  }
  await registerRemotePushToken();
  await syncHoursReminder(hasLoggedToday);
}
