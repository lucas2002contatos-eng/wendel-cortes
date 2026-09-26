import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing, radius } from "@/src/theme";
import { api, getUser } from "@/src/api";
import { GoldButton, Card, Badge } from "@/src/ui";
import { openWhatsApp, bookingMsg } from "@/src/whatsapp";

function fmtDate(d: Date) {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function Agendar() {
  const insets = useSafeAreaInsets();
  const [services, setServices] = useState<any[]>([]);
  const [service, setService] = useState<any>(null);
  const [dates] = useState<Date[]>(() => Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; }));
  const [selDate, setSelDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [mode, setMode] = useState<string>("agenda");
  const [selSlot, setSelSlot] = useState<string | null>(null);
  const [payment, setPayment] = useState<string>("pix");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sub, setSub] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const s = await api("/services");
        setServices(s.filter((x: any) => x.active));
        const su = await api("/subscription/me");
        setSub(su);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!service || !selDate) return;
    setLoading(true); setSlots([]); setSelSlot(null);
    api(`/agenda/available/${selDate}?service_id=${service.id}`)
      .then((r) => { setSlots(r.slots); setMode(r.mode); })
      .catch(() => setSlots([]))
      .finally(() => setLoading(false));
  }, [service, selDate]);

  const canMensal = sub && sub.status === "active" && (sub.cuts_total - sub.cuts_used) > 0;

  const confirm = async () => {
    if (!service || !selDate || !selSlot) return;
    setErr(null); setMsg(null); setLoading(true);
    try {
      await api("/appointments", { method: "POST", body: JSON.stringify({ service_id: service.id, date: selDate, time: selSlot, payment_method: payment }) });
      setMsg("Agendamento confirmado!");
      const u = await getUser();
      if (u?.phone) {
        openWhatsApp(u.phone, bookingMsg(u.name, service.name, selDate, selSlot, payment));
      }
      setTimeout(() => router.replace("/(client)/perfil"), 1200);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: spacing["3xl"], paddingHorizontal: spacing.xl }}>
        <Text style={styles.h1}>Agendar</Text>
        <Text style={styles.sub}>Escolha o serviço e o horário</Text>

        <Text style={styles.sec}>Serviço</Text>
        <View style={{ gap: spacing.sm }}>
          {services.map((s) => (
            <Pressable key={s.id} testID={`svc-${s.name}`} onPress={() => setService(s)} style={[styles.svcRow, service?.id === s.id && styles.svcRowSel]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.svcName}>{s.name}</Text>
                <Text style={styles.svcMeta}>{s.duration_min} min · R$ {s.price.toFixed(2)}</Text>
              </View>
              {service?.id === s.id && <Icon name="check-circle" size={20} color={colors.brandPrimary} />}
            </Pressable>
          ))}
        </View>

        {service && (
          <>
            <Text style={styles.sec}>Data</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.xl }}>
              {dates.map((d) => {
                const ds = fmtDate(d);
                const sel = selDate === ds;
                return (
                  <Pressable key={ds} testID={`date-${ds}`} onPress={() => setSelDate(ds)} style={[styles.dateChip, sel && styles.dateChipSel]}>
                    <Text style={[styles.dateDay, sel && { color: colors.onBrandPrimary }]}>{["DOM","SEG","TER","QUA","QUI","SEX","SÁB"][d.getDay()]}</Text>
                    <Text style={[styles.dateNum, sel && { color: colors.onBrandPrimary }]}>{d.getDate()}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )}

        {selDate && (
          <>
            <Text style={styles.sec}>Horário</Text>
            {loading ? <ActivityIndicator color={colors.brandPrimary} /> : mode !== "agenda" ? (
              <Card><Text style={{ color: colors.onSurface }}>{mode === "fila" ? "Este dia está em modo FILA. Entre na fila pela aba Fila." : "Barbearia fechada neste dia."}</Text></Card>
            ) : slots.length === 0 ? (
              <Text style={{ color: colors.muted }}>Nenhum horário disponível.</Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {slots.map((t) => (
                  <Pressable key={t} testID={`slot-${t}`} onPress={() => setSelSlot(t)} style={[styles.slot, selSlot === t && styles.slotSel]}>
                    <Text style={[styles.slotTxt, selSlot === t && { color: colors.onBrandPrimary }]}>{t}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}

        {selSlot && (
          <>
            <Text style={styles.sec}>Pagamento</Text>
            <View style={{ gap: spacing.sm }}>
              {[
                { k: "pix", l: "PIX", i: "zap" },
                { k: "cartao", l: "Cartão", i: "credit-card" },
                { k: "dinheiro", l: "Dinheiro (pagar no local)", i: "dollar-sign" },
                ...(canMensal ? [{ k: "mensal", l: `Cliente Mensal (${sub.cuts_total - sub.cuts_used} disponíveis)`, i: "award" }] : []),
              ].map((p) => (
                <Pressable key={p.k} testID={`pay-${p.k}`} onPress={() => setPayment(p.k)} style={[styles.payRow, payment === p.k && styles.payRowSel]}>
                  <Icon name={p.i as any} size={18} color={payment === p.k ? colors.brandPrimary : colors.muted} />
                  <Text style={[styles.payTxt, payment === p.k && { color: colors.onSurface }]}>{p.l}</Text>
                </Pressable>
              ))}
            </View>

            {err && <View style={{ marginTop: spacing.md, backgroundColor: colors.error, padding: spacing.md, borderRadius: radius.sm }}><Text style={{ color: colors.onError }}>{err}</Text></View>}
            {msg && <View style={{ marginTop: spacing.md, backgroundColor: colors.success, padding: spacing.md, borderRadius: radius.sm }}><Text style={{ color: colors.onSuccess }}>{msg}</Text></View>}
            <GoldButton testID="confirm-btn" label={loading ? "Confirmando..." : "Confirmar agendamento"} onPress={confirm} disabled={loading} style={{ marginTop: spacing.xl }} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.onSurface, fontSize: 28, fontWeight: "700" },
  sub: { color: colors.muted, marginTop: 4, marginBottom: spacing.xl },
  sec: { color: colors.muted, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", marginTop: spacing.xl, marginBottom: spacing.md },
  svcRow: { flexDirection: "row", alignItems: "center", padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  svcRowSel: { borderColor: colors.brandPrimary },
  svcName: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  svcMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  dateChip: { width: 60, height: 72, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, flexShrink: 0 },
  dateChipSel: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  dateDay: { color: colors.muted, fontSize: 10, letterSpacing: 1 },
  dateNum: { color: colors.onSurface, fontSize: 20, fontWeight: "700" },
  slot: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, minWidth: 74, alignItems: "center" },
  slotSel: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  slotTxt: { color: colors.onSurface, fontWeight: "600", fontVariant: ["tabular-nums"] },
  payRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  payRowSel: { borderColor: colors.brandPrimary },
  payTxt: { color: colors.muted, fontSize: 14, fontWeight: "600" },
});
