# Setup Instructions for Call Improvements

## 🔊 Speaker Functionality Installation

The speaker button requires `react-native-incall-manager` which has been added to package.json. Follow these steps:

### 1. Install Dependencies
```bash
cd /home/paras/new1/TherapistCallApp
npm install
```

### 2. iOS Setup (if building for iOS)
```bash
cd ios
pod install
cd ..
```

### 3. Android Setup
The package should auto-link for Android. No additional setup needed.

### 4. Rebuild the App
```bash
# For Android
npm run android

# For iOS  
npm run ios
```

## 🛠️ What's Fixed

### ✅ **Dialing Modal**
- User now sees a "Calling..." modal while waiting for therapist
- Can cancel call before therapist picks up
- Proper navigation flow: Confirm → Dialing → Call Screen (only after accept)

### ✅ **Better Disconnect Messages**
- Fixed "Connection lost" appearing for normal call ends
- Now shows proper messages:
  - "The therapist ended the call"
  - "You ended the call" 
  - "Therapist disconnected" / "User disconnected" (for network issues)
- Added 3-second timeout to distinguish between normal ends and actual connection issues

### ✅ **Speaker Button**
- Functional speaker toggle with `react-native-incall-manager`
- Visual feedback (blue when ON, grey when OFF)
- Audio routing to speaker/earpiece
- Proper audio session management

## 🧪 Testing

1. **Test Dialing Modal**: Start a call and verify the modal appears
2. **Test Speaker**: Toggle speaker during call and verify audio routes correctly
3. **Test End Messages**: Have therapist/user end calls and verify correct messages
4. **Test Network Issues**: Simulate network disconnect to verify "Connection lost" only appears for real issues

## 📱 Permissions

Ensure these permissions are enabled in device settings:
- Microphone access
- Audio settings modification

The app will request these automatically when needed.

## 🐛 Troubleshooting

If speaker doesn't work:
1. Check device audio routing in system settings
2. Verify microphone permissions are granted
3. Try toggling airplane mode and reconnecting
4. Check console logs for InCallManager errors

If still getting "Connection lost":
1. Check backend server is running
2. Verify network connectivity
3. Check socket connection in logs