import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useAudio } from '../contexts/AudioContext';
import { apiService } from '../services/apiService';

export default function DashboardScreen({ navigation }) {
  const [audioFiles, setAudioFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { user, logout } = useAuth();
  const { loadTrack, currentTrack } = useAudio();

  useEffect(() => {
    loadAudioFiles();
  }, []);

  const loadAudioFiles = async () => {
    try {
      const response = await apiService.getAudioFiles();
      // Backend returns { success: true, data: [...] }
      const files = response.data || response;
      setAudioFiles(files);
    } catch (error) {
      console.error('Error loading audio files:', error);
      Alert.alert('Error', 'Failed to load audio files');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadAudioFiles();
  };

  const handlePlayAudio = async (audioFile) => {
    try {
      await loadTrack(audioFile);
      navigation.navigate('Player');
    } catch (error) {
      console.error('Error loading audio:', error);
      Alert.alert('Error', 'Failed to load secure audio file');
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderAudioItem = ({ item }) => (
    <TouchableOpacity 
      style={[
        styles.audioItem,
        currentTrack?.id === item.id && styles.activeAudioItem
      ]}
      onPress={() => handlePlayAudio(item)}
    >
      <View style={styles.audioInfo}>
        <Text style={styles.audioTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.audioMeta}>
          Duration: {formatDuration(item.duration)} • 
          {item.chapters?.length || 0} chapters
        </Text>
      </View>
      <View style={styles.playButton}>
        <Ionicons 
          name={currentTrack?.id === item.id ? "pause-circle" : "play-circle"} 
          size={32} 
          color="#007AFF" 
        />
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading audio files...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.welcomeText}>Welcome, {user?.name || user?.email}</Text>
        <TouchableOpacity onPress={logout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={24} color="#666" />
        </TouchableOpacity>
      </View>

      {audioFiles.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="musical-notes-outline" size={64} color="#ccc" />
          <Text style={styles.emptyStateText}>No audio files available</Text>
        </View>
      ) : (
        <FlatList
          data={audioFiles}
          renderItem={renderAudioItem}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={styles.listContainer}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  welcomeText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  logoutButton: {
    padding: 8,
  },
  listContainer: {
    padding: 16,
  },
  audioItem: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  activeAudioItem: {
    borderColor: '#007AFF',
    borderWidth: 2,
  },
  audioInfo: {
    flex: 1,
    marginRight: 12,
  },
  audioTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  audioMeta: {
    fontSize: 14,
    color: '#666',
  },
  playButton: {
    padding: 4,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
});
