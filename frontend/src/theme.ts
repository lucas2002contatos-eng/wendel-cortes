// Design tokens for WENDEL CORTES app - Dark Luxe personality.
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const dark = {
  surface: "#0a0a0a",
  onSurface: "#fcfcfc",
  surfaceSecondary: "#161618",
  onSurfaceSecondary: "#ececec",
  surfaceTertiary: "#212124",
  onSurfaceTertiary: "#e0e0e0",
  surfaceInverse: "#f8f8f8",
  onSurfaceInverse: "#0a0a0a",
  muted: "#8e8e93",

  brand: "#d4af37",
  onBrand: "#0a0a0a",
  brandPrimary: "#d4af37",
  onBrandPrimary: "#0a0a0a",
  brandSecondary: "#c5a059",
  onBrandSecondary: "#0a0a0a",
  brandTertiary: "#33280c",
  onBrandTertiary: "#d4af37",

  success: "#3b5e40",
  onSuccess: "#cce5d0",
  warning: "#8f6c24",
  onWarning: "#ffe299",
  error: "#6e2c2c",
  onError: "#ffbaba",
  info: "#2a3f54",
  onInfo: "#c4dcf2",

  border: "#2a2a2c",
  borderStrong: "#3f3f42",
  divider: "#1e1e20",
};

export type ThemeColors = typeof dark;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };
export const font = { display: "CormorantGaramond_600SemiBold", body: "System" };

export const defaultScheme = "dark" satisfies ColorScheme;
export const themes: { light?: ThemeColors; dark: ThemeColors } = { dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}
setColorScheme?.(defaultScheme);

export const colors = dark;

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = "dark";
  return { scheme, colors: dark };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
