import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius } from "@/src/theme";
import { api } from "@/src/api";
import { Badge } from "@/src/ui";

const FILTERS = [
  { k: "all", l: "Todos" },
  { k: "active", l: "Ativos" },
  { k: "pending_payment", l: "Pgto pendente" },
  { k: "expired", l: "Expirados" },
  { k: "canceled", l: "Cancelados" },
  { k: "cuts_0", l: "0 cortes" },
  { k: "cuts_1", l: "1 corte" },
  { k: "cuts_2", l: "2 cortes" },
  { k: "cuts_3", l: "3 cortes" },
  { k: "cuts_4", l: "4 cortes" },
];

export default function Mensalistas() {
  const insets = useSafeAreaInsets();
  const [subs, setSubs] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setSubs(await api("/admin/subscriptions")); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const markPaid = async (id: string) => {
    try { await api(`/subscription/${id}/mark-paid`, { method: "PUT" }); await load(); } catch (e: any) { alert(e.message); }
  };

  const visible = subs.filter((s) => {
    if (filter === "all") return true;
    if (filter.startsWith("cuts_")) return (s.cuts_total - s.cuts_used) === Number(filter.split("_")[1]);
    return s.status === filter;
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.xl, backgroundColor: colors.surface }}>
        <Text style={styles.h1}>Mensalistas</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.md }}>
          {FILTERS.map((f) => (
            <Pressable key={f.k} testID={`filter-${f.k}`} onPress={() => setFilter(f.k)} style={[styles.chip, filter === f.k && styles.chipSel]}>
              <Text style={[styles.chipTxt, filter === f.k && { color: colors.onBrandPrimary }]}>{f.l}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing["3xl"] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brandPrimary} />}>
        {visible.length === 0 ? <Text style={styles.empty}>Nenhum mensalista neste filtro.</Text> :
          visible.map((s) => (
            <View key={s.id} style={styles.card}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{s.client_name}</Text>
                  <Text style={styles.meta}>{s.client_phone}</Text>
                </View>
                <Badge label={s.status.toUpperCase()} tone={s.status === "active" ? "success" : s.status === "pending_payment" ? "warning" : "error"} />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: spacing.md }}>
                <Info label="Restantes" value={`${s.cuts_total - s.cuts_used}/${s.cuts_total}`} />
                <Info label="Utilizados" value={String(s.cuts_used)} />
                <Info label="Renovação" value={new Date(s.period_end).toLocaleDateString("pt-BR")} />
              </View>
              {s.status === "pending_payment" && (
                <Pressable testID={`markpaid-${s.id}`} onPress={() => markPaid(s.id)} style={styles.btn}>
                  <Text style={styles.btnTxt}>Marcar como PAGO</Text>
                </Pressable>
              )}
            </View>
          ))
        }
      </ScrollView>
    </View>
  );
}

function Info({ label, value }: any) {
  return <View><Text style={{ color: colors.muted, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>{label}</Text><Text style={{ color: colors.onSurface, fontWeight: "700", marginTop: 2 }}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  h1: { color: colors.onSurface, fontSize: 26, fontWeight: "700" },
  chip: { paddingHorizontal: 14, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, flexShrink: 0 },
  chipSel: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipTxt: { color: colors.onSurface, fontSize: 12, fontWeight: "600" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md, gap: spacing.sm },
  name: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 12 },
  btn: { backgroundColor: colors.brandPrimary, padding: spacing.md, borderRadius: radius.sm, alignItems: "center", marginTop: spacing.md },
  btnTxt: { color: colors.onBrandPrimary, fontWeight: "700" },
  empty: { color: colors.muted, marginTop: spacing.xl, fontStyle: "italic" },
});
