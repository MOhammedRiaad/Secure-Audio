import React, { createContext, useContext, useState, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import { drmService } from '../services/drmService';

// Conditionally import expo-av only for non-web platforms
let Audio = null;
if (Platform.OS !== 'web') {
  Audio = require('expo-av').Audio;
}

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
  const soundRef = useRef(null);

  const loadTrack = async (audioFile) => {
    try {
      setIsLoading(true);
      
      // Unload previous track
      if (soundRef.current) {
        if (Platform.OS === 'web') {
          soundRef.current.pause();
          soundRef.current.src = '';
        } else {
          await soundRef.current.unloadAsync();
        }
        drmService.terminateStream(currentTrack?.id);
      }

      if (Platform.OS === 'web') {
        // Web implementation using HTML5 Audio
        const audio = new Audio();
        audio.src = audioFile.url || audioFile.uri;
        audio.addEventListener('loadedmetadata', () => {
          setDuration(audio.duration * 1000); // Convert to milliseconds
        });
        audio.addEventListener('timeupdate', () => {
          setPosition(audio.currentTime * 1000); // Convert to milliseconds
        });
        audio.addEventListener('play', () => setIsPlaying(true));
        audio.addEventListener('pause', () => setIsPlaying(false));
        audio.addEventListener('ended', () => setIsPlaying(false));
        
        soundRef.current = audio;
        setCurrentTrack(audioFile);
      } else {
        // Native implementation using expo-av
        const streamData = await drmService.initializeSecurePlayback(audioFile.id);
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
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading track:', error);
      Alert.alert('Error', 'Failed to load audio stream');
      setIsLoading(false);
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
      if (Platform.OS === 'web') {
        if (isPlaying) {
          soundRef.current.pause();
        } else {
          await soundRef.current.play();
        }
      } else {
        if (isPlaying) {
          await soundRef.current.pauseAsync();
        } else {
          await soundRef.current.playAsync();
        }
      }
    } catch (error) {
      console.error('Error playing/pausing:', error);
    }
  };

  const seekTo = async (positionMillis) => {
    if (!soundRef.current || !currentTrack) return;

    try {
      const positionSeconds = positionMillis / 1000;
      
      if (Platform.OS === 'web') {
        // Web implementation using HTML5 Audio
        soundRef.current.currentTime = positionSeconds;
        setPosition(positionMillis);
      } else {
        // Native implementation with DRM
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
      }
    } catch (error) {
      console.error('Error seeking:', error);
      // Fallback to regular seeking for native
      if (Platform.OS !== 'web') {
        try {
          await soundRef.current.setPositionAsync(positionMillis);
        } catch (fallbackError) {
          console.error('Fallback seek also failed:', fallbackError);
        }
      }
    }
  };

  const stop = async () => {
    if (!soundRef.current) return;

    try {
      if (Platform.OS === 'web') {
        soundRef.current.pause();
        soundRef.current.currentTime = 0;
      } else {
        await soundRef.current.stopAsync();
      }
      setPosition(0);
      
      // Terminate DRM session
      if (currentTrack) {
        drmService.terminateStream(currentTrack.id);
      }
    } catch (error) {
      console.error('Error stopping:', error);
    }
  };

  const handleSecurityViolation = async (audioFileId) => {
    try {
      if (soundRef.current) {
        if (Platform.OS === 'web') {
          soundRef.current.pause();
          soundRef.current.src = '';
        } else {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
        }
        soundRef.current = null;
      }
      
      setCurrentTrack(null);
      setIsPlaying(false);
      setPosition(0);
      
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
    loadTrack,
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
