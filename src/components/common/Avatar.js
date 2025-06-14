import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import theme from '../../theme';

const Avatar = ({
  size = 'md',
  source,
  name,
  emoji,
  backgroundColor,
  style,
  textStyle,
  ...props
}) => {
  const getAvatarSize = () => {
    return theme.layouts.avatar[size] || theme.layouts.avatar.md;
  };

  const getInitials = (name) => {
    if (!name) return '';
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getFontSize = () => {
    const avatarSize = getAvatarSize();
    return avatarSize * 0.4; // 40% of avatar size
  };

  const getBackgroundColor = () => {
    if (backgroundColor) return backgroundColor;
    if (emoji) return theme.colors.primaryLight;
    
    // Generate color based on name
    if (name) {
      const colors = [
        theme.colors.primary,
        theme.colors.secondary,
        theme.colors.info,
        theme.colors.warning,
      ];
      const index = name.charCodeAt(0) % colors.length;
      return colors[index];
    }
    
    return theme.colors.primary;
  };

  const avatarSize = getAvatarSize();
  const avatarStyle = [
    styles.avatar,
    {
      width: avatarSize,
      height: avatarSize,
      borderRadius: avatarSize / 2,
      backgroundColor: getBackgroundColor(),
    },
    style,
  ];

  const renderContent = () => {
    if (source) {
      return (
        <Image
          source={source}
          style={[styles.image, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}
          {...props}
        />
      );
    }

    if (emoji) {
      return (
        <Text style={[styles.emoji, { fontSize: getFontSize() }, textStyle]}>
          {emoji}
        </Text>
      );
    }

    if (name) {
      return (
        <Text style={[styles.initials, { fontSize: getFontSize() }, textStyle]}>
          {getInitials(name)}
        </Text>
      );
    }

    // Default user icon
    return (
      <Text style={[styles.emoji, { fontSize: getFontSize() }, textStyle]}>
        👤
      </Text>
    );
  };

  return (
    <View style={avatarStyle}>
      {renderContent()}
    </View>
  );
};

const styles = StyleSheet.create({
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  image: {
    resizeMode: 'cover',
  },
  initials: {
    color: theme.colors.white,
    fontWeight: theme.fonts.weights.bold,
    fontFamily: theme.fonts.medium,
  },
  emoji: {
    textAlign: 'center',
  },
});

export default Avatar;