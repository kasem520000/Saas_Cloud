/**
 * PHASE-022 T2 — design-token port to React Native (ADR-0014: the mobile app
 * implements the SAME tokens, it never imports @erp/ui). Values mirror
 * packages/ui/src/tokens/tokens.ts; `tokens.parity.test.ts` asserts parity by
 * parsing that source file, so the two can never drift silently.
 */

export const colors = {
  brand: "#1D4ED8",
  brandStrong: "#1E40AF",
  success: "#15803D", // = colors.success.solid in packages/ui
  warning: "#B45309",
  danger: "#B91C1C",
  info: "#0369A1",
  ink: "#111827",
  inkMuted: "#4B5563",
  surface: "#FFFFFF",
  surfaceMuted: "#F3F4F6",
} as const;

export const surfaces = {
  card: colors.surface,
  page: colors.surfaceMuted,
  inset: "#F9FAFB",
} as const;

export const borders = { subtle: "#E5E7EB", default: "#D1D5DB", strong: "#9CA3AF" } as const;

export const radii = { sm: 6, md: 10, lg: 16, pill: 9999 } as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/** Touch targets ≥ 44 px (ACCESSIBILITY.md). */
export const touch = { min: 44 } as const;

export const typography = {
  title: { fontSize: 22, fontWeight: "700" as const },
  heading: { fontSize: 17, fontWeight: "600" as const },
  body: { fontSize: 15, fontWeight: "400" as const },
  caption: { fontSize: 12, fontWeight: "400" as const },
} as const;

/** Money is rendered from decimal strings (ADR-0009) — never float. */
export function formatMoney(amountText: string, currency: string, _locale: "ar" | "en"): string {
  // identifiers/numbers stay latn per the digits policy; sign handled by caller
  return `${amountText} ${currency}`;
}

export type Theme = {
  colors: typeof colors;
  surfaces: typeof surfaces;
  borders: typeof borders;
  radii: typeof radii;
  spacing: typeof spacing;
  touch: typeof touch;
  typography: typeof typography;
};

export const theme: Theme = { colors, surfaces, borders, radii, spacing, touch, typography };
