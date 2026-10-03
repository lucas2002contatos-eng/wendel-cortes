import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "@/src/theme";
import { FilaPanel } from "@/src/admin/fila-panel";

export default function AdminFila() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top + spacing.lg }}>
      <FilaPanel />
    </View>
  );
}
