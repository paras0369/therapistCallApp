# Speaker Phone Setup

The speaker button is currently implemented with visual feedback only. To enable full speaker phone functionality, you need to install and configure `react-native-incall-manager`.

## Installation

```bash
npm install react-native-incall-manager
```

## iOS Setup
Add to `ios/Podfile`:
```ruby
pod 'RNINCALLMANAGER', :path => '../node_modules/react-native-incall-manager'
```

Then run:
```bash
cd ios && pod install
```

## Android Setup
The package should auto-link for Android.

## Usage
In `CallScreen.js`, replace the `toggleSpeaker` function with:

```javascript
import InCallManager from 'react-native-incall-manager';

const toggleSpeaker = () => {
  InCallManager.setSpeakerphoneOn(!isSpeakerOn);
  setIsSpeakerOn(!isSpeakerOn);
};

// Also add this in useEffect for proper audio routing:
useEffect(() => {
  InCallManager.start({ media: 'audio' });
  
  return () => {
    InCallManager.stop();
  };
}, []);
```

## Permissions
Ensure audio permissions are properly configured in both platforms as this package manages audio routing.