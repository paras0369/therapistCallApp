import { Platform, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

export const COLORS = {
  // Primary colors
  primary: '#FF6B35',
  primaryLight: '#FFF4F0',
  primaryDark: '#E55A2B',
  
  // Secondary colors
  secondary: '#4CAF50',
  secondaryLight: '#E8F5E8',
  secondaryDark: '#388E3C',
  
  // Neutral colors
  white: '#FFFFFF',
  black: '#000000',
  background: '#F8F9FA',
  surface: '#FFFFFF',
  
  // Text colors
  textPrimary: '#2C2C2C',
  textSecondary: '#666666',
  textTertiary: '#999999',
  textLight: '#FFFFFF',
  
  // Status colors
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  info: '#2196F3',
  
  // Interactive colors
  link: '#007AFF',
  disabled: '#E0E0E0',
  
  // Border colors
  border: '#F0F0F0',
  borderLight: '#F5F5F5',
  borderDark: '#E0E0E0',
  
  // Shadow colors
  shadow: '#000000',
  
  // Overlay colors
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  
  // Call specific colors
  muted: '#FFE8E8',
  mutedBorder: '#FF6B6B',
  speaker: '#FFF4F0',
  speakerBorder: '#FF6B35',
  connected: '#4CAF50',
  connecting: '#FF9800',
  disconnected: '#F44336',
};

export const FONTS = {
  // Font families
  regular: Platform.select({
    ios: 'System',
    android: 'Roboto',
  }),
  medium: Platform.select({
    ios: 'System',
    android: 'Roboto-Medium',
  }),
  bold: Platform.select({
    ios: 'System',
    android: 'Roboto-Bold',
  }),
  
  // Font sizes
  sizes: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 20,
    xxxl: 24,
    display1: 28,
    display2: 32,
    display3: 48,
  },
  
  // Font weights
  weights: {
    light: '300',
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },
  
  // Line heights
  lineHeights: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
    loose: 1.8,
  },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 40,
  xxxxxl: 48,
  
  // Semantic spacing
  screenPadding: 24,
  cardPadding: 20,
  buttonPadding: 16,
  inputPadding: 12,
  
  // Vertical spacing
  sectionGap: 32,
  cardGap: 16,
  itemGap: 12,
  elementGap: 8,
};

export const BORDER_RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  round: 999,
  
  // Semantic border radius
  button: 12,
  card: 16,
  avatar: 999,
  input: 8,
};

export const SHADOWS = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  xl: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
  
  // Colored shadows
  primary: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  success: {
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
};

export const SCREEN = {
  width,
  height,
  isSmall: width < 375,
  isMedium: width >= 375 && width < 414,
  isLarge: width >= 414,
};

export const ANIMATIONS = {
  // Duration
  duration: {
    fast: 150,
    normal: 250,
    slow: 350,
  },
  
  // Easing
  easing: {
    easeIn: 'ease-in',
    easeOut: 'ease-out',
    easeInOut: 'ease-in-out',
  },
};

export const LAYOUTS = {
  // Safe area padding
  safeArea: {
    paddingTop: Platform.select({
      ios: 44,
      android: 24,
    }),
  },
  
  // Header heights
  header: {
    height: 60,
    paddingHorizontal: SPACING.screenPadding,
  },
  
  // Button heights
  button: {
    height: 48,
    minHeight: 44, // For accessibility
  },
  
  // Input heights
  input: {
    height: 48,
    minHeight: 44,
  },
  
  // Avatar sizes
  avatar: {
    xs: 24,
    sm: 32,
    md: 40,
    lg: 50,
    xl: 60,
    xxl: 80,
    xxxl: 120,
    xxxxl: 180,
  },
};

// Helper functions
export const getColorWithOpacity = (color, opacity) => {
  return `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
};

export const createTextStyle = (size, weight, color, lineHeight) => ({
  fontSize: FONTS.sizes[size] || size,
  fontWeight: FONTS.weights[weight] || weight,
  color: COLORS[color] || color,
  lineHeight: lineHeight ? FONTS.sizes[size] * lineHeight : undefined,
  fontFamily: FONTS.regular,
});

export const createShadowStyle = (shadowType) => {
  return SHADOWS[shadowType] || SHADOWS.none;
};

export default {
  colors: COLORS,
  fonts: FONTS,
  spacing: SPACING,
  borderRadius: BORDER_RADIUS,
  shadows: SHADOWS,
  screen: SCREEN,
  animations: ANIMATIONS,
  layouts: LAYOUTS,
  getColorWithOpacity,
  createTextStyle,
  createShadowStyle,
};