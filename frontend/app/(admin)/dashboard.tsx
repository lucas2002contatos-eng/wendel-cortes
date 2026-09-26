import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing, radius } from "@/src/theme";
import { api, getUser } from "@/src/api";
import { Badge, STATUS_LABELS, statusTone } from "@/src/ui";

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setUser(await getUser());
    try { setData(await api("/admin/dashboard")); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!data) return <View style={{ flex: 1, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: spacing["3xl"], paddingHorizontal: spacing.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brandPrimary} />}>
        <Text style={styles.hello}>Olá, {user?.name?.split(" ")[0]}</Text>
        <Text style={styles.brand}>DASHBOARD</Text>

        <View style={styles.grid}>
          <Kpi icon="dollar-sign" label="Faturamento hoje" value={`R$ ${Number(data.revenue_today || 0).toFixed(2)}`} />
          <Kpi icon="calendar" label="Agendamentos" value={String(data.appointments_total)} />
          <Kpi icon="check" label="Concluídos" value={String(data.appointments_done)} />
          <Kpi icon="users" label="Na fila" value={String(data.queue_waiting)} />
          <Kpi icon="clock" label="Pagto pendente" value={String(data.pending_payments)} />
          <Kpi icon="award" label="Mensalistas ativos" value={String(data.active_subscriptions)} />
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

function Kpi({ icon, label, value }: any) {
  return (
    <View style={styles.kpi}>
      <Icon name={icon} size={18} color={colors.brandPrimary} />
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hello: { color: colors.muted, fontSize: 13, letterSpacing: 1 },
  brand: { color: colors.onSurface, fontSize: 26, fontWeight: "700", letterSpacing: 3, marginTop: 4, marginBottom: spacing.xl },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  kpi: { width: "48%", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.xs },
  kpiLabel: { color: colors.muted, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
  kpiValue: { color: colors.onSurface, fontSize: 22, fontWeight: "800" },
  sec: { color: colors.muted, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", marginTop: spacing.xl, marginBottom: spacing.md },
  empty: { color: colors.muted, fontStyle: "italic" },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, gap: spacing.md, marginBottom: 6 },
  time: { color: colors.brandPrimary, fontSize: 15, fontWeight: "800", width: 60, fontVariant: ["tabular-nums"] as any },
  name: { color: colors.onSurface, fontWeight: "700" },
  svc: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
