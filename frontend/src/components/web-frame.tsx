import { ReactNode, useEffect } from "react";
import { Platform, StyleSheet, View, useWindowDimensions, Text } from "react-native";
import { useSegments, usePathname } from "expo-router";
import { Logo } from "@/src/branding";
import { colors, spacing } from "@/src/theme";

const FRAME_MAX_WIDTH = 520;
const DESKTOP_BREAKPOINT = 768;

/**
 * On web desktop, centers mobile-designed screens in a fixed-width column.
 * Admin screens and the public landing page use the full browser width
 * (they have their own responsive layouts). On native it is a pass-through.
 */
export function WebFrame({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const segments = useSegments();
  const pathname = usePathname();
  const isDesktopWeb = Platform.OS === "web" && width >= DESKTOP_BREAKPOINT;
  const fullWidthRoute = pathname === "/" || (segments[0] as string) === "(admin)";

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    document.title = "Wendel Cortes — Barbearia";
    document.body.style.backgroundColor = colors.surface;
  }, []);

  if (!isDesktopWeb || fullWidthRoute) return <>{children}</>;

  return (
    <View style={styles.backdrop}>
      <View style={styles.sideBrand}>
        <View style={styles.logo}><Logo size={240} /></View>
        <Text style={styles.brandSub}>Agendamentos · Fila · Cliente Mensal</Text>
      </View>
      <View style={styles.frame}>{children}</View>
      <View style={styles.sideSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: colors.surface,
    alignItems: "stretch",
    justifyContent: "center",
  },
  frame: {
    flex: 1,
    maxWidth: FRAME_MAX_WIDTH,
    width: "100%",
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  sideBrand: {
    flex: 1,
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: spacing["3xl"],
  },
  sideSpacer: { flex: 1 },
  logo: { marginBottom: spacing.xl },
  brandSub: { color: colors.muted, fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase" },
});
