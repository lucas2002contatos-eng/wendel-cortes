import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing, radius } from "@/src/theme";
import { api } from "@/src/api";
import { Badge } from "@/src/ui";
import { BarberAvatar } from "@/src/components/barber-picker";

/**
 * Admin walk-in queues — one independent queue per barber.
 * Filter chips let a barber focus on his own queue; "Todas" shows every queue at once.
 * Used standalone (Fila tab) and embedded in the desktop dashboard.
 */
export function FilaPanel({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await api("/queue/today")); } catch {}
  }, []);
  useFocusEffect(useCallback(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]));

  const act = async (qid: string, action: string, body: any = null) => {
    setBusy(true); setNotice(null);
    try {
      const r = await api(`/queue/${qid}/${action}`, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      if (r?.next_called) setNotice(`Próximo chamado automaticamente: ${r.next_called.client_name}`);
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  const pad = compact ? spacing.lg : spacing.xl;

  if (!data) return <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View>;

  const queues: any[] = (data.queues || []).filter((q: any) => filter === "all" || q.barber_id === filter);
  const totalActive = (data.entries || []).length;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: pad }}>
        <Text style={compact ? styles.h2 : styles.h1}>Filas de hoje</Text>
        <Text style={styles.sub}>Modo: {data.mode.toUpperCase()} · {totalActive} pessoas · {(data.queues || []).length} barbeiros</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}>
          <Pressable testID="fila-filter-all" onPress={() => setFilter("all")} style={[styles.chip, filter === "all" && styles.chipSel]}>
            <Text style={[styles.chipTxt, filter === "all" && { color: colors.onBrandPrimary }]}>Todas as filas</Text>
          </Pressable>
          {(data.queues || []).map((q: any) => (
            <Pressable key={q.barber_id} testID={`fila-filter-${q.barber_name}`} onPress={() => setFilter(q.barber_id)} style={[styles.chip, filter === q.barber_id && styles.chipSel]}>
              <Text style={[styles.chipTxt, filter === q.barber_id && { color: colors.onBrandPrimary }]}>{q.barber_name} ({q.waiting})</Text>
            </Pressable>
          ))}
        </ScrollView>
        {notice && (
          <View style={styles.notice}><Icon name="bell" size={14} color={colors.onBrandPrimary} /><Text style={styles.noticeTxt}>{notice}</Text></View>
        )}
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: spacing["3xl"] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brandPrimary} />}
      >
        {queues.length === 0 && <Text style={styles.empty}>Nenhum barbeiro atendendo hoje.</Text>}
        {queues.map((q) => {
          const next = q.entries.find((e: any) => e.status === "aguardando");
          const inProgress = q.entries.some((e: any) => e.status === "em_atendimento" || e.status === "chamado");
          return (
            <View key={q.barber_id} style={styles.queue} testID={`queue-${q.barber_name}`}>
              <View style={styles.queueHead}>
                <BarberAvatar barber={{ name: q.barber_name, photo_url: q.photo_url }} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.queueTitle}>Fila do {q.barber_name}</Text>
                  <Text style={styles.queueMeta}>{q.waiting} aguardando{q.window ? ` · ${q.window.start}–${q.window.end}` : " · fora do horário"}</Text>
                </View>
                {next && (
                  <Pressable testID={`call-next-${q.barber_name}`} disabled={busy} onPress={() => act(next.id, "call")} style={[styles.callNext, inProgress && { opacity: 0.6 }]}>
                    <Icon name="bell" size={14} color={colors.onBrandPrimary} />
                    <Text style={styles.callNextTxt}>Chamar próximo</Text>
                  </Pressable>
                )}
              </View>
              {q.entries.length === 0 ? <Text style={styles.queueEmpty}>Fila vazia.</Text> :
                q.entries.map((e: any, i: number) => (
                  <View key={e.id} style={styles.card}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text style={styles.pos}>{i + 1}.</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name}>{e.client_name} <Text style={styles.svcInline}>— {e.service_name}</Text></Text>
                        <Text style={styles.svc}>{e.client_phone}</Text>
                      </View>
                      <Badge label={e.status.replace("_", " ")} tone={e.status === "chamado" ? "gold" : e.status === "em_atendimento" ? "info" : "default"} />
                    </View>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md }}>
                      {e.status === "aguardando" && <Btn testID={`call-${e.id}`} icon="bell" label="Chamar" onPress={() => act(e.id, "call")} />}
                      {e.status === "chamado" && <Btn testID={`start-${e.id}`} icon="play" label="Iniciar atendimento" onPress={() => act(e.id, "start")} />}
                      {e.status === "em_atendimento" && (
                        <>
                          <Btn testID={`complete-${e.id}`} icon="check" label="Concluir" onPress={() => act(e.id, "complete", { use_mensal: false })} />
                          <Btn testID={`complete-mensal-${e.id}`} icon="award" label="Concluir (mensal)" onPress={() => act(e.id, "complete", { use_mensal: true })} />
                        </>
                      )}
                      <BtnGhost testID={`noshow-${e.id}`} label="Não compareceu" onPress={() => act(e.id, "noshow")} />
                      <BtnGhost testID={`leave-${e.id}`} label="Cancelar" onPress={() => act(e.id, "leave")} />
                    </View>
                  </View>
                ))
              }
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Btn({ icon, label, onPress, testID }: any) {
  return <Pressable testID={testID} onPress={onPress} style={styles.btn}><Icon name={icon} size={14} color={colors.onBrandPrimary} /><Text style={styles.btnTxt}>{label}</Text></Pressable>;
}
function BtnGhost({ label, onPress, testID }: any) {
  return <Pressable testID={testID} onPress={onPress} style={styles.btnGhost}><Text style={styles.btnGhostTxt}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  h1: { color: colors.onSurface, fontSize: 22, fontWeight: "700" },
  h2: { color: colors.onSurface, fontSize: 16, fontWeight: "700", letterSpacing: 0.5 },
  sub: { color: colors.muted, marginTop: 4, marginBottom: spacing.md, fontSize: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  chipSel: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipTxt: { color: colors.onSurface, fontSize: 12, fontWeight: "600" },
  notice: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.brandPrimary, padding: spacing.md, borderRadius: radius.sm, marginBottom: spacing.md },
  noticeTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 12, flex: 1 },
  queue: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg },
  queueHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  queueTitle: { color: colors.onSurface, fontWeight: "800", fontSize: 15 },
  queueMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  queueEmpty: { color: colors.muted, fontStyle: "italic", fontSize: 12, paddingVertical: spacing.sm },
  callNext: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandPrimary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.sm },
  callNextTxt: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 12 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  pos: { color: colors.brandPrimary, fontSize: 18, fontWeight: "800", width: 34, fontVariant: ["tabular-nums"] as any },
  name: { color: colors.onSurface, fontSize: 14, fontWeight: "700" },
  svcInline: { color: colors.onSurfaceSecondary, fontWeight: "500" },
  svc: { color: colors.muted, fontSize: 12, marginTop: 2 },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandPrimary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm },
  btnTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 12 },
  btnGhost: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong },
  btnGhostTxt: { color: colors.onSurface, fontWeight: "600", fontSize: 12 },
  empty: { color: colors.muted, fontStyle: "italic", marginTop: spacing.xl },
});
