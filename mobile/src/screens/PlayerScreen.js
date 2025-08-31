import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Slider from '@react-native-community/slider';
// Conditionally import @expo/vector-icons only for non-web platforms
let Ionicons;
if (Platform.OS !== 'web') {
  Ionicons = require('@expo/vector-icons').Ionicons;
}
import { useAudio } from '../contexts/AudioContext';
import { apiService } from '../services/apiService';

export default function PlayerScreen() {
  const {
    currentTrack,
    isPlaying,
    position,
    duration,
    isLoading,
    playPause,
    seekTo,
    stop
  } = useAudio();

  const [chapters, setChapters] = useState([]);
  const [currentChapter, setCurrentChapter] = useState(null);
  const [seeking, setSeeking] = useState(false);
  const [tempPosition, setTempPosition] = useState(0);

  const renderIcon = (iconName, size, color) => {
    if (Platform.OS === 'web') {
      const iconMap = {
        'musical-notes-outline': '🎵',
        'stop': '⏹️',
        'play': '▶️',
        'pause': '⏸️',
        'play-forward': '⏭️'
      };
      return <Text style={{ fontSize: size, color }}>{iconMap[iconName] || '•'}</Text>;
    } else {
      return <Ionicons name={iconName} size={size} color={color} />;
    }
  };

  useEffect(() => {
    if (currentTrack) {
      loadChapters();
    }
  }, [currentTrack]);

  useEffect(() => {
    if (chapters.length > 0 && position > 0) {
      updateCurrentChapter();
    }
  }, [position, chapters]);

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
      if (currentTrack) {
        // Use signed URL for chapter seeking with precise timestamp
        const chapterStartMs = chapter.startTime * 1000;
        await seekTo(chapterStartMs);
        if (!isPlaying) {
          await playPause();
        }
      }
    } catch (error) {
      console.error('Error playing chapter:', error);
      Alert.alert('Error', 'Failed to play chapter');
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
    await seekTo(value);
    
    // Save checkpoint
    if (currentTrack) {
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

  const renderChapter = (chapter, index) => {
    const isActive = currentChapter?.id === chapter.id;
    
    return (
      <TouchableOpacity
        key={chapter.id}
        style={[styles.chapterItem, isActive && styles.activeChapter]}
        onPress={() => jumpToChapter(chapter)}
      >
        <Text style={[styles.chapterTitle, isActive && styles.activeChapterText]}>
          {chapter.title}
        </Text>
        <Text style={[styles.chapterTime, isActive && styles.activeChapterText]}>
          {formatTime(chapter.startTime * 1000)}
        </Text>
      </TouchableOpacity>
    );
  };

  if (!currentTrack) {
    return (
      <View style={styles.emptyContainer}>
        {renderIcon("musical-notes-outline", 64, "#ccc")}
        <Text style={styles.emptyText}>No audio selected</Text>
        <Text style={styles.emptySubtext}>Go to Dashboard to select an audio file</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Track Info */}
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={2}>
          {currentTrack.title}
        </Text>
        {currentChapter && (
          <Text style={styles.currentChapter}>
            Chapter: {currentChapter.title}
          </Text>
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
          {renderIcon("stop", 32, isLoading ? "#ccc" : "#666")}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.playButton, isLoading && styles.playButtonDisabled]}
          onPress={playPause}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            renderIcon(isPlaying ? "pause" : "play", 48, "#fff")
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => {/* Add skip forward functionality */}}
          disabled={isLoading}
        >
          {renderIcon("play-forward", 32, isLoading ? "#ccc" : "#666")}
        </TouchableOpacity>
      </View>

      {/* Chapters */}
      {chapters.length > 0 && (
        <View style={styles.chaptersContainer}>
          <Text style={styles.chaptersTitle}>Chapters</Text>
          <View style={styles.chaptersList}>
            {chapters.map(renderChapter)}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
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
    marginBottom: 40,
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
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40,
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
    marginBottom: 40,
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
  },
  activeChapter: {
    backgroundColor: '#007AFF',
  },
  chapterTitle: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  chapterTime: {
    fontSize: 14,
    color: '#666',
  },
  activeChapterText: {
    color: '#fff',
  },
});
