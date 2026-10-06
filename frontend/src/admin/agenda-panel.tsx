import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing, radius } from "@/src/theme";
import { api, getUser } from "@/src/api";
import { Badge, STATUS_LABELS, statusTone } from "@/src/ui";

const WD = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function fmt(d: Date) {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
const fmtBr = (s: string) => s.split("-").reverse().slice(0, 2).join("/");
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d: Date) => addDays(d, -((d.getDay() + 6) % 7)); // Monday

const NEXT_STATUS: Record<string, string> = {
  agendado: "cliente_chegou",
  pagamento_pendente: "pago",
  pago: "em_atendimento",
  cliente_chegou: "em_atendimento",
  em_atendimento: "concluido",
};

type ViewMode = "dia" | "semana" | "mes";

/**
 * Agenda dos Barbeiros: filter by barber (Todos / each barber) and switch between
 * daily, weekly and monthly views. Used standalone (Agenda tab) and embedded in the desktop dashboard.
 */
export function AgendaPanel({ compact = false }: { compact?: boolean }) {
  const [dates] = useState<Date[]>(() => Array.from({ length: 14 }, (_, i) => addDays(new Date(), i)));
  const [sel, setSel] = useState<string>(fmt(new Date()));
  const [view, setView] = useState<ViewMode>("dia");
  const [anchor, setAnchor] = useState<Date>(new Date()); // week/month navigation anchor
  const [barbers, setBarbers] = useState<any[]>([]);
  const [barber, setBarber] = useState<string>("all");
  const [apts, setApts] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [isBarber, setIsBarber] = useState(false);
  useEffect(() => { getUser().then((u) => setIsBarber(u?.role === "barber")); api("/barbers").then(setBarbers).catch(() => {}); }, []);

  const range = (): { from: string; to: string } => {
    if (view === "dia") return { from: sel, to: sel };
    if (view === "semana") { const s = startOfWeek(anchor); return { from: fmt(s), to: fmt(addDays(s, 6)) }; }
    const s = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const e = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { from: fmt(s), to: fmt(e) };
  };

  const load = useCallback(async () => {
    const { from, to } = range();
    try { setApts(await api(`/appointments?from_date=${from}&to_date=${to}&barber_id=${barber}`)); } catch {}
  }, [sel, view, anchor, barber]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const advance = async (a: any) => {
    const next = NEXT_STATUS[a.status]; if (!next) return;
    try { await api(`/appointments/${a.id}/status`, { method: "PUT", body: JSON.stringify({ status: next }) }); await load(); }
    catch (e: any) { alert(e.message); }
  };
  const cancel = async (a: any) => {
    try { await api(`/appointments/${a.id}/cancel`, { method: "POST" }); await load(); } catch (e: any) { alert(e.message); }
  };

  const pad = compact ? spacing.lg : spacing.xl;
  const byDate: Record<string, any[]> = {};
  for (const a of apts) (byDate[a.date] ||= []).push(a);

  const renderCard = (a: any) => (
    <View key={a.id} style={styles.card} testID={`apt-${a.id}`}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.time}>{a.time} <Text style={styles.barberTag}>— {a.barber_name || "Sem barbeiro"}</Text></Text>
          <Text style={styles.name}>{a.client_name}</Text>
          <Text style={styles.svc}>{a.service_name} · {a.client_phone}</Text>
          <Text style={styles.svc}>{a.used_mensal ? "Cliente Mensal" : `R$ ${Number(a.price).toFixed(2)} · ${a.payment_method.toUpperCase()}`}</Text>
          {a.presence_confirmed && (
            <View style={styles.presence}>
              <Icon name="check-circle" size={12} color={colors.onSuccess} />
              <Text style={styles.presenceTxt}>Presença confirmada pelo cliente</Text>
            </View>
          )}
        </View>
        <Badge label={STATUS_LABELS[a.status]} tone={statusTone(a.status)} />
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
        {NEXT_STATUS[a.status] && (
          <Pressable testID={`advance-${a.id}`} onPress={() => advance(a)} style={styles.btn}>
            <Icon name="chevron-right" size={16} color={colors.onBrandPrimary} />
            <Text style={styles.btnTxt}>{a.status === "em_atendimento" ? "Concluir" : "Avançar"}</Text>
          </Pressable>
        )}
        {!["cancelado", "concluido", "nao_compareceu"].includes(a.status) && (
          <Pressable testID={`ag-cancel-${a.id}`} onPress={() => cancel(a)} style={styles.btnGhost}>
            <Text style={styles.btnGhostTxt}>Cancelar</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  const renderLine = (a: any) => (
    <View key={a.id} style={styles.line}>
      <Text style={styles.lineTime}>{a.time}</Text>
      <Text style={styles.lineTxt} numberOfLines={1}>{a.client_name} — {a.service_name} — <Text style={{ color: colors.brandPrimary }}>{a.barber_name || "—"}</Text></Text>
      <Badge label={STATUS_LABELS[a.status]} tone={statusTone(a.status)} />
    </View>
  );

  const renderMonth = () => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => fmt(new Date(anchor.getFullYear(), anchor.getMonth(), i + 1)))];
    while (cells.length % 7) cells.push(null);
    const today = fmt(new Date());
    return (
      <View>
        <View style={styles.monthHead}>{["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => <Text key={i} style={styles.monthHeadTxt}>{d}</Text>)}</View>
        <View style={styles.monthGrid}>
          {cells.map((ds, i) => {
            if (!ds) return <View key={i} style={styles.monthCell} />;
            const n = (byDate[ds] || []).filter((a) => !["cancelado", "nao_compareceu"].includes(a.status)).length;
            return (
              <Pressable key={ds} testID={`month-day-${ds}`} onPress={() => { setSel(ds); setView("dia"); }} style={[styles.monthCell, styles.monthCellActive, ds === today && { borderColor: colors.brandPrimary }]}>
                <Text style={styles.monthDay}>{Number(ds.slice(-2))}</Text>
                {n > 0 && <View style={styles.monthCount}><Text style={styles.monthCountTxt}>{n}</Text></View>}
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  const navLabel = view === "semana"
    ? `${fmtBr(fmt(startOfWeek(anchor)))} – ${fmtBr(fmt(addDays(startOfWeek(anchor), 6)))}`
    : `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
  const shift = (dir: number) => setAnchor(view === "semana" ? addDays(anchor, 7 * dir) : new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1));

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: pad }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={compact ? styles.h2 : styles.h1}>{isBarber ? "Minha agenda" : "Agenda dos Barbeiros"}</Text>
          <View style={styles.seg}>
            {(["dia", "semana", "mes"] as ViewMode[]).map((v) => (
              <Pressable key={v} testID={`view-${v}`} onPress={() => setView(v)} style={[styles.segBtn, view === v && styles.segBtnSel]}>
                <Text style={[styles.segTxt, view === v && { color: colors.onBrandPrimary }]}>{v === "dia" ? "Dia" : v === "semana" ? "Semana" : "Mês"}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {!isBarber && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingTop: spacing.md }}>
          {[{ id: "all", name: "Todos os barbeiros" }, ...barbers].map((b) => (
            <Pressable key={b.id} testID={`agenda-barber-${b.id === "all" ? "all" : b.name}`} onPress={() => setBarber(b.id)} style={[styles.bchip, barber === b.id && styles.bchipSel]}>
              <Text style={[styles.bchipTxt, barber === b.id && { color: colors.onBrandPrimary }]}>{b.name}{b.active === false ? " (inativo)" : ""}</Text>
            </Pressable>
          ))}
        </ScrollView>}

        {view === "dia" ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.md }}>
            {dates.map((d) => {
              const ds = fmt(d); const s = sel === ds;
              return (
                <Pressable key={ds} testID={`ag-date-${ds}`} onPress={() => setSel(ds)} style={[styles.chip, compact && styles.chipCompact, s && styles.chipSel]}>
                  <Text style={[styles.day, s && { color: colors.onBrandPrimary }]}>{WD[d.getDay()]}</Text>
                  <Text style={[styles.num, compact && { fontSize: 16 }, s && { color: colors.onBrandPrimary }]}>{d.getDate()}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <View style={styles.nav}>
            <Pressable testID="nav-prev" onPress={() => shift(-1)} style={styles.navBtn}><Icon name="chevron-left" size={20} color={colors.onSurface} /></Pressable>
            <Text style={styles.navTxt}>{navLabel}</Text>
            <Pressable testID="nav-next" onPress={() => shift(1)} style={styles.navBtn}><Icon name="chevron-right" size={20} color={colors.onSurface} /></Pressable>
          </View>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: spacing["3xl"] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brandPrimary} />}
      >
        {view === "dia" && (apts.length === 0 ? <Text style={styles.empty}>Nenhum agendamento neste dia.</Text> : apts.map(renderCard))}
        {view === "semana" && Array.from({ length: 7 }, (_, i) => fmt(addDays(startOfWeek(anchor), i))).map((ds) => (
          <View key={ds} style={{ marginBottom: spacing.md }}>
            <Pressable testID={`week-day-${ds}`} onPress={() => { setSel(ds); setView("dia"); }} style={styles.weekHead}>
              <Text style={styles.weekHeadTxt}>{WD[new Date(ds + "T12:00:00").getDay()]} · {fmtBr(ds)}</Text>
              <Text style={styles.weekCount}>{(byDate[ds] || []).length} atend.</Text>
            </Pressable>
            {(byDate[ds] || []).length === 0 ? <Text style={styles.weekEmpty}>—</Text> : byDate[ds].map(renderLine)}
          </View>
        ))}
        {view === "mes" && renderMonth()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.onSurface, fontSize: 22, fontWeight: "700", flexShrink: 1 },
  h2: { color: colors.onSurface, fontSize: 16, fontWeight: "700", letterSpacing: 0.5, flexShrink: 1 },
  seg: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, padding: 2 },
  segBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  segBtnSel: { backgroundColor: colors.brandPrimary },
  segTxt: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  bchip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  bchipSel: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  bchipTxt: { color: colors.onSurface, fontSize: 12, fontWeight: "600" },
  chip: { width: 60, height: 72, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, flexShrink: 0 },
  chipCompact: { width: 52, height: 60 },
  chipSel: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  day: { color: colors.muted, fontSize: 10, letterSpacing: 1 },
  num: { color: colors.onSurface, fontSize: 20, fontWeight: "700" },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md },
  navBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  navTxt: { color: colors.onSurface, fontWeight: "700", fontSize: 14 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
  time: { color: colors.brandPrimary, fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"] as any },
  barberTag: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
  name: { color: colors.onSurface, fontSize: 15, fontWeight: "700", marginTop: 4 },
  svc: { color: colors.muted, fontSize: 12, marginTop: 2 },
  presence: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, alignSelf: "flex-start", backgroundColor: colors.success, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  presenceTxt: { color: colors.onSuccess, fontSize: 11, fontWeight: "600" },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandPrimary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.sm },
  btnTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 13 },
  btnGhost: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong },
  btnGhostTxt: { color: colors.onSurface, fontWeight: "600", fontSize: 13 },
  empty: { color: colors.muted, marginTop: spacing.xl, fontStyle: "italic" },
  weekHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider, marginBottom: 6 },
  weekHeadTxt: { color: colors.onSurface, fontWeight: "700", fontSize: 13 },
  weekCount: { color: colors.muted, fontSize: 12 },
  weekEmpty: { color: colors.muted, fontSize: 12, paddingVertical: 4 },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 8, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, marginBottom: 4 },
  lineTime: { color: colors.brandPrimary, fontWeight: "800", width: 48, fontVariant: ["tabular-nums"] as any },
  lineTxt: { color: colors.onSurface, flex: 1, fontSize: 13 },
  monthHead: { flexDirection: "row", marginTop: spacing.sm },
  monthHeadTxt: { flex: 1, textAlign: "center", color: colors.muted, fontSize: 11, fontWeight: "700" },
  monthGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  monthCell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  monthCellActive: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", gap: 2 },
  monthDay: { color: colors.onSurface, fontSize: 13, fontWeight: "600" },
  monthCount: { backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
  monthCountTxt: { color: colors.onBrandPrimary, fontSize: 10, fontWeight: "800" },
});
