import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { getToken, getUser } from "@/src/api";
import { colors } from "@/src/theme";

export default function Index() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      const token = await getToken();
      const user = await getUser();
      if (!token || !user) {
        router.replace("/(auth)/login");
      } else if (user.role === "admin") {
        router.replace("/(admin)/dashboard");
      } else {
        router.replace("/(client)/home");
      }
    })();
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.brandPrimary} size="large" />
    </View>
  );
}
