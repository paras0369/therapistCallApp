import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
  Alert,
} from 'react-native';
import axios from 'axios';

// New imports
import { useAuth, useCall } from '../context';
import { Button, Card, Avatar, LoadingState, ErrorBoundary } from './common';
import theme from '../theme';

// Existing imports
import { API_ENDPOINTS } from '../config/api';
import AuthService from '../services/AuthService';

const UserDashboard = ({ navigation }) => {
  // Local state
  const [therapists, setTherapists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [startingCall, setStartingCall] = useState(false);

  // Context hooks
  const { user, logout } = useAuth();
  const { startCall, incomingCall, acceptCall, rejectCall } = useCall();

  useEffect(() => {
    loadData();
  }, []);

  // Handle incoming calls
  useEffect(() => {
    if (incomingCall) {
      Alert.alert('Incoming Call', `Call from ${incomingCall.therapistName}`, [
        {
          text: 'Decline',
          onPress: () => handleRejectCall(incomingCall.callId),
        },
        {
          text: 'Accept',
          onPress: () => handleAcceptCall(incomingCall.callId),
        },
      ]);
    }
  }, [incomingCall]);

  const handleAcceptCall = useCallback(
    async callId => {
      const result = await acceptCall(callId);
      if (result.success) {
        navigation.navigate('CallScreen');
      } else {
        Alert.alert('Error', result.error || 'Failed to accept call');
      }
    },
    [acceptCall, navigation],
  );

  const handleRejectCall = useCallback(
    callId => {
      rejectCall(callId);
    },
    [rejectCall],
  );

  const loadData = useCallback(async () => {
    try {
      // Use AuthService for token (will be replaced by context in future)
      const token = await AuthService.getAuthToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [therapistsResponse, profileResponse] = await Promise.all([
        axios.get(API_ENDPOINTS.GET_AVAILABLE_THERAPISTS, { headers }),
        axios.get(API_ENDPOINTS.GET_USER_PROFILE, { headers }),
      ]);

      setTherapists(therapistsResponse.data.therapists);
      setUserProfile(profileResponse.data.user);
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleStartCall = useCallback(
    async (therapistId, therapistName) => {
      // Prevent duplicate calls
      if (startingCall) {
        console.log('Call already in progress, ignoring duplicate request');
        return;
      }

      if (userProfile.coins < 6) {
        Alert.alert(
          'Insufficient Coins',
          'You need at least 6 coins to start a call',
        );
        return;
      }

      Alert.alert('Start Call', `Call ${therapistName}? (6 coins per minute)`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call',
          onPress: async () => {
            if (startingCall) {
              console.log('Call already in progress, ignoring');
              return;
            }
            
            setStartingCall(true);
            try {
              const result = await startCall(therapistId, therapistName);
              if (!result.success) {
                Alert.alert('Error', result.error || 'Failed to start call');
              } else {
                navigation.navigate('CallScreen');
              }
            } catch (error) {
              console.error('Start call error:', error);
              Alert.alert('Error', 'Failed to start call');
            } finally {
              setStartingCall(false);
            }
          },
        },
      ]);
    },
    [userProfile, startCall, navigation, startingCall],
  );


  const handleLogout = useCallback(async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        onPress: async () => {
          await logout();
          navigation.replace('UserTypeSelection');
        },
      },
    ]);
  }, [logout, navigation]);

  const renderTherapist = useCallback(
    ({ item }) => (
      <Card
        style={styles.therapistCard}
        shadow="md"
      >
        <View style={styles.therapistHeader}>
          <Avatar
            size="xl"
            emoji="👨‍⚕️"
            backgroundColor={theme.colors.primaryLight}
          />
          <View style={styles.statusBadge}>
            <View style={styles.onlineIndicator} />
            <Text style={styles.statusText}>Available</Text>
          </View>
        </View>

        <View style={styles.therapistInfo}>
          <Text style={styles.therapistName}>{item.name}</Text>
          <Text style={styles.therapistSpecialization}>
            {item.specialization}
          </Text>
          <View style={styles.therapistMeta}>
            <Text style={styles.ratingText}>⭐ 4.8 Rating</Text>
            <Text style={styles.sessionText}>6 coins/min</Text>
          </View>
        </View>

        <Button
          title={startingCall ? "Calling..." : "Start Call"}
          variant="primary"
          size="medium"
          style={styles.callButton}
          disabled={startingCall}
          onPress={() => handleStartCall(item._id, item.name)}
        />
      </Card>
    ),
    [handleStartCall, startingCall],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingState
          type="data"
          text="Loading dashboard..."
          subtext="Fetching available therapists"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.userInfo}>
            <Avatar
              size="lg"
              emoji="👤"
              backgroundColor={theme.colors.primary}
            />
            <View style={styles.userTextInfo}>
              <Text style={styles.welcomeText}>Welcome back!</Text>
              <Text style={styles.userName}>User Dashboard</Text>
            </View>
          </View>
          <Button
            title="Logout"
            variant="outline"
            size="small"
            onPress={handleLogout}
          />
        </View>

        <View style={styles.statsContainer}>
          <Card variant="primary" style={styles.coinsCard}>
            <Text style={styles.coinsIcon}>💰</Text>
            <View>
              <Text style={styles.coinsAmount}>{userProfile?.coins || 0}</Text>
              <Text style={styles.coinsLabel}>Available Coins</Text>
            </View>
          </Card>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Available Therapists</Text>
          <Text style={styles.sectionSubtitle}>
            Find the perfect match for your needs
          </Text>
        </View>

        {therapists.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Avatar
              size="xxxxl"
              emoji="👨‍⚕️"
              backgroundColor={theme.colors.primaryLight}
              style={styles.emptyAvatar}
            />
            <Text style={styles.emptyTitle}>No Therapists Available</Text>
            <Text style={styles.emptyText}>
              All therapists are currently busy. Please try again in a few
              minutes.
            </Text>
            <Button
              title="Refresh List"
              variant="primary"
              onPress={onRefresh}
              style={styles.refreshButton}
            />
          </View>
        ) : (
          <FlatList
            data={therapists}
            renderItem={renderTherapist}
            keyExtractor={(item, index) =>
              item._id?.toString() || `therapist-${index}`
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.primary}
                colors={[theme.colors.primary]}
              />
            }
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    backgroundColor: theme.colors.surface,
    paddingTop: 60,
    paddingHorizontal: theme.spacing.screenPadding,
    paddingBottom: theme.spacing.xxl,
    ...theme.shadows.sm,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xxl,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userTextInfo: {
    marginLeft: theme.spacing.md,
  },
  welcomeText: {
    fontSize: theme.fonts.sizes.lg,
    color: theme.colors.textSecondary,
    fontWeight: theme.fonts.weights.medium,
  },
  userName: {
    fontSize: theme.fonts.sizes.xxl,
    color: theme.colors.textPrimary,
    fontWeight: theme.fonts.weights.bold,
  },
  statsContainer: {
    marginTop: theme.spacing.sm,
  },
  coinsCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  coinsIcon: {
    fontSize: 32,
    marginRight: theme.spacing.lg,
  },
  coinsAmount: {
    fontSize: theme.fonts.sizes.display1,
    fontWeight: theme.fonts.weights.extrabold,
    color: theme.colors.primary,
  },
  coinsLabel: {
    fontSize: theme.fonts.sizes.md,
    color: theme.colors.textSecondary,
    fontWeight: theme.fonts.weights.medium,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.screenPadding,
  },
  sectionHeader: {
    paddingVertical: theme.spacing.xxl,
  },
  sectionTitle: {
    fontSize: theme.fonts.sizes.xxxl,
    fontWeight: theme.fonts.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  sectionSubtitle: {
    fontSize: theme.fonts.sizes.lg,
    color: theme.colors.textSecondary,
    fontWeight: theme.fonts.weights.regular,
  },
  listContainer: {
    paddingBottom: theme.spacing.xxl,
  },
  therapistCard: {
    marginBottom: theme.spacing.lg,
  },
  therapistHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.secondaryLight,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.xl,
  },
  onlineIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.secondary,
    marginRight: theme.spacing.xs,
  },
  statusText: {
    fontSize: theme.fonts.sizes.sm,
    color: theme.colors.secondary,
    fontWeight: theme.fonts.weights.semibold,
  },
  therapistInfo: {
    marginBottom: theme.spacing.lg,
  },
  therapistName: {
    fontSize: theme.fonts.sizes.xxl,
    fontWeight: theme.fonts.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  therapistSpecialization: {
    fontSize: theme.fonts.sizes.lg,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    fontWeight: theme.fonts.weights.medium,
  },
  therapistMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: theme.fonts.sizes.md,
    color: theme.colors.textSecondary,
    fontWeight: theme.fonts.weights.medium,
  },
  sessionText: {
    fontSize: theme.fonts.sizes.md,
    color: theme.colors.primary,
    fontWeight: theme.fonts.weights.semibold,
  },
  callButton: {
    marginTop: theme.spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xxxxl,
  },
  emptyAvatar: {
    marginBottom: theme.spacing.xxl,
  },
  emptyTitle: {
    fontSize: theme.fonts.sizes.display1,
    fontWeight: theme.fonts.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: theme.fonts.sizes.lg,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.xxxl,
    lineHeight: theme.fonts.lineHeights.relaxed * theme.fonts.sizes.lg,
    fontWeight: theme.fonts.weights.regular,
  },
  refreshButton: {
    marginTop: theme.spacing.lg,
  },
});

// Error fallback for UserDashboard
const UserDashboardErrorFallback = () => (
  <SafeAreaView style={styles.container}>
    <LoadingState
      type="network"
      text="Dashboard Error"
      subtext="Unable to load therapist list. Please try again."
    />
  </SafeAreaView>
);

export default React.memo(function WrappedUserDashboard(props) {
  return (
    <ErrorBoundary fallback={UserDashboardErrorFallback}>
      <UserDashboard {...props} />
    </ErrorBoundary>
  );
});
