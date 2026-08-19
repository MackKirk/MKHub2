/**
 * Border radius and shadow tokens aligned with web (tailwind borderRadius.xl, boxShadow.hero).
 */
export const radius = {
  sm: 8,
  md: 12,
  control: 10,
  xl: 16,
  card: 16,
  pill: 999
} as const;

export const shadows = {
  // Card: soft shadow aligned with web feel (hero-like)
  card: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3
  },
  cardElevated: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6
  },
  // Button primary: subtle brand shadow
  buttonPrimary: {
    shadowColor: "#d11616",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4
  }
} as const;
