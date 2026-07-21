import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

/**
 * Thin, platform-safe wrapper over expo-notifications for LOCAL notifications
 * (fired while the app is running). Web is a no-op. This is the first delivery
 * layer; full remote push (alerts when the app is closed) is a later phase.
 */

// Show notifications even when the app is foregrounded.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

export async function notifyLocal(title: string, body: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
  } catch {
    /* best-effort; never crash the UI over a notification */
  }
}
