import React, { createContext, useContext, useState, useRef } from 'react';
import { Audio } from 'expo-av';
import { Alert } from 'react-native';
import { drmService } from '../services/drmService';

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
        await soundRef.current.unloadAsync();
        drmService.terminateStream(currentTrack?.id);
      }

      // Initialize DRM protection
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
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading track:', error);
      Alert.alert('Error', 'Failed to load secure audio stream');
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
      console.error('Error seeking with signed URL:', error);
      // Fallback to regular seeking
      try {
        await soundRef.current.setPositionAsync(positionMillis);
      } catch (fallbackError) {
        console.error('Fallback seek also failed:', fallbackError);
      }
    }
  };

  const stop = async () => {
    if (!soundRef.current) return;

    try {
      await soundRef.current.stopAsync();
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
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
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
