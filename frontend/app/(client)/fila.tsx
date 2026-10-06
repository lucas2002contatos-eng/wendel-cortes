import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing, radius } from "@/src/theme";
import { api, getUser } from "@/src/api";
import { GoldButton, Card, Badge } from "@/src/ui";
import { openWhatsApp, queueMsg } from "@/src/whatsapp";
import { BarberPicker } from "@/src/components/barber-picker";

export default function Fila() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [selSvc, setSelSvc] = useState<any>(null);
  const [selBarber, setSelBarber] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [q, s] = await Promise.all([api("/queue/today"), api("/services")]);
      setData(q);
      setServices(s.filter((x: any) => x.active));
      if (!selSvc && s.length) setSelSvc(s.find((x: any) => x.active));
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, [selSvc]);

  useFocusEffect(useCallback(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const join = async () => {
    if (!selSvc || !selBarber) return;
    setBusy(true); setErr(null);
    try {
      const entry = await api("/queue/join", { method: "POST", body: JSON.stringify({ service_id: selSvc.id, barber_id: selBarber }) });
      await load();
      const u = await getUser();
      if (u?.phone && entry.position) {
        openWhatsApp(u.phone, queueMsg(u.name, selSvc.name, entry.position, entry.barber_name));
      }
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const leave = async () => {
    if (!data?.my_entry) return;
    setBusy(true); setErr(null);
    try { await api(`/queue/${data.my_entry.id}/leave`, { method: "POST" }); await load(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center" }}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: spacing["3xl"], paddingHorizontal: spacing.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        <Text style={styles.h1}>Fila de hoje</Text>
        <Text style={styles.sub}>Atendimento por ordem de chegada</Text>

        {data.mode !== "fila" ? (
          <Card style={{ marginTop: spacing.xl }}>
            <Icon name="clock" size={28} color={colors.brandPrimary} />
            <Text style={styles.title}>Fila indisponível hoje</Text>
            <Text style={styles.p}>{data.mode === "fechado" ? "Barbearia fechada." : "Hoje o atendimento é por agenda. Utilize a aba Agendar."}</Text>
          </Card>
        ) : data.my_entry ? (
          <View style={{ marginTop: spacing.xl }}>
            <View style={styles.ticket}>
              <Text style={styles.ticketLabel}>FILA DO {String(data.my_barber_name || "").toUpperCase()}</Text>
              {data.my_entry.status === "aguardando" ? (
                <>
                  <Text style={styles.ticketBig}>{data.my_position ?? "-"}º</Text>
                  <Text style={styles.ticketSub}>Você está em {data.my_position ?? "-"}º lugar · {data.ahead ?? 0} à frente · {data.behind ?? 0} atrás</Text>
                </>
              ) : (
                <>
                  <Icon name={data.my_entry.status === "chamado" ? "bell" : "scissors"} size={56} color={colors.brandPrimary} />
                  <Text style={styles.ticketSub}>{data.my_entry.status === "chamado" ? `É a sua vez com ${data.my_barber_name}! Dirija-se à cadeira.` : `Em atendimento com ${data.my_barber_name}`}</Text>
                </>
              )}
              <View style={styles.ticketRow}>
                <View style={{ flex: 1 }}><Text style={styles.ticketMini}>Serviço</Text><Text style={styles.ticketVal}>{data.my_entry.service_name}</Text></View>
                <View style={{ flex: 1 }}><Text style={styles.ticketMini}>Barbeiro</Text><Text style={styles.ticketVal}>{data.my_entry.barber_name}</Text></View>
              </View>
              <Badge label={data.my_entry.status.replace("_"," ").toUpperCase()} tone={data.my_entry.status === "chamado" ? "gold" : "info"} />
            </View>
            <GoldButton testID="leave-queue-btn" label="Sair da fila" onPress={leave} disabled={busy} style={{ marginTop: spacing.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.borderStrong }} />
          </View>
        ) : (
          <View style={{ marginTop: spacing.xl }}>
            <Text style={styles.sec}>Escolha o serviço</Text>
            <View style={{ gap: spacing.sm }}>
              {services.map((s) => (
                <Pressable key={s.id} testID={`qsvc-${s.name}`} onPress={() => setSelSvc(s)} style={[styles.svc, selSvc?.id === s.id && styles.svcSel]}>
                  <Text style={styles.svcName}>{s.name}</Text>
                  {selSvc?.id === s.id && <Icon name="check" size={18} color={colors.brandPrimary} />}
                </Pressable>
              ))}
            </View>
            <Text style={[styles.sec, { marginTop: spacing.xl }]}>Escolha seu barbeiro</Text>
            <BarberPicker
              barbers={(data.queues || []).filter((q: any) => q.window).map((q: any) => ({ id: q.barber_id, name: q.barber_name, photo_url: q.photo_url, description: `${q.waiting} na fila` }))}
              selected={selBarber}
              onSelect={setSelBarber}
              emptyText="Nenhum barbeiro atendendo hoje."
            />
            {err && <View style={{ marginTop: spacing.md, backgroundColor: colors.error, padding: spacing.md, borderRadius: radius.sm }}><Text style={{ color: colors.onError }}>{err}</Text></View>}
            <GoldButton testID="join-queue-btn" label={busy ? "Entrando..." : "Entrar na fila"} onPress={join} disabled={busy || !selSvc || !selBarber} style={{ marginTop: spacing.xl }} icon="log-in" />
          </View>
        )}

        {(data.queues || []).filter((q: any) => q.entries.length > 0).map((q: any) => (
          <View key={q.barber_id}>
            <Text style={[styles.sec, { marginTop: spacing.xl }]}>Fila do {q.barber_name} · {q.waiting} aguardando</Text>
            {q.entries.map((e: any, i: number) => (
              <View key={e.id} style={[styles.row, e.id === data.my_entry?.id && { borderColor: colors.brandPrimary }]}>
                <Text style={styles.rowPos}>{i + 1}º</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{e.client_name}</Text>
                  <Text style={styles.rowSvc}>{e.service_name}</Text>
                </View>
                <Badge label={e.status.replace("_"," ")} tone={e.status === "chamado" ? "gold" : e.status === "em_atendimento" ? "info" : "default"} />
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.onSurface, fontSize: 28, fontWeight: "700" },
  sub: { color: colors.muted, marginTop: 4 },
  sec: { color: colors.muted, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: spacing.md },
  title: { color: colors.onSurface, fontSize: 18, fontWeight: "700", marginTop: spacing.md },
  p: { color: colors.muted, marginTop: 6 },
  ticket: { backgroundColor: colors.surfaceSecondary, borderColor: colors.brandPrimary, borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", gap: spacing.md },
  ticketLabel: { color: colors.brandPrimary, letterSpacing: 3, fontWeight: "700", fontSize: 12 },
  ticketBig: { color: colors.onSurface, fontSize: 96, fontWeight: "800", fontVariant: ["tabular-nums"] as any, lineHeight: 104 },
  ticketSub: { color: colors.onSurfaceSecondary, fontSize: 14, marginTop: -8, textAlign: "center" },
  ticketRow: { flexDirection: "row", gap: spacing.lg, alignSelf: "stretch" },
  ticketMini: { color: colors.muted, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
  ticketVal: { color: colors.onSurface, fontSize: 14, fontWeight: "600", marginTop: 2 },
  svc: { flexDirection: "row", alignItems: "center", padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md },
  svcSel: { borderColor: colors.brandPrimary },
  svcName: { color: colors.onSurface, flex: 1, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, gap: spacing.md, marginBottom: 6 },
  rowPos: { color: colors.brandPrimary, fontWeight: "800", fontSize: 16, width: 32, fontVariant: ["tabular-nums"] as any },
  rowName: { color: colors.onSurface, fontWeight: "600" },
  rowSvc: { color: colors.muted, fontSize: 12 },
});
