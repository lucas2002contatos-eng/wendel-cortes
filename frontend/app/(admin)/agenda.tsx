import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "@/src/theme";
import { AgendaPanel } from "@/src/admin/agenda-panel";

export default function Agenda() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top + spacing.lg }}>
      <AgendaPanel />
    </View>
  );
}
