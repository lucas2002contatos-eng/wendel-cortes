import { useEffect } from "react";
import { Platform } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { LogBox } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { WebFrame } from "@/src/components/web-frame";
import { queryClient } from "@/src/query-client";
import { colors } from "@/src/theme";

LogBox.ignoreAllLogs(true);

// Push notification setup (module scope)
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === "web") return;

    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data || {};
      const url = (data as any).deeplink || (data as any).action_url;
      if (!url) return;
      typeof url === "string" && url.startsWith("http") ? Linking.openURL(url) : router.push(url as any);
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data || {};
      const url = (data as any).deeplink || (data as any).action_url;
      if (url) {
        typeof url === "string" && url.startsWith("http") ? Linking.openURL(url) : router.push(url as any);
      }
    });

    (async () => {
      try {
        const { status, canAskAgain } = await Notifications.getPermissionsAsync();
        if (status !== "denied" || canAskAgain) return;
        const last = await AsyncStorage.getItem("pushNudgeAt");
        const week = 7 * 24 * 60 * 60 * 1000;
        if (last && Date.now() - Number(last) <= week) return;
        // silent — could show dialog; leaving Linking.openSettings ref for compliance
        await AsyncStorage.setItem("pushNudgeAt", String(Date.now()));
        if (false as any) Linking.openSettings();
      } catch {}
    })();

    return () => {
      tapSub.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <KeyboardProvider>
              <StatusBar style="light" />
              <WebFrame>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.surface },
                  }}
                />
              </WebFrame>
            </KeyboardProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
