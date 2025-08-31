# Secure Audio Mobile App

A React Native mobile application for streaming DRM-protected audio content with advanced security features.

## Features

- **Secure Authentication**: User login with JWT tokens
- **DRM Protection**: Device fingerprinting and secure streaming
- **Audio Streaming**: High-quality audio playback with chapters
- **Real-time Security**: Continuous monitoring and violation detection
- **Cross-platform**: iOS and Android support via Expo

## Security Features

- Device fingerprinting for unique device identification
- Token-based secure streaming with expiration
- Real-time security monitoring during playback
- Automatic session termination on security violations
- No offline downloads - streaming only

## Prerequisites

- Node.js 16+ 
- Expo CLI (`npm install -g @expo/cli`)
- iOS Simulator or Android Emulator
- Running Secure Audio backend server

## Installation

1. Navigate to the mobile directory:
```bash
cd mobile
```

2. Install dependencies:
```bash
npm install
```

3. Update API configuration:
   - Edit `src/services/apiService.js`
   - Update `API_BASE_URL` to your backend server URL

## Running the App

### Development Mode

```bash
# Start Expo development server
npm start

# Run on iOS simulator (requires Xcode)
npm run ios

# Run on Android emulator (requires Android Studio)
npm run android
```

### Quick Start with Expo Go (Recommended)

1. Install Expo Go app on your mobile device:
   - **Android**: [Google Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)
   - **iOS**: [App Store](https://apps.apple.com/app/expo-go/id982107779)

2. Start the development server:
   ```bash
   npm start
   ```

3. Scan the QR code with:
   - **Android**: Expo Go app
   - **iOS**: Camera app (opens in Expo Go)

### Android Studio Setup (For Emulator)

If you want to use Android emulator instead of physical device:

1. **Install Android Studio**: Download from [developer.android.com](https://developer.android.com/studio)

2. **Set up Android SDK**:
   - Open Android Studio
   - Go to Tools → SDK Manager
   - Install Android SDK Platform-Tools

3. **Set Environment Variables**:
   ```bash
   # Add to your system PATH:
   ANDROID_HOME=C:\Users\%USERNAME%\AppData\Local\Android\Sdk
   PATH=%PATH%;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\tools
   ```

4. **Create Virtual Device**:
   - Open Android Studio
   - Tools → AVD Manager
   - Create Virtual Device

5. **Restart terminal** and run:
   ```bash
   npm run android
   ```

### Building for Production

```bash
# Build for iOS (requires Apple Developer account)
eas build --platform ios

# Build for Android
eas build --platform android

# Build for both platforms
eas build --platform all
```

**Note**: Modern Expo uses EAS Build instead of the deprecated `expo build` command.

## App Structure

```
src/
├── components/          # Reusable UI components
├── contexts/           # React contexts for state management
│   ├── AuthContext.js  # Authentication state
│   └── AudioContext.js # Audio playback state
├── screens/            # App screens
│   ├── LoginScreen.js  # User authentication
│   ├── DashboardScreen.js # Audio file listing
│   └── PlayerScreen.js # Audio player with controls
├── services/           # API and external services
│   ├── apiService.js   # Backend API integration
│   └── drmService.js   # DRM security management
└── utils/              # Utility functions
    └── deviceFingerprint.js # Device identification
```

## Usage

1. **Login**: Enter your credentials to authenticate
2. **Dashboard**: Browse available audio files
3. **Player**: Stream audio with chapter navigation and controls

## Security Notes

- Audio streams are encrypted and require valid authentication
- Device fingerprinting prevents unauthorized access
- Sessions expire automatically for security
- No audio content is stored locally
- Playback stops immediately on security violations

## API Integration

The app integrates with the Secure Audio backend API:

- `POST /api/auth/login` - User authentication
- `GET /api/audio-files` - List available audio files
- `POST /api/audio-files/:id/request-stream` - Request secure stream
- `POST /api/audio-files/:id/validate-stream` - Validate stream session
- `GET /api/audio-files/:id/secure-stream` - Secure audio streaming

## Troubleshooting

### Common Issues

1. **Audio won't play**: Check network connection and backend server status
2. **Security violations**: Restart the app if device fingerprint changes
3. **Login failures**: Verify credentials and server connectivity

### Debug Mode

Enable debug logging by setting `__DEV__` flag in development builds.

## License

Private - All rights reserved
