import React, { createContext, useContext, useState, useRef } from 'react';
import { Audio } from 'expo-av';
import { Alert } from 'react-native';
import { drmService } from '../services/drmService';
import { apiService } from '../services/apiService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AudioContext = createContext();

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};

export const AudioProvider = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState(null);
  const soundRef = useRef(null);

  const loadTrack = async (audioFile) => {
    try {
      setIsLoading(true);
      
      // Unload previous track
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        if (currentTrack && !audioFile.isChapter) {
          drmService.terminateStream(currentTrack.id);
        }
      }

      // Initialize DRM protection and get session token
      const streamData = await drmService.initializeSecurePlayback(audioFile.id);
      setSessionToken(streamData.sessionToken);
      
      // Create secure audio source
      const secureSource = await drmService.createSecureAudioSource(audioFile.id, 0);

      const { sound } = await Audio.Sound.createAsync(
        secureSource,
        { shouldPlay: false },
        onPlaybackStatusUpdate
      );

      soundRef.current = sound;
      setCurrentTrack({
        ...audioFile,
        duration: streamData.duration || audioFile.duration
      });
      
      // Start security monitoring
      drmService.startSecurityMonitoring(audioFile.id);
      drmService.setSecurityViolationCallback(handleSecurityViolation);
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading track:', error);
      Alert.alert('Error', `Failed to load secure audio stream: ${error.response?.data?.message || error.message}`);
      setIsLoading(false);
    }
  };

  // New method to load secure tracks with session tokens or signed URLs
  const loadSecureTrack = async (audioData, options = {}) => {
    try {
      const { autoPlay = false, onLoadStart, onLoadComplete } = options;
      
      console.log('🔄 Loading secure track:', {
        isChapter: audioData.isChapter,
        hasChapterData: !!audioData.chapterData,
        hasSignedUrl: !!audioData.signedUrl,
        audioId: audioData.id,
        autoPlay
      });
      
      setIsLoading(true);
      onLoadStart?.();
      
      // Unload previous track
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        if (currentTrack && !audioData.isChapter) {
          drmService.terminateStream(currentTrack.id);
        }
      }

      let secureSource;
      
      if (audioData.isChapter && audioData.chapterData?.streamUrl) {
        // Use chapter stream URL directly
        const token = await AsyncStorage.getItem('authToken');
        
        if (!token) {
          throw new Error('No authentication token available for chapter streaming');
        }
        
        if (!audioData.chapterData.streamUrl) {
          throw new Error('Chapter stream URL is missing');
        }
        
        try {
          const fingerprint = await drmService.deviceFingerprint?.generateFingerprint?.();
          secureSource = {
            uri: audioData.chapterData.streamUrl,
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-Device-Fingerprint': fingerprint?.fingerprint || 'mobile-device'
            }
          };
        } catch (fingerprintError) {
          console.warn('⚠️ Device fingerprint generation failed:', fingerprintError);
          secureSource = {
            uri: audioData.chapterData.streamUrl,
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-Device-Fingerprint': 'mobile-device-fallback'
            }
          };
        }
        
        console.log('🎵 Loading chapter with secure URL:', {
          hasUrl: !!audioData.chapterData.streamUrl,
          url: audioData.chapterData.streamUrl.substring(0, 50) + '...'
        });
        
      } else if (audioData.signedUrl) {
        // Use provided signed URL
        const token = await AsyncStorage.getItem('authToken');
        
        if (!token) {
          throw new Error('No authentication token available for signed URL streaming');
        }
        
        if (!audioData.signedUrl) {
          throw new Error('Signed URL is missing');
        }
        
        try {
          const fingerprint = await drmService.deviceFingerprint?.generateFingerprint?.();
          secureSource = {
            uri: audioData.signedUrl,
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-Device-Fingerprint': fingerprint?.fingerprint || 'mobile-device'
            }
          };
        } catch (fingerprintError) {
          console.warn('⚠️ Device fingerprint generation failed:', fingerprintError);
          secureSource = {
            uri: audioData.signedUrl,
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-Device-Fingerprint': 'mobile-device-fallback'
            }
          };
        }
        
        console.log('🔗 Loading with signed URL for seeking:', {
          hasUrl: !!audioData.signedUrl,
          url: audioData.signedUrl.substring(0, 50) + '...'
        });
        
      } else {
        // Initialize DRM protection and get session token
        console.log('🔐 Initializing DRM session for regular track');
        
        try {
          const streamData = await drmService.initializeSecurePlayback(audioData.id);
          if (!streamData || !streamData.sessionToken) {
            throw new Error('Invalid DRM session data received');
          }
          
          setSessionToken(streamData.sessionToken);
          
          // Create secure audio source
          secureSource = await drmService.createSecureAudioSource(audioData.id, 0);
          
          if (!secureSource || !secureSource.uri) {
            throw new Error('Failed to create secure audio source from DRM service');
          }
          
          console.log('🔐 DRM session initialized successfully:', {
            hasSessionToken: !!streamData.sessionToken,
            hasSecureSource: !!secureSource.uri
          });
          
        } catch (drmError) {
          console.error('❌ DRM initialization failed:', drmError);
          throw new Error(`DRM initialization failed: ${drmError.message}`);
        }
        
        // Start security monitoring only for regular tracks (not chapters)
        if (!audioData.isChapter) {
          try {
            drmService.startSecurityMonitoring(audioData.id);
            if (typeof drmService.setSecurityViolationCallback === 'function') {
              drmService.setSecurityViolationCallback(handleSecurityViolation);
            } else {
              console.warn('⚠️ setSecurityViolationCallback is not available');
            }
          } catch (securityError) {
            console.warn('⚠️ Security monitoring setup failed:', securityError);
          }
        }
      }

      // Validate that we have a valid secure source
      if (!secureSource || !secureSource.uri) {
        throw new Error(`Invalid secure source: ${JSON.stringify(secureSource)}`);
      }

      console.log('🎧 Creating Audio.Sound with secure source:', {
        hasUri: !!secureSource.uri,
        hasHeaders: !!secureSource.headers,
        uri: secureSource.uri ? secureSource.uri.substring(0, 50) + '...' : 'none',
        autoPlay
      });
      
      const { sound } = await Audio.Sound.createAsync(
        secureSource,
        { 
          shouldPlay: autoPlay, // Use autoPlay option
          positionMillis: audioData.seekTime ? audioData.seekTime * 1000 : 0
        },
        onPlaybackStatusUpdate
      );

      soundRef.current = sound;
      setCurrentTrack(audioData);
      
      // Update position if seeking
      if (audioData.seekTime) {
        setPosition(audioData.seekTime * 1000);
      }
      
      console.log('✅ Secure track loaded successfully', { autoPlay });
      setIsLoading(false);
      onLoadComplete?.(true);
      
    } catch (error) {
      console.error('❌ Error loading secure track:', error);
      Alert.alert('Error', `Failed to load secure audio: ${error.response?.data?.message || error.message}`);
      setIsLoading(false);
      onLoadComplete?.(false);
    }
  };

  const onPlaybackStatusUpdate = (status) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis || 0);
      setDuration(status.durationMillis || 0);
      setIsPlaying(status.isPlaying || false);
    }
  };

  const playPause = async () => {
    if (!soundRef.current) return;

    try {
      if (isPlaying) {
        await soundRef.current.pauseAsync();
      } else {
        await soundRef.current.playAsync();
      }
    } catch (error) {
      console.error('Error playing/pausing:', error);
    }
  };

  const seekTo = async (positionMillis) => {
    if (!soundRef.current || !currentTrack) return;

    try {
      // For regular tracks, try direct seeking first
      if (!currentTrack.isChapter) {
        try {
          await soundRef.current.setPositionAsync(positionMillis);
          setPosition(positionMillis);
          return;
        } catch (seekError) {
          console.warn('Direct seeking failed, falling back to signed URL:', seekError);
        }
      }
      
      // Fallback or chapter seeking - use signed URL
      const positionSeconds = positionMillis / 1000;
      
      // Use signed URL for seeking to get precise timestamp-based streaming
      const signedSource = await drmService.createSignedAudioSource(
        currentTrack.id, 
        positionSeconds
      );
      
      // Load new signed URL source
      await soundRef.current.unloadAsync();
      const { sound } = await Audio.Sound.createAsync(
        signedSource,
        { shouldPlay: true, positionMillis: 0 }, // Start from beginning of signed stream
        onPlaybackStatusUpdate
      );
      
      soundRef.current = sound;
      setPosition(positionMillis);
    } catch (error) {
      console.error('Error seeking:', error);
    }
  };

  const stop = async () => {
    if (!soundRef.current) return;

    try {
      await soundRef.current.stopAsync();
      setPosition(0);
      
      // Terminate DRM session for regular tracks
      if (currentTrack && !currentTrack.isChapter) {
        drmService.terminateStream(currentTrack.id);
      }
      
      // Clear session token
      setSessionToken(null);
    } catch (error) {
      console.error('Error stopping:', error);
    }
  };

  const handleSecurityViolation = async (audioFileId) => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      
      setCurrentTrack(null);
      setIsPlaying(false);
      setPosition(0);
      setSessionToken(null);
      
      Alert.alert(
        'Security Alert',
        'Playback stopped due to security violation. Please restart the app.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error handling security violation:', error);
    }
  };

  const value = {
    currentTrack,
    isPlaying,
    position,
    duration,
    isLoading,
    sessionToken,
    loadTrack,
    loadSecureTrack,
    playPause,
    seekTo,
    stop
  };

  return (
    <AudioContext.Provider value={value}>
      {children}
    </AudioContext.Provider>
  );
};
