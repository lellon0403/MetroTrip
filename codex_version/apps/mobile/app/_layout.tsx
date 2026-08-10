import { Stack, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { MobileSessionProvider } from "@/lib/session";
import { notificationPath } from "@/lib/deepLinks";

export default function RootLayout() {
  const router = useRouter();
  useEffect(() => {
    const open = (data: Record<string, unknown>) => {
      const path = notificationPath(data);
      if (path) router.push(path as never);
    };
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) open(response.notification.request.content.data ?? {});
    });
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      open(response.notification.request.content.data ?? {});
    });
    return () => subscription.remove();
  }, [router]);
  return (
    <MobileSessionProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </MobileSessionProvider>
  );
}
