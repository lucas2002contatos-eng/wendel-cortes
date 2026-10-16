import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { Image } from "expo-image";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing, radius } from "@/src/theme";
import { imgUrl } from "@/src/components/image-field";

export type BarberLite = { id: string; name: string; photo_url?: string; description?: string; window?: { start: string; end: string } | null };

export function BarberAvatar({ barber, size = 56 }: { barber: { name: string; photo_url?: string }; size?: number }) {
  const initials = barber.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  if (barber.photo_url) {
    return <Image source={imgUrl(barber.photo_url)} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceTertiary }} contentFit="cover" />;
  }
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarTxt, { fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}

/**
 * "Escolha o barbeiro" — horizontal cards with photo, name and short description.
 * `selected` is a barber id or "any". Pass allowAny=false to hide the "Qualquer barbeiro" option.
 */
export function BarberPicker({ barbers, selected, onSelect, allowAny = true, emptyText = "Nenhum barbeiro disponível." }: {
  barbers: BarberLite[]; selected: string | null; onSelect: (id: string) => void; allowAny?: boolean; emptyText?: string;
}) {
  if (barbers.length === 0) return <Text style={styles.empty}>{emptyText}</Text>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.xl }}>
      {allowAny && (
        <Pressable testID="barber-any" onPress={() => onSelect("any")} style={[styles.card, selected === "any" && styles.cardSel]}>
          <View style={[styles.avatar, { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceTertiary }]}>
            <Icon name="users" size={22} color={colors.brandPrimary} />
          </View>
          <Text style={styles.name}>Qualquer</Text>
          <Text style={styles.desc} numberOfLines={2}>Primeiro horário livre</Text>
          {selected === "any" && <Icon name="check-circle" size={16} color={colors.brandPrimary} style={styles.check} />}
        </Pressable>
      )}
      {barbers.map((b) => {
        const sel = selected === b.id;
        return (
          <Pressable key={b.id} testID={`barber-${b.name}`} onPress={() => onSelect(b.id)} style={[styles.card, sel && styles.cardSel]}>
            <BarberAvatar barber={b} />
            <Text style={styles.name} numberOfLines={1}>{b.name}</Text>
            <Text style={styles.desc} numberOfLines={2}>{b.description || (b.window ? `${b.window.start} – ${b.window.end}` : "Barbeiro")}</Text>
            {sel && <Icon name="check-circle" size={16} color={colors.brandPrimary} style={styles.check} />}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { width: 132, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: 6, flexShrink: 0 },
  cardSel: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  avatar: { backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: colors.brandPrimary, fontWeight: "800", letterSpacing: 1 },
  name: { color: colors.onSurface, fontWeight: "700", fontSize: 14, marginTop: 4 },
  desc: { color: colors.muted, fontSize: 11, textAlign: "center", lineHeight: 14 },
  check: { position: "absolute", top: 8, right: 8 },
  empty: { color: colors.muted, fontStyle: "italic" },
});
