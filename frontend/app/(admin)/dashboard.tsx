import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing, radius } from "@/src/theme";
import { api, getUser } from "@/src/api";
import { Badge, STATUS_LABELS, statusTone } from "@/src/ui";
import { useIsDesktop } from "@/src/use-desktop";
import { AgendaPanel } from "@/src/admin/agenda-panel";
import { FilaPanel } from "@/src/admin/fila-panel";
import { Logo, useBranding } from "@/src/branding";

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const [data, setData] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const branding = useBranding();

  const load = useCallback(async () => {
    setUser(await getUser());
    try { setData(await api("/admin/dashboard")); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!data) return <View style={{ flex: 1, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View>;

  const kpis = [
    { icon: "dollar-sign", label: "Faturamento hoje", value: `R$ ${Number(data.revenue_today || 0).toFixed(2)}` },
    { icon: "calendar", label: "Agendamentos", value: String(data.appointments_total) },
    { icon: "check", label: "Concluídos", value: String(data.appointments_done) },
    { icon: "users", label: "Na fila", value: String(data.queue_waiting) },
    { icon: "clock", label: "Pagto pendente", value: String(data.pending_payments) },
    { icon: "award", label: "Mensalistas ativos", value: String(data.active_subscriptions) },
  ];
  const isBarber = user?.role === "barber";
  const working = (data.barbers_working || []).map((b: any) => b.name).join(", ") || "ninguém";

  if (isDesktop) {
    return (
      <View testID="dashboard-desktop" style={styles.deskRoot}>
        <View style={styles.deskHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <Logo size={56} />
            <View>
              <Text style={styles.hello}>Olá, {user?.name?.split(" ")[0]}</Text>
              <Text style={styles.brand}>{branding.name.toUpperCase()} · {isBarber ? "MEU PAINEL" : "PAINEL"}</Text>
              <Text style={styles.deskDate}>Trabalhando hoje: {working}</Text>
            </View>
          </View>
          <Text style={styles.deskDate}>{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</Text>
        </View>
        <View style={styles.deskKpis}>
          {kpis.map((k) => <Kpi key={k.label} {...k} style={{ flex: 1 }} />)}
        </View>
        <View style={styles.deskColumns}>
          <View style={styles.deskCol}><AgendaPanel compact /></View>
          <View style={styles.deskCol}><FilaPanel compact /></View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: spacing["3xl"], paddingHorizontal: spacing.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brandPrimary} />}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.xl }}>
          <Logo size={52} />
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>Olá, {user?.name?.split(" ")[0]}</Text>
            <Text style={styles.brand}>{isBarber ? "MEU PAINEL" : "PAINEL"}</Text>
            <Text style={styles.svc}>Trabalhando hoje: {working}</Text>
          </View>
        </View>

        <View style={styles.grid}>
          {kpis.map((k) => <Kpi key={k.label} {...k} style={{ width: "48%" }} />)}
        </View>

        <Text style={styles.sec}>Próximos horários</Text>
        {data.upcoming?.length === 0 ? <Text style={styles.empty}>Sem próximos horários.</Text> :
          data.upcoming.map((a: any) => (
            <View key={a.id} style={styles.row}>
              <Text style={styles.time}>{a.time}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{a.client_name}</Text>
                <Text style={styles.svc}>{a.service_name} · R$ {Number(a.price).toFixed(2)}</Text>
              </View>
              <Badge label={STATUS_LABELS[a.status]} tone={statusTone(a.status)} />
            </View>
          ))}
      </ScrollView>
    </View>
  );
}

function Kpi({ icon, label, value, style }: any) {
  return (
    <View style={[styles.kpi, style]}>
      <Icon name={icon} size={18} color={colors.brandPrimary} />
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hello: { color: colors.muted, fontSize: 13, letterSpacing: 1 },
  brand: { color: colors.onSurface, fontSize: 26, fontWeight: "700", letterSpacing: 3, marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  kpi: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.xs },
  kpiLabel: { color: colors.muted, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
  kpiValue: { color: colors.onSurface, fontSize: 22, fontWeight: "800" },
  sec: { color: colors.muted, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", marginTop: spacing.xl, marginBottom: spacing.md },
  empty: { color: colors.muted, fontStyle: "italic" },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, gap: spacing.md, marginBottom: 6 },
  time: { color: colors.brandPrimary, fontSize: 15, fontWeight: "800", width: 60, fontVariant: ["tabular-nums"] as any },
  name: { color: colors.onSurface, fontWeight: "700" },
  svc: { color: colors.muted, fontSize: 12, marginTop: 2 },

  // desktop
  deskRoot: { flex: 1, backgroundColor: colors.surface, padding: spacing.xl, gap: spacing.lg },
  deskHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  deskDate: { color: colors.muted, fontSize: 13, textTransform: "capitalize" },
  deskKpis: { flexDirection: "row", gap: spacing.md },
  deskColumns: { flex: 1, flexDirection: "row", gap: spacing.lg },
  deskCol: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingTop: spacing.lg, overflow: "hidden" },
});
