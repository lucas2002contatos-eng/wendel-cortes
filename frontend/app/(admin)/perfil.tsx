import { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius } from "@/src/theme";
import { api, getUser, clearSession } from "@/src/api";
import { GhostButton, Badge } from "@/src/ui";
import { Logo } from "@/src/branding";
import { PaymentsSection } from "@/src/admin/config-sections";

/** Barber profile: own data, PIX mode info and payments awaiting confirmation (own appointments only). */
export default function StaffPerfil() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  useEffect(() => { getUser().then(setUser); api("/settings").then(setSettings).catch(() => {}); }, []);
  const logout = async () => { await clearSession(); router.replace("/(auth)/login"); };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.xl, paddingBottom: spacing["3xl"], width: "100%", maxWidth: 760, alignSelf: "center" }}>
        <View style={{ alignItems: "center", marginBottom: spacing.lg }}><Logo size={90} /></View>
        <View style={styles.card}>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.meta}>{user?.email}</Text>
          <View style={{ marginTop: spacing.sm }}><Badge label="Barbeiro" tone="gold" /></View>
          {settings?.pix && <Text style={[styles.meta, { marginTop: spacing.md }]}>PIX dos seus atendimentos: {settings.pix.mode === "barber" ? "sua chave individual (cadastrada pelo administrador)" : "chave padrão da barbearia"}</Text>}
          <Text style={styles.meta}>Você vê apenas sua própria agenda e fila. Configurações globais são do Administrador Fundador.</Text>
        </View>
        <Text style={styles.sec}>Pagamentos dos seus atendimentos</Text>
        <PaymentsSection canSeeAll={false} />
        <GhostButton testID="staff-logout" label="Sair" onPress={logout} style={{ marginTop: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  name: { color: colors.onSurface, fontSize: 20, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 13, marginTop: 4 },
  sec: { color: colors.muted, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", marginTop: spacing.xl, marginBottom: spacing.xs },
});
