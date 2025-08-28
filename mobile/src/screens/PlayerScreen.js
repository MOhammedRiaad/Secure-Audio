import React, { useState, useEffect } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { useAudio } from '../contexts/AudioContext';
import { apiService } from '../services/apiService';
import { drmService } from '../services/drmService';

export default function PlayerScreen() {
  const navigation = useNavigation();
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
  const [manualChapterSelection, setManualChapterSelection] = useState(false);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (currentTrack) {
      setAudioLoaded(false);
      initializeSecurePlayback();
      loadChapters();
      setManualChapterSelection(false); // Reset manual selection for new tracks
      
      // Auto-load the full audio file when player screen opens
      loadFullAudioFile();
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

  // Auto-load the full audio file for playback
  const loadFullAudioFile = async () => {
    if (!currentTrack || currentTrack.isChapter) return;
    
    try {
      console.log('📼 Auto-loading full audio file:', currentTrack.title);
      
      // Load the full audio track through Audio Context
      await loadSecureTrack(currentTrack, {
        autoPlay: false, // Don't auto-play, just load
        onLoadStart: () => {
          console.log('🔄 Starting to load full audio file');
        },
        onLoadComplete: (success) => {
          if (success) {
            console.log('✅ Full audio file loaded successfully');
            setAudioLoaded(true);
          } else {
            console.error('❌ Full audio file loading failed');
            setAudioLoaded(false);
          }
        }
      });
      
    } catch (error) {
      console.error('Error loading full audio file:', error);
      setAudioLoaded(false);
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
      setCurrentChapter(chapter); // Set active chapter immediately for UI feedback
      setManualChapterSelection(true); // Mark as manual selection
      
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
      
      // Load chapter stream through Audio Context with auto-play enabled
      await loadSecureTrack({
        ...currentTrack,
        isChapter: true,
        chapterData: {
          id: chapter.id,
          label: chapter.label,
          streamUrl
        }
      }, {
        autoPlay: true, // Automatically start playing after loading
        onLoadStart: () => {
          console.log('🔄 Starting to load chapter:', chapter.label);
        },
        onLoadComplete: (success) => {
          if (success) {
            console.log('✅ Chapter loaded and playing:', chapter.label);
            setAudioLoaded(true); // Enable controls when chapter loads successfully
          } else {
            console.error('❌ Chapter loading failed:', chapter.label);
            setCurrentChapter(null); // Reset active chapter on error
            setManualChapterSelection(false);
            setAudioLoaded(false);
          }
        }
      });
      
    } catch (error) {
      console.error('Error playing chapter:', error);
      Alert.alert('Chapter Error', `Failed to play chapter: ${error.response?.data?.message || error.message}`);
      setCurrentChapter(null); // Reset active chapter on error
      setManualChapterSelection(false);
    } finally {
      setLoadingChapter(null);
    }
  };

  const updateCurrentChapter = () => {
    // Only update current chapter if not playing a specific chapter AND not manually selected
    if (currentTrack?.isChapter || manualChapterSelection) return;
    
    const positionSeconds = position / 1000;
    const chapter = chapters.find((ch, index) => {
      const nextChapter = chapters[index + 1];
      return positionSeconds >= ch.startTime && 
             (!nextChapter || positionSeconds < nextChapter.startTime);
    });
    
    // Only update if chapter actually changed to avoid unnecessary re-renders
    if (chapter?.id !== currentChapter?.id) {
      setCurrentChapter(chapter);
    }
  };

  // Fix chapter timing display to handle both seconds and milliseconds correctly
  const formatTime = (milliseconds) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatChapterTime = (timeValue, fallbackDuration = 0) => {
    // Handle chapter times that might be in seconds or milliseconds
    let timeInMs;
    if (timeValue > 9999) {
      // Likely already in milliseconds
      timeInMs = timeValue;
    } else {
      // Likely in seconds, convert to milliseconds
      timeInMs = timeValue * 1000;
    }
    
    // For end time, use fallback if not provided
    if (!timeValue && fallbackDuration) {
      timeInMs = fallbackDuration;
    }
    
    return formatTime(timeInMs);
  };

  // Helper function to determine if controls should be enabled
  const areControlsEnabled = () => {
    // If loading, controls are disabled
    if (isLoading) return false;
    
    // If it's a chapter, controls are enabled once the chapter loads
    if (currentTrack?.isChapter) return true;
    
    // For regular tracks, controls are enabled once audioLoaded is true
    return audioLoaded;
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

  const handleStop = async () => {
    await stop();
    setAudioLoaded(false);
    setManualChapterSelection(false);
    setCurrentChapter(null);
  };

  const handleBackToDashboard = () => {
    // Navigate to Dashboard tab
    navigation.navigate('Dashboard');
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
    const isCurrentChapterPlaying = currentTrack?.isChapter && currentTrack?.chapterData?.id === chapter.id;
    
    return (
      <TouchableOpacity
        key={chapter.id}
        style={[
          styles.chapterItem, 
          (isActive || isCurrentChapterPlaying) && styles.activeChapter,
          !isReady && styles.disabledChapter,
          isLoading && styles.loadingChapter
        ]}
        onPress={() => (isReady && !isLoading) ? jumpToChapter(chapter) : null}
        disabled={!isReady || isLoading}
        activeOpacity={0.7}
      >
        <View style={styles.chapterContent}>
          <View style={styles.chapterHeader}>
            <Text style={[styles.chapterTitle, (isActive || isCurrentChapterPlaying) && styles.activeChapterText]}>
              {chapter.label}
            </Text>
            {isCurrentChapterPlaying && (
              <View style={styles.playingIndicator}>
                <Text style={styles.playingText}>PLAYING</Text>
              </View>
            )}
          </View>
          <Text style={[styles.chapterTime, (isActive || isCurrentChapterPlaying) && styles.activeChapterText]}>
            {formatChapterTime(chapter.startTime)} - {formatChapterTime(chapter.endTime, duration)}
          </Text>
          <Text style={[styles.chapterStatus, (isActive || isCurrentChapterPlaying) && styles.activeChapterText]}>
            {isReady ? 'Ready' : 'Processing'}
          </Text>
        </View>
        <View style={styles.chapterAction}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={(isActive || isCurrentChapterPlaying) ? "#fff" : "#007AFF"} />
              <Text style={[styles.loadingText, (isActive || isCurrentChapterPlaying) && styles.activeChapterText]}>Loading...</Text>
            </View>
          ) : (
            <Ionicons 
              name={isReady ? (isCurrentChapterPlaying ? "pause" : "play") : "time"} 
              size={20} 
              color={(isActive || isCurrentChapterPlaying) ? "#fff" : (isReady ? "#007AFF" : "#ccc")} 
            />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (!currentTrack) {
    return (
      <View style={styles.emptyContainer}>
        {/* Back Button for Empty State */}
        <View style={styles.emptyHeader}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBackToDashboard}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color="#007AFF" />
            <Text style={styles.backButtonText}>Dashboard</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.emptyContent}>
          <Ionicons name="musical-notes-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>No audio selected</Text>
          <Text style={styles.emptySubtext}>Go to Dashboard to select an audio file</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        {/* Back Button for Error State */}
        <View style={styles.errorHeader}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBackToDashboard}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color="#007AFF" />
            <Text style={styles.backButtonText}>Dashboard</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.errorContent}>
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
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Back Button Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBackToDashboard}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
          <Text style={styles.backButtonText}>Dashboard</Text>
        </TouchableOpacity>
      </View>
      
      {/* Global Loading Overlay for Large Files */}
      {isLoading && (
        <View style={styles.globalLoadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingTitle}>
              {loadingChapter ? 'Loading Chapter...' : 'Loading Audio...'}
            </Text>
            <Text style={styles.loadingSubtitle}>
              {loadingChapter ? 
                `Preparing ${chapters.find(c => c.id === loadingChapter)?.label || 'chapter'} for playback` :
                'Setting up secure stream'
              }
            </Text>
            {currentTrack?.isChapter && (
              <Text style={styles.loadingHint}>Large files may take a moment to load</Text>
            )}
          </View>
        </View>
      )}
      
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
        
        {/* Audio Loading Status */}
        {!audioLoaded && currentTrack && !currentTrack.isChapter && (
          <View style={styles.loadingStatus}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.loadingStatusText}>Loading audio file...</Text>
          </View>
        )}
        
        {/* Audio Ready Status */}
        {audioLoaded && !isPlaying && currentTrack && !currentTrack.isChapter && (
          <View style={styles.readyStatus}>
            <Ionicons name="checkmark-circle" size={16} color="#28a745" />
            <Text style={styles.readyStatusText}>Audio ready - Press play to start</Text>
          </View>
        )}
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
          disabled={!areControlsEnabled()}
        />
        <Text style={styles.timeText}>
          {formatTime(duration)}
        </Text>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={handleStop}
          disabled={!areControlsEnabled()}
        >
          <Ionicons name="stop" size={32} color={!areControlsEnabled() ? "#ccc" : "#666"} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.playButton, !areControlsEnabled() && styles.playButtonDisabled]}
          onPress={playPause}
          disabled={!areControlsEnabled()}
        >
          {isLoading ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <Ionicons 
              name={isPlaying ? "pause" : "play"} 
              size={48} 
              color={!areControlsEnabled() ? "#ccc" : "#fff"} 
            />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => {/* Add skip forward functionality */}}
          disabled={!areControlsEnabled()}
        >
          <Ionicons name="play-forward" size={32} color={!areControlsEnabled() ? "#ccc" : "#666"} />
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
    backgroundColor: '#f8f9fa',
    padding: 20,
  },
  emptyHeader: {
    marginBottom: 20,
    paddingTop: 10,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 20,
  },
  errorHeader: {
    marginBottom: 20,
    paddingTop: 10,
  },
  errorContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  loadingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#E3F2FD',
    borderRadius: 6,
  },
  loadingStatusText: {
    fontSize: 12,
    color: '#1976D2',
    marginLeft: 8,
    fontWeight: '500',
  },
  readyStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#E8F5E8',
    borderRadius: 6,
  },
  readyStatusText: {
    fontSize: 12,
    color: '#155724',
    marginLeft: 8,
    fontWeight: '500',
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
    borderWidth: 2,
    borderColor: 'transparent',
  },
  activeChapter: {
    backgroundColor: '#007AFF',
    borderColor: '#0051D0',
    transform: [{ scale: 1.02 }],
  },
  loadingChapter: {
    backgroundColor: '#E3F2FD',
    borderColor: '#90CAF9',
  },
  disabledChapter: {
    backgroundColor: '#f0f0f0',
    opacity: 0.6,
  },
  chapterContent: {
    flex: 1,
  },
  chapterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  chapterTitle: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  playingIndicator: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  playingText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 0.5,
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
  chapterAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 50,
  },
  loadingContainer: {
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 10,
    color: '#007AFF',
    marginTop: 4,
    fontWeight: '500',
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
  // Global Loading Overlay Styles
  globalLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingCard: {
    backgroundColor: '#fff',
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 250,
  },
  loadingTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    textAlign: 'center',
  },
  loadingSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  // Back Button Header Styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingTop: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
    marginLeft: 8,
  },
});
