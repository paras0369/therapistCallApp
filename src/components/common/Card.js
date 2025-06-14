import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import theme from '../../theme';

const Card = ({
  children,
  style,
  variant = 'default',
  padding = 'default',
  shadow = 'md',
  onPress,
  ...props
}) => {
  const getCardStyle = () => {
    const baseStyle = [
      styles.card,
      styles[`card_${variant}`],
      styles[`padding_${padding}`],
      theme.shadows[shadow] || theme.shadows.md,
    ];
    
    if (style) {
      baseStyle.push(style);
    }
    
    return baseStyle;
  };

  if (onPress) {
    return (
      <TouchableOpacity
        style={getCardStyle()}
        onPress={onPress}
        activeOpacity={0.9}
        {...props}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View style={getCardStyle()} {...props}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.borderRadius.card,
    borderWidth: 1,
  },
  
  // Variants
  card_default: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  card_primary: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  card_success: {
    backgroundColor: theme.colors.secondaryLight,
    borderColor: theme.colors.secondary,
  },
  card_transparent: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  card_elevated: {
    backgroundColor: theme.colors.surface,
    borderColor: 'transparent',
  },
  
  // Padding variants
  padding_none: {
    padding: 0,
  },
  padding_small: {
    padding: theme.spacing.md,
  },
  padding_default: {
    padding: theme.spacing.cardPadding,
  },
  padding_large: {
    padding: theme.spacing.xxl,
  },
});

export default Card;