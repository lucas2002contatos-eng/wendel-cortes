import { Tabs } from "expo-router";
import { Platform } from "react-native";
import Icon from "@react-native-vector-icons/feather";
import { colors } from "@/src/theme";

export default function AdminLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard", tabBarIcon: ({ color, size }) => <Icon name="grid" size={size} color={color} /> }} />
      <Tabs.Screen name="agenda" options={{ title: "Agenda", tabBarIcon: ({ color, size }) => <Icon name="calendar" size={size} color={color} /> }} />
      <Tabs.Screen name="fila" options={{ title: "Fila", tabBarIcon: ({ color, size }) => <Icon name="users" size={size} color={color} /> }} />
      <Tabs.Screen name="mensalistas" options={{ title: "Mensalistas", tabBarIcon: ({ color, size }) => <Icon name="award" size={size} color={color} /> }} />
      <Tabs.Screen name="mais" options={{ title: "Mais", tabBarIcon: ({ color, size }) => <Icon name="more-horizontal" size={size} color={color} /> }} />
    </Tabs>
  );
}
