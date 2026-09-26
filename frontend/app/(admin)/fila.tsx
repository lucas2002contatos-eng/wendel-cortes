import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing, radius } from "@/src/theme";
import { api } from "@/src/api";
import { Badge } from "@/src/ui";

export default function AdminFila() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api("/queue/today")); } catch {}
  }, []);
  useFocusEffect(useCallback(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]));

  const act = async (qid: string, action: string, body: any = null) => {
    setBusy(true);
    try {
      await api(`/queue/${qid}/${action}`, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  if (!data) return <View style={{ flex: 1, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View>;

  const active = (data.entries || []).filter((e: any) => ["aguardando", "chamado", "em_atendimento"].includes(e.status));
  const next = active.find((e: any) => e.status === "aguardando");

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: spacing["3xl"], paddingHorizontal: spacing.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brandPrimary} />}>
        <Text style={styles.h1}>Fila de hoje</Text>
        <Text style={styles.sub}>Modo: {data.mode.toUpperCase()} · {active.length} pessoas</Text>

        {next && (
          <Pressable testID="call-next-btn" disabled={busy} onPress={() => act(next.id, "call")} style={styles.callNext}>
            <Icon name="bell" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.callNextTxt}>Chamar próximo · {next.client_name}</Text>
          </Pressable>
        )}

        {active.length === 0 ? <Text style={styles.empty}>Fila vazia.</Text> :
          active.map((e: any, i: number) => (
            <View key={e.id} style={styles.card}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={styles.pos}>{i + 1}º</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{e.client_name}</Text>
                  <Text style={styles.svc}>{e.service_name} · {e.client_phone}</Text>
                </View>
                <Badge label={e.status.replace("_", " ")} tone={e.status === "chamado" ? "gold" : e.status === "em_atendimento" ? "info" : "default"} />
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md }}>
                {e.status === "aguardando" && <Btn testID={`call-${e.id}`} icon="bell" label="Chamar" onPress={() => act(e.id, "call")} />}
                {e.status === "chamado" && <Btn testID={`start-${e.id}`} icon="play" label="Iniciar" onPress={() => act(e.id, "start")} />}
                {e.status === "em_atendimento" && (
                  <>
                    <Btn testID={`complete-${e.id}`} icon="check" label="Concluir (dinheiro)" onPress={() => act(e.id, "complete", { use_mensal: false })} />
                    <Btn testID={`complete-mensal-${e.id}`} icon="award" label="Concluir (mensal)" onPress={() => act(e.id, "complete", { use_mensal: true })} />
                  </>
                )}
                <BtnGhost testID={`noshow-${e.id}`} label="Não compareceu" onPress={() => act(e.id, "noshow")} />
                <BtnGhost testID={`leave-${e.id}`} label="Cancelar" onPress={() => act(e.id, "leave")} />
              </View>
            </View>
          ))
        }
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
  h1: { color: colors.onSurface, fontSize: 26, fontWeight: "700" },
  sub: { color: colors.muted, marginTop: 4, marginBottom: spacing.lg },
  callNext: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brandPrimary, padding: spacing.lg, borderRadius: radius.md, marginBottom: spacing.lg },
  callNextTxt: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 15 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.sm },
  pos: { color: colors.brandPrimary, fontSize: 22, fontWeight: "800", width: 48, fontVariant: ["tabular-nums"] as any },
  name: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  svc: { color: colors.muted, fontSize: 12, marginTop: 2 },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandPrimary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm },
  btnTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 12 },
  btnGhost: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong },
  btnGhostTxt: { color: colors.onSurface, fontWeight: "600", fontSize: 12 },
  empty: { color: colors.muted, fontStyle: "italic", marginTop: spacing.xl },
});
