import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing, radius } from "@/src/theme";
import { api } from "@/src/api";
import { Badge, STATUS_LABELS, statusTone } from "@/src/ui";

function fmt(d: Date) { return d.toISOString().slice(0, 10); }

const NEXT_STATUS: Record<string, string> = {
  agendado: "cliente_chegou",
  pagamento_pendente: "pago",
  pago: "em_atendimento",
  cliente_chegou: "em_atendimento",
  em_atendimento: "concluido",
};

export default function Agenda() {
  const insets = useSafeAreaInsets();
  const [dates] = useState<Date[]>(() => Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; }));
  const [sel, setSel] = useState<string>(fmt(new Date()));
  const [apts, setApts] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setApts(await api(`/appointments?date=${sel}`)); } catch {}
  }, [sel]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const advance = async (a: any) => {
    const next = NEXT_STATUS[a.status]; if (!next) return;
    try { await api(`/appointments/${a.id}/status`, { method: "PUT", body: JSON.stringify({ status: next }) }); await load(); }
    catch (e: any) { alert(e.message); }
  };

  const cancel = async (a: any) => {
    try { await api(`/appointments/${a.id}/cancel`, { method: "POST" }); await load(); } catch (e: any) { alert(e.message); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.xl, backgroundColor: colors.surface }}>
        <Text style={styles.h1}>Agenda</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.md }}>
          {dates.map((d) => {
            const ds = fmt(d); const s = sel === ds;
            return (
              <Pressable key={ds} testID={`ag-date-${ds}`} onPress={() => setSel(ds)} style={[styles.chip, s && styles.chipSel]}>
                <Text style={[styles.day, s && { color: colors.onBrandPrimary }]}>{["DOM","SEG","TER","QUA","QUI","SEX","SÁB"][d.getDay()]}</Text>
                <Text style={[styles.num, s && { color: colors.onBrandPrimary }]}>{d.getDate()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing["3xl"] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brandPrimary} />}>
        {apts.length === 0 ? <Text style={styles.empty}>Nenhum agendamento neste dia.</Text> :
          apts.map((a) => (
            <View key={a.id} style={styles.card}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.time}>{a.time}</Text>
                  <Text style={styles.name}>{a.client_name}</Text>
                  <Text style={styles.svc}>{a.service_name} · {a.client_phone}</Text>
                  <Text style={styles.svc}>R$ {Number(a.price).toFixed(2)} · {a.payment_method.toUpperCase()}</Text>
                </View>
                <Badge label={STATUS_LABELS[a.status]} tone={statusTone(a.status)} />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
                {NEXT_STATUS[a.status] && (
                  <Pressable testID={`advance-${a.id}`} onPress={() => advance(a)} style={styles.btn}>
                    <Icon name="chevron-right" size={16} color={colors.onBrandPrimary} />
                    <Text style={styles.btnTxt}>Avançar</Text>
                  </Pressable>
                )}
                {!["cancelado", "concluido", "nao_compareceu"].includes(a.status) && (
                  <Pressable testID={`ag-cancel-${a.id}`} onPress={() => cancel(a)} style={styles.btnGhost}>
                    <Text style={styles.btnGhostTxt}>Cancelar</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))
        }
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.onSurface, fontSize: 26, fontWeight: "700" },
  chip: { width: 60, height: 72, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, flexShrink: 0 },
  chipSel: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  day: { color: colors.muted, fontSize: 10, letterSpacing: 1 },
  num: { color: colors.onSurface, fontSize: 20, fontWeight: "700" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
  time: { color: colors.brandPrimary, fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"] as any },
  name: { color: colors.onSurface, fontSize: 15, fontWeight: "700", marginTop: 4 },
  svc: { color: colors.muted, fontSize: 12, marginTop: 2 },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandPrimary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.sm },
  btnTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 13 },
  btnGhost: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong },
  btnGhostTxt: { color: colors.onSurface, fontWeight: "600", fontSize: 13 },
  empty: { color: colors.muted, marginTop: spacing.xl, fontStyle: "italic" },
});
