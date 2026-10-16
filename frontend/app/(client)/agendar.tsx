import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing, radius } from "@/src/theme";
import { api, getUser } from "@/src/api";
import { GoldButton, Card } from "@/src/ui";
import { openWhatsApp, bookingMsg } from "@/src/whatsapp";
import { BarberPicker } from "@/src/components/barber-picker";
import { PixPayment } from "@/src/components/pix-payment";

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
  const [slots, setSlots] = useState<any[]>([]);
  const [mode, setMode] = useState<string>("agenda");
  const [selSlot, setSelSlot] = useState<any>(null);
  const [barbers, setBarbers] = useState<any[]>([]);
  const [selBarber, setSelBarber] = useState<string | null>(null);
  const [payment, setPayment] = useState<string>("pix");
  const [pixData, setPixData] = useState<any>(null);
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
        const [su, bs] = await Promise.all([api("/subscription/me"), api("/barbers")]);
        setSub(su);
        setBarbers(bs);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!service || !selDate || !selBarber) return;
    setLoading(true); setSlots([]); setSelSlot(null);
    api(`/agenda/available/${selDate}?service_id=${service.id}&barber_id=${selBarber}`)
      .then((r) => { setSlots(r.slots); setMode(r.mode); })
      .catch(() => setSlots([]))
      .finally(() => setLoading(false));
  }, [service, selDate, selBarber]);

  const canMensal = sub && sub.status === "active" && (sub.cuts_total - sub.cuts_used) > 0;
  const selBarberName = selBarber === "any" ? null : barbers.find((b) => b.id === selBarber)?.name;

  const confirm = async () => {
    if (!service || !selDate || !selSlot) return;
    setErr(null); setMsg(null); setLoading(true);
    try {
      const apt = await api("/appointments", { method: "POST", body: JSON.stringify({ service_id: service.id, date: selDate, time: selSlot.time, payment_method: payment, barber_id: selSlot.barber_id }) });
      setMsg(`Agendamento confirmado com ${apt.barber_name}!`);
      const u = await getUser();
      if (u?.phone) {
        openWhatsApp(u.phone, bookingMsg(u.name, service.name, selDate, selSlot.time, payment, apt.barber_name));
      }
      if (payment === "pix" && apt.pix) { setPixData({ ...apt.pix, apt }); return; }
      setTimeout(() => router.replace("/(client)/perfil"), 1200);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  if (pixData) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: spacing["3xl"], paddingHorizontal: spacing.xl }}>
          <PixPayment pix={pixData} apt={pixData.apt} onDone={() => router.replace("/(client)/perfil")} />
        </ScrollView>
      </View>
    );
  }

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
            <Text style={styles.sec}>Escolha o barbeiro</Text>
            <BarberPicker barbers={barbers} selected={selBarber} onSelect={(id) => { setSelBarber(id); setSelSlot(null); }} />
          </>
        )}

        {service && selBarber && (
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

        {selDate && selBarber && (
          <>
            <Text style={styles.sec}>Horário{selBarberName ? ` · ${selBarberName}` : " · Qualquer barbeiro"}</Text>
            {loading ? <ActivityIndicator color={colors.brandPrimary} /> : mode !== "agenda" ? (
              <Card><Text style={{ color: colors.onSurface }}>{mode === "fila" ? "Este dia está em modo FILA. Entre na fila pela aba Fila." : "Barbearia fechada neste dia."}</Text></Card>
            ) : slots.length === 0 ? (
              <Text style={{ color: colors.muted }}>{selBarberName ? `${selBarberName} não tem horários disponíveis neste dia.` : "Nenhum horário disponível."}</Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {slots.map((s) => {
                  const sel = selSlot?.time === s.time;
                  return (
                    <Pressable key={s.time} testID={`slot-${s.time}`} onPress={() => setSelSlot(s)} style={[styles.slot, sel && styles.slotSel]}>
                      <Text style={[styles.slotTxt, sel && { color: colors.onBrandPrimary }]}>{s.time}</Text>
                      {selBarber === "any" && <Text style={[styles.slotBarber, sel && { color: colors.onBrandPrimary }]}>{s.barber_name}</Text>}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}

        {selSlot && (
          <>
            <View style={styles.summary}>
              <Icon name="scissors" size={16} color={colors.brandPrimary} />
              <Text style={styles.summaryTxt}>{service.name} · {selSlot.time} com <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>{selSlot.barber_name}</Text></Text>
            </View>
            <Text style={styles.sec}>Pagamento</Text>
            <View style={{ gap: spacing.sm }}>
              {[
                { k: "pix", l: "PIX", d: "Pagamento online pelo site — QR Code e Copia e Cola.", i: "zap" },
                { k: "cartao", l: "Cartão", d: "Pagamento presencial — Cartão. O pagamento será realizado na maquininha no momento do atendimento.", i: "credit-card" },
                { k: "dinheiro", l: "Dinheiro", d: "Pagamento presencial — Dinheiro. O pagamento será realizado diretamente na barbearia no momento do atendimento.", i: "dollar-sign" },
                ...(canMensal ? [{ k: "mensal", l: "Cliente Mensal", d: `Usar 1 dos ${sub.cuts_total - sub.cuts_used} cortes disponíveis (descontado só ao concluir).`, i: "award" }] : []),
              ].map((p) => (
                <Pressable key={p.k} testID={`pay-${p.k}`} onPress={() => setPayment(p.k)} style={[styles.payRow, payment === p.k && styles.payRowSel]}>
                  <Icon name={p.i as any} size={18} color={payment === p.k ? colors.brandPrimary : colors.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.payTxt, payment === p.k && { color: colors.onSurface }]}>{p.l}</Text>
                    <Text style={styles.payDesc}>{p.d}</Text>
                  </View>
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
  slotBarber: { color: colors.brandPrimary, fontSize: 10, marginTop: 2, fontWeight: "600" },
  summary: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xl, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  summaryTxt: { color: colors.onSurface, fontSize: 13, flex: 1 },
  payRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  payRowSel: { borderColor: colors.brandPrimary },
  payTxt: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  payDesc: { color: colors.muted, fontSize: 11, marginTop: 2, lineHeight: 15 },
});
