import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import theme from '../../theme';

const Button = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  icon,
  style,
  textStyle,
  ...props
}) => {
  const getButtonStyle = () => {
    const baseStyle = [styles.button, styles[`button_${variant}`], styles[`button_${size}`]];
    
    if (disabled || loading) {
      baseStyle.push(styles.button_disabled);
    }
    
    if (style) {
      baseStyle.push(style);
    }
    
    return baseStyle;
  };

  const getTextStyle = () => {
    const baseStyle = [styles.text, styles[`text_${variant}`], styles[`text_${size}`]];
    
    if (disabled || loading) {
      baseStyle.push(styles.text_disabled);
    }
    
    if (textStyle) {
      baseStyle.push(textStyle);
    }
    
    return baseStyle;
  };

  return (
    <TouchableOpacity
      style={getButtonStyle()}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      {...props}
    >
      {loading ? (
        <ActivityIndicator 
          size="small" 
          color={variant === 'primary' ? theme.colors.white : theme.colors.primary} 
        />
      ) : (
        <>
          {icon && icon}
          <Text style={getTextStyle()}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: theme.borderRadius.button,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    ...theme.shadows.md,
  },
  
  // Variants
  button_primary: {
    backgroundColor: theme.colors.primary,
  },
  button_secondary: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  button_outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.textSecondary,
    ...theme.shadows.none,
  },
  button_ghost: {
    backgroundColor: 'transparent',
  },
  button_danger: {
    backgroundColor: theme.colors.error,
  },
  button_success: {
    backgroundColor: theme.colors.success,
  },
  
  // Sizes
  button_small: {
    height: 36,
    paddingHorizontal: theme.spacing.md,
  },
  button_medium: {
    height: 48,
    paddingHorizontal: theme.spacing.lg,
  },
  button_large: {
    height: 56,
    paddingHorizontal: theme.spacing.xl,
  },
  
  // Disabled state
  button_disabled: {
    backgroundColor: theme.colors.disabled,
    ...theme.shadows.none,
  },
  
  // Text styles
  text: {
    fontFamily: theme.fonts.medium,
    textAlign: 'center',
  },
  
  // Text variants
  text_primary: {
    color: theme.colors.white,
    fontWeight: theme.fonts.weights.semibold,
  },
  text_secondary: {
    color: theme.colors.primary,
    fontWeight: theme.fonts.weights.semibold,
  },
  text_outline: {
    color: theme.colors.textPrimary,
    fontWeight: theme.fonts.weights.medium,
  },
  text_ghost: {
    color: theme.colors.primary,
    fontWeight: theme.fonts.weights.medium,
  },
  text_danger: {
    color: theme.colors.white,
    fontWeight: theme.fonts.weights.semibold,
  },
  text_success: {
    color: theme.colors.white,
    fontWeight: theme.fonts.weights.semibold,
  },
  
  // Text sizes
  text_small: {
    fontSize: theme.fonts.sizes.sm,
  },
  text_medium: {
    fontSize: theme.fonts.sizes.md,
  },
  text_large: {
    fontSize: theme.fonts.sizes.lg,
  },
  
  // Text disabled
  text_disabled: {
    color: theme.colors.textTertiary,
  },
});

export default Button;