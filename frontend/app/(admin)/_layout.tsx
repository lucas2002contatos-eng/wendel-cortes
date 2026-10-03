import { Tabs } from "expo-router";
import { Platform } from "react-native";
import Icon from "@react-native-vector-icons/feather";
import { colors } from "@/src/theme";
import { useIsDesktop } from "@/src/use-desktop";

export default function AdminLayout() {
  const isDesktop = useIsDesktop();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarPosition: isDesktop ? "left" : "bottom",
        tabBarVariant: isDesktop ? "material" : "uikit",
        tabBarLabelPosition: "below-icon",
        tabBarStyle: isDesktop
          ? { backgroundColor: colors.surfaceSecondary, borderRightColor: colors.border, borderRightWidth: 1, width: 104, paddingTop: 24 }
          : {
              backgroundColor: colors.surfaceSecondary,
              borderTopColor: colors.border,
              borderTopWidth: 0.5,
              ...(Platform.OS === "web" ? { height: 64 } : {}),
            },
        tabBarItemStyle: isDesktop ? { marginVertical: 6 } : { alignSelf: "center" },
        tabBarActiveBackgroundColor: isDesktop ? colors.brandTertiary : undefined,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: isDesktop ? "Painel" : "Dashboard", tabBarIcon: ({ color, size }) => <Icon name="grid" size={size} color={color} /> }} />
      <Tabs.Screen name="agenda" options={{ title: "Agenda", tabBarIcon: ({ color, size }) => <Icon name="calendar" size={size} color={color} /> }} />
      <Tabs.Screen name="fila" options={{ title: "Fila", tabBarIcon: ({ color, size }) => <Icon name="users" size={size} color={color} /> }} />
      <Tabs.Screen name="mensalistas" options={{ title: isDesktop ? "Mensalistas" : "Mensal", tabBarIcon: ({ color, size }) => <Icon name="award" size={size} color={color} /> }} />
      <Tabs.Screen name="barbeiros" options={{ title: "Barbeiros", tabBarIcon: ({ color, size }) => <Icon name="scissors" size={size} color={color} /> }} />
      <Tabs.Screen name="mais" options={{ title: "Mais", tabBarIcon: ({ color, size }) => <Icon name="more-horizontal" size={size} color={color} /> }} />
    </Tabs>
  );
}
