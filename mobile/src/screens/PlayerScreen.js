import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { useAudio } from '../contexts/AudioContext';
import { apiService } from '../services/apiService';
import { drmService } from '../services/drmService';

export default function PlayerScreen() {
  const {
    currentTrack,
    isPlaying,
    position,
    duration,
    isLoading,
    playPause,
    seekTo,
    stop,
    loadSecureTrack
  } = useAudio();

  const [chapters, setChapters] = useState([]);
  const [currentChapter, setCurrentChapter] = useState(null);
  const [seeking, setSeeking] = useState(false);
  const [tempPosition, setTempPosition] = useState(0);
  const [sessionToken, setSessionToken] = useState(null);
  const [drmStatus, setDrmStatus] = useState(null);
  const [loadingChapter, setLoadingChapter] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (currentTrack) {
      initializeSecurePlayback();
      loadChapters();
    }
  }, [currentTrack]);

  useEffect(() => {
    if (chapters.length > 0 && position > 0) {
      updateCurrentChapter();
    }
  }, [position, chapters]);

  // Initialize secure DRM session like web client
  const initializeSecurePlayback = async () => {
    if (!currentTrack) return;
    
    try {
      setError(null);
      
      // Get DRM status
      const statusResponse = await apiService.getDRMStatus(currentTrack.id);
      setDrmStatus(statusResponse.data);
      
      // Generate secure session like web client
      const sessionResponse = await apiService.createDRMSession(currentTrack.id);
      const sessionData = sessionResponse.data || sessionResponse;
      
      setSessionToken(sessionData.sessionToken);
      
      console.log('🔐 DRM session initialized:', {
        fileId: currentTrack.id,
        sessionToken: sessionData.sessionToken.substring(0, 20) + '...',
        duration: sessionData.duration
      });
      
    } catch (error) {
      console.error('🚨 DRM initialization failed:', error);
      let errorMessage = 'Failed to initialize secure playback';
      
      if (error.response?.status === 401) {
        errorMessage = 'Authentication required. Please log in again.';
      } else if (error.response?.status === 403) {
        errorMessage = 'Access denied. You do not have permission to access this file.';
      } else if (error.response?.status === 404) {
        errorMessage = 'Audio file not found.';
      }
      
      setError(errorMessage);
      Alert.alert('Secure Playback Error', errorMessage);
    }
  };

  const loadChapters = async () => {
    if (!currentTrack) return;
    
    try {
      const response = await apiService.getChapters(currentTrack.id);
      const chaptersData = response.data || response;
      setChapters(chaptersData);
    } catch (error) {
      console.error('Error loading chapters:', error);
    }
  };

  const playChapter = async (chapter) => {
    try {
      if (!currentTrack) return;
      
      setLoadingChapter(chapter.id);
      
      // Generate secure signed URL for chapter streaming like web client
      const response = await apiService.generateChapterStreamUrl(currentTrack.id, chapter.id, {
        expiresIn: 30 * 60 * 1000 // 30 minutes
      });
      
      const { streamUrl } = response.data;
      
      console.log('📺 Playing chapter with secure URL:', {
        chapterId: chapter.id,
        label: chapter.label,
        hasStreamUrl: !!streamUrl
      });
      
      // Load chapter stream through Audio Context
      await loadSecureTrack({
        ...currentTrack,
        isChapter: true,
        chapterData: {
          id: chapter.id,
          label: chapter.label,
          streamUrl
        }
      });
      
    } catch (error) {
      console.error('Error playing chapter:', error);
      Alert.alert('Chapter Error', `Failed to play chapter: ${error.response?.data?.message || error.message}`);
    } finally {
      setLoadingChapter(null);
    }
  };

  const updateCurrentChapter = () => {
    const positionSeconds = position / 1000;
    const chapter = chapters.find((ch, index) => {
      const nextChapter = chapters[index + 1];
      return positionSeconds >= ch.startTime && 
             (!nextChapter || positionSeconds < nextChapter.startTime);
    });
    setCurrentChapter(chapter);
  };

  const formatTime = (milliseconds) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleSeekStart = () => {
    setSeeking(true);
    setTempPosition(position);
  };

  const handleSeekChange = (value) => {
    setTempPosition(value);
  };

  const handleSeekComplete = async (value) => {
    setSeeking(false);
    
    const timeInSeconds = value / 1000;
    
    // Use session-based seeking for better security
    if (sessionToken) {
      await seekToWithSession(timeInSeconds);
    } else {
      await seekTo(value);
    }
    
    // Save checkpoint
    if (currentTrack && !currentTrack.isChapter) {
      try {
        await apiService.saveCheckpoint(currentTrack.id, value);
      } catch (error) {
        console.error('Error saving checkpoint:', error);
      }
    }
  };

  const jumpToChapter = async (chapter) => {
    await playChapter(chapter);
  };

  const seekToWithSession = async (timeInSeconds) => {
    if (!sessionToken || !currentTrack) {
      console.warn('No session token available for seeking');
      return;
    }
    
    try {
      // Use signed URL for precise timestamp-based streaming like web client
      const response = await apiService.generateSignedUrl(currentTrack.id, {
        startTime: timeInSeconds,
        endTime: -1,
        expiresIn: 30 * 60 * 1000
      });
      
      const { signedUrl } = response.data;
      
      // Reload audio with new signed URL
      await loadSecureTrack({
        ...currentTrack,
        signedUrl,
        seekTime: timeInSeconds
      });
      
    } catch (error) {
      console.error('Error with signed URL seeking:', error);
      // Fallback to regular seeking
      await seekTo(timeInSeconds * 1000);
    }
  };

  const renderChapter = (chapter, index) => {
    const isActive = currentChapter?.id === chapter.id;
    const isLoading = loadingChapter === chapter.id;
    const isReady = chapter.status === 'ready';
    
    return (
      <TouchableOpacity
        key={chapter.id}
        style={[
          styles.chapterItem, 
          isActive && styles.activeChapter,
          !isReady && styles.disabledChapter
        ]}
        onPress={() => isReady && !isLoading ? jumpToChapter(chapter) : null}
        disabled={!isReady || isLoading}
      >
        <View style={styles.chapterContent}>
          <Text style={[styles.chapterTitle, isActive && styles.activeChapterText]}>
            {chapter.label}
          </Text>
          <Text style={[styles.chapterTime, isActive && styles.activeChapterText]}>
            {formatTime(chapter.startTime * 1000)} - {formatTime((chapter.endTime || duration / 1000) * 1000)}
          </Text>
          <Text style={[styles.chapterStatus, isActive && styles.activeChapterText]}>
            {isReady ? 'Ready' : 'Processing'}
          </Text>
        </View>
        {isLoading ? (
          <ActivityIndicator size="small" color={isActive ? "#fff" : "#007AFF"} />
        ) : (
          <Ionicons 
            name={isReady ? "play" : "time"} 
            size={20} 
            color={isActive ? "#fff" : (isReady ? "#007AFF" : "#ccc")} 
          />
        )}
      </TouchableOpacity>
    );
  };

  if (!currentTrack) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="musical-notes-outline" size={64} color="#ccc" />
        <Text style={styles.emptyText}>No audio selected</Text>
        <Text style={styles.emptySubtext}>Go to Dashboard to select an audio file</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="warning-outline" size={64} color="#ff4444" />
        <Text style={styles.errorText}>Security Error</Text>
        <Text style={styles.errorSubtext}>{error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            setError(null);
            if (currentTrack) {
              initializeSecurePlayback();
            }
          }}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Track Info */}
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={2}>
          {currentTrack.title}
        </Text>
        {currentTrack.isChapter && currentTrack.chapterData && (
          <Text style={styles.currentChapter}>
            Chapter: {currentTrack.chapterData.label}
          </Text>
        )}
        {currentChapter && !currentTrack.isChapter && (
          <Text style={styles.currentChapter}>
            Chapter: {currentChapter.label}
          </Text>
        )}
        
        {/* DRM Status Indicator */}
        {drmStatus && (
          <View style={styles.drmStatus}>
            <Ionicons name="shield-checkmark" size={16} color="#28a745" />
            <Text style={styles.drmStatusText}>DRM Protected</Text>
          </View>
        )}
        
        {/* Session Status */}
        <View style={styles.sessionStatus}>
          <View style={[styles.statusDot, sessionToken ? styles.statusActive : styles.statusInactive]} />
          <Text style={styles.sessionStatusText}>
            {sessionToken ? 'Secure Session Active' : 'Initializing Security...'}
          </Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <Text style={styles.timeText}>
          {formatTime(seeking ? tempPosition : position)}
        </Text>
        <Slider
          style={styles.progressSlider}
          minimumValue={0}
          maximumValue={duration}
          value={seeking ? tempPosition : position}
          onSlidingStart={handleSeekStart}
          onValueChange={handleSeekChange}
          onSlidingComplete={handleSeekComplete}
          minimumTrackTintColor="#007AFF"
          maximumTrackTintColor="#ddd"
          thumbStyle={styles.sliderThumb}
          disabled={isLoading}
        />
        <Text style={styles.timeText}>
          {formatTime(duration)}
        </Text>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={stop}
          disabled={isLoading}
        >
          <Ionicons name="stop" size={32} color={isLoading ? "#ccc" : "#666"} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.playButton, isLoading && styles.playButtonDisabled]}
          onPress={playPause}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <Ionicons 
              name={isPlaying ? "pause" : "play"} 
              size={48} 
              color="#fff" 
            />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => {/* Add skip forward functionality */}}
          disabled={isLoading}
        >
          <Ionicons name="play-forward" size={32} color={isLoading ? "#ccc" : "#666"} />
        </TouchableOpacity>
      </View>

      {/* Chapters */}
      {chapters.length > 0 && (
        <View style={styles.chaptersContainer}>
          <Text style={styles.chaptersTitle}>Chapters ({chapters.length})</Text>
          <View style={styles.chaptersList}>
            {chapters.map(renderChapter)}
          </View>
        </View>
      )}
      
      {chapters.length === 0 && currentTrack && (
        <View style={styles.noChaptersContainer}>
          <Text style={styles.noChaptersText}>No chapters available for this audio file.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ff4444',
    marginTop: 16,
    textAlign: 'center',
  },
  errorSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 16,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  trackInfo: {
    alignItems: 'center',
    marginBottom: 30,
  },
  trackTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  currentChapter: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
    marginBottom: 12,
  },
  drmStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 8,
  },
  drmStatusText: {
    fontSize: 12,
    color: '#155724',
    fontWeight: '600',
    marginLeft: 4,
  },
  sessionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusActive: {
    backgroundColor: '#28a745',
  },
  statusInactive: {
    backgroundColor: '#6c757d',
  },
  sessionStatusText: {
    fontSize: 12,
    color: '#666',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  timeText: {
    fontSize: 14,
    color: '#666',
    minWidth: 45,
  },
  progressSlider: {
    flex: 1,
    height: 40,
    marginHorizontal: 16,
  },
  sliderThumb: {
    backgroundColor: '#007AFF',
    width: 20,
    height: 20,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  controlButton: {
    padding: 16,
    marginHorizontal: 20,
  },
  playButton: {
    backgroundColor: '#007AFF',
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 20,
  },
  playButtonDisabled: {
    backgroundColor: '#ccc',
  },
  chaptersContainer: {
    flex: 1,
  },
  chaptersTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  chaptersList: {
    flex: 1,
  },
  chapterItem: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  activeChapter: {
    backgroundColor: '#007AFF',
  },
  disabledChapter: {
    backgroundColor: '#f0f0f0',
    opacity: 0.6,
  },
  chapterContent: {
    flex: 1,
  },
  chapterTitle: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    marginBottom: 4,
  },
  chapterTime: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  chapterStatus: {
    fontSize: 12,
    color: '#888',
  },
  activeChapterText: {
    color: '#fff',
  },
  noChaptersContainer: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  noChaptersText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
