/**
 * Border radius and shadow tokens aligned with web (tailwind borderRadius.xl, boxShadow.hero).
 */
export const radius = {
  sm: 8,
  md: 12,
  xl: 14, // matches web rounded-xl
  card: 14
} as const;

export const shadows = {
  // Card: soft shadow aligned with web feel (hero-like)
  card: {
    shadowColor: "#030712",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6
  },
  cardElevated: {
    shadowColor: "#030712",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8
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
