import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Switch,
  FlatList,
  Alert,
  RefreshControl,
} from 'react-native';
import axios from 'axios';

// New imports
import { useAuth, useCall } from '../context';
import { Button, Card, Avatar, LoadingState, ErrorBoundary } from './common';
import theme from '../theme';

// Existing imports
import { API_ENDPOINTS } from '../config/api';
import AuthService from '../services/AuthService';

const TherapistDashboard = ({ navigation }) => {
  // Local state
  const [isAvailable, setIsAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [therapistProfile, setTherapistProfile] = useState(null);
  const [callHistory, setCallHistory] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [currentCallId, setCurrentCallId] = useState(null); // Track current call alert

  // Context hooks
  const { user, logout } = useAuth();
  const { incomingCall, acceptCall, rejectCall } = useCall();

  useEffect(() => {
    loadData();
  }, []);

  // Handle incoming calls
  useEffect(() => {
    if (incomingCall && incomingCall.callId !== currentCallId) {
      // Prevent multiple alerts for the same call
      if (currentCallId) {
        console.log('TherapistDashboard: Ignoring duplicate call alert for:', incomingCall.callId, 'Current:', currentCallId);
        return;
      }

      // New incoming call - show alert
      console.log('TherapistDashboard: Showing alert for call:', incomingCall.callId);
      setCurrentCallId(incomingCall.callId);
      
      // Use setTimeout to ensure state update is processed
      setTimeout(() => {
        Alert.alert(
          'Incoming Call',
          `Call from ${incomingCall.participantName}`,
          [
            { 
              text: 'Decline', 
              onPress: () => {
                console.log('TherapistDashboard: Declining call:', incomingCall.callId);
                handleRejectCall(incomingCall.callId);
                setCurrentCallId(null);
              }
            },
            { 
              text: 'Accept', 
              onPress: () => {
                console.log('TherapistDashboard: Accepting call:', incomingCall.callId);
                handleAcceptCall(incomingCall.callId);
                setCurrentCallId(null);
              }
            },
          ],
          { cancelable: false } // Prevents dismissing by tapping outside
        );
      }, 100);
    } else if (!incomingCall && currentCallId) {
      // Incoming call was cleared (cancelled) - reset tracking
      console.log('TherapistDashboard: Clearing call tracking for:', currentCallId);
      setCurrentCallId(null);
    }
  }, [incomingCall, currentCallId]);

  const handleAcceptCall = useCallback(async (callId) => {
    const result = await acceptCall(callId);
    if (result.success) {
      navigation.navigate('CallScreen');
    } else {
      Alert.alert('Error', result.error || 'Failed to accept call');
    }
  }, [acceptCall, navigation]);

  const handleRejectCall = useCallback((callId) => {
    rejectCall(callId);
  }, [rejectCall]);

  const loadData = useCallback(async () => {
    try {
      const token = await AuthService.getAuthToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [profileResponse, historyResponse] = await Promise.all([
        axios.get(API_ENDPOINTS.GET_THERAPIST_PROFILE, { headers }),
        axios.get(API_ENDPOINTS.GET_CALL_HISTORY, { headers }),
      ]);

      setTherapistProfile(profileResponse.data.therapist);
      setCallHistory(historyResponse.data.calls);
      setIsAvailable(profileResponse.data.therapist.isAvailable);
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

  const toggleAvailability = async (value) => {
    try {
      const token = await AuthService.getAuthToken();
      const headers = { Authorization: `Bearer ${token}` };

      await axios.patch(
        API_ENDPOINTS.UPDATE_THERAPIST_STATUS,
        { isAvailable: value },
        { headers }
      );

      setIsAvailable(value);
    } catch (error) {
      console.error('Error updating status:', error);
      Alert.alert('Error', 'Failed to update availability status');
    }
  };

  const handleLogout = useCallback(async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          onPress: async () => {
            await logout();
            navigation.replace('UserTypeSelection');
          },
        },
      ]
    );
  }, [logout, navigation]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const formatDuration = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const renderCallHistoryItem = useCallback(({ item }) => (
    <Card style={styles.callHistoryItem} shadow="sm">
      <View style={styles.callHeader}>
        <Avatar 
          size="md"
          emoji="👤"
          backgroundColor={theme.colors.primaryLight}
        />
        <View style={styles.callInfo}>
          <Text style={styles.callUser}>{item.userName}</Text>
          <Text style={styles.callDate}>{formatDate(item.startTime)}</Text>
        </View>
        <View style={styles.earningsBadge}>
          <Text style={styles.earningsAmount}>+{item.earnings}</Text>
          <Text style={styles.earningsLabel}>coins</Text>
        </View>
      </View>
      <View style={styles.callDetails}>
        <View style={styles.durationBadge}>
          <Text style={styles.durationIcon}>⏱️</Text>
          <Text style={styles.callDuration}>{formatDuration(item.duration)}</Text>
        </View>
      </View>
    </Card>
  ), []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingState 
          type="data" 
          text="Loading therapist dashboard..." 
          subtext="Fetching profile and call history"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.therapistInfo}>
            <Avatar 
              size="lg"
              emoji="👨‍⚕️"
              backgroundColor={theme.colors.primary}
            />
            <View style={styles.therapistTextInfo}>
              <Text style={styles.welcomeText}>Welcome back,</Text>
              <Text style={styles.therapistName}>{therapistProfile?.name || 'Doctor'}</Text>
            </View>
          </View>
          <Button
            title="Logout"
            variant="outline"
            size="small"
            onPress={handleLogout}
          />
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.statsRow}>
          <Card style={styles.earningsCard} shadow="md">
            <Text style={styles.cardIcon}>💰</Text>
            <View style={styles.cardContent}>
              <Text style={styles.cardAmount}>{therapistProfile?.totalEarnings || 0}</Text>
              <Text style={styles.cardLabel}>Total Earnings</Text>
            </View>
          </Card>
          
          <Card style={styles.statusCard} shadow="md">
            <View style={styles.statusHeader}>
              <Text style={styles.cardIcon}>🟢</Text>
              <Switch
                value={isAvailable}
                onValueChange={toggleAvailability}
                trackColor={{ false: theme.colors.disabled, true: theme.colors.primary }}
                thumbColor={theme.colors.white}
                style={styles.switch}
              />
            </View>
            <Text style={styles.statusLabel}>
              {isAvailable ? 'Available' : 'Offline'}
            </Text>
            <Text style={styles.statusSubtext}>
              {isAvailable ? 'Ready for calls' : 'Not accepting calls'}
            </Text>
          </Card>
        </View>

        <View style={styles.historySection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Call History</Text>
            <Text style={styles.sectionSubtitle}>Your latest therapy sessions</Text>
          </View>
          
          {callHistory.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Avatar 
                size="xxxxl"
                emoji="📞"
                backgroundColor={theme.colors.primaryLight}
                style={styles.emptyAvatar}
              />
              <Text style={styles.emptyTitle}>No Call History</Text>
              <Text style={styles.emptyText}>
                Your completed therapy sessions will appear here
              </Text>
            </View>
          ) : (
            <FlatList
              data={callHistory}
              renderItem={renderCallHistoryItem}
              keyExtractor={(item, index) => item._id?.toString() || `call-${index}`}
              refreshControl={
                <RefreshControl 
                  refreshing={refreshing} 
                  onRefresh={onRefresh}
                  tintColor={theme.colors.primary}
                  colors={[theme.colors.primary]}
                />
              }
              style={styles.callHistoryList}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
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
  },
  therapistInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  therapistTextInfo: {
    marginLeft: theme.spacing.md,
  },
  welcomeText: {
    fontSize: theme.fonts.sizes.lg,
    color: theme.colors.textSecondary,
    fontWeight: theme.fonts.weights.medium,
  },
  therapistName: {
    fontSize: theme.fonts.sizes.xxl,
    color: theme.colors.textPrimary,
    fontWeight: theme.fonts.weights.bold,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.screenPadding,
    paddingTop: theme.spacing.xxl,
  },
  statsRow: {
    flexDirection: 'row',
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.xxxl,
  },
  earningsCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  cardIcon: {
    fontSize: 32,
    marginRight: theme.spacing.lg,
  },
  cardContent: {
    flex: 1,
  },
  cardAmount: {
    fontSize: theme.fonts.sizes.xxxl,
    fontWeight: theme.fonts.weights.extrabold,
    color: theme.colors.primary,
    marginBottom: 2,
  },
  cardLabel: {
    fontSize: theme.fonts.sizes.md,
    color: theme.colors.textSecondary,
    fontWeight: theme.fonts.weights.medium,
  },
  statusCard: {
    flex: 1,
    padding: theme.spacing.xl,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  switch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2C2C2C',
    marginBottom: 4,
  },
  statusSubtext: {
    fontSize: 12,
    color: '#666666',
    fontWeight: '500',
  },
  historySection: {
    flex: 1,
  },
  sectionHeader: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2C2C2C',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 16,
    color: '#666666',
    fontWeight: '400',
  },
  callHistoryList: {
    flex: 1,
  },
  callHistoryItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  callHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  callUserAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF4F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  callUserAvatarText: {
    fontSize: 20,
  },
  callInfo: {
    flex: 1,
  },
  callUser: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2C2C2C',
    marginBottom: 2,
  },
  callDate: {
    fontSize: 12,
    color: '#666666',
    fontWeight: '500',
  },
  earningsBadge: {
    backgroundColor: '#E8F7ED',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  earningsAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4CAF50',
  },
  earningsLabel: {
    fontSize: 10,
    color: '#4CAF50',
    fontWeight: '500',
  },
  callDetails: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF4F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  durationIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  callDuration: {
    fontSize: 12,
    color: '#FF6B35',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 18,
    color: '#FF6B35',
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFF4F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyIconText: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2C2C2C',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '400',
  },
});

// Error fallback for TherapistDashboard
const TherapistDashboardErrorFallback = ({ error, onRetry }) => (
  <SafeAreaView style={styles.container}>
    <LoadingState 
      type="network" 
      text="Dashboard Error" 
      subtext="Unable to load therapist dashboard. Please try again."
    />
  </SafeAreaView>
);

export default React.memo(function WrappedTherapistDashboard(props) {
  return (
    <ErrorBoundary fallback={TherapistDashboardErrorFallback}>
      <TherapistDashboard {...props} />
    </ErrorBoundary>
  );
});