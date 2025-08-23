import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';

const DRMPlayer = ({ fileId, onError }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [sessionToken, setSessionToken] = useState(null);
  const [drmStatus, setDrmStatus] = useState(null);
  const [error, setError] = useState(null);
  
  const audioRef = useRef(null);
  const { token } = useAuth();
  
  // Initialize DRM session and setup chunked streaming
  useEffect(() => {
    const initializeDRM = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        console.log('🔐 Initializing DRM session for file ID:', fileId);
        
        // Get DRM status
        const statusResponse = await api.get(`/drm/status/${fileId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('📊 DRM status response:', statusResponse.data);
        setDrmStatus({
          ...statusResponse.data.data,
          chunkedStreaming: true
        });
        
        // Generate secure session
        const sessionResponse = await api.post(`/drm/session/${fileId}`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('✅ DRM session response:', sessionResponse.data);
        
        setSessionToken(sessionResponse.data.data.sessionToken);
        setDuration(sessionResponse.data.data.duration || 0);
        console.log('🎵 Session token set:', sessionResponse.data.data.sessionToken ? 'SUCCESS' : 'FAILED');
        console.log('⏱️ Duration set:', sessionResponse.data.data.duration || 0);
        
        // Setup chunked audio streaming for enhanced security
        if (audioRef.current) {
          setupChunkedAudioStreaming(sessionResponse.data.data.sessionToken);
        }
        
      } catch (error) {
        console.error('❌ DRM initialization failed:', error);
        console.error('❌ Error details:', error.response?.data || error.message);
        setError(`Failed to initialize secure playback: ${error.response?.data?.message || error.message}`);
        if (onError) onError(error);
      } finally {
        setIsLoading(false);
      }
    };
    
    if (fileId && token) {
      initializeDRM();
    }
  }, [fileId, token, onError]);

  // Setup DRM audio streaming
  const setupChunkedAudioStreaming = async (sessionToken) => {
    try {
      // Use the DRM streaming endpoint with full backend URL
      const streamUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api/v1'}/drm/stream/${sessionToken}`;
      console.log('🎵 Setting audio source URL:', streamUrl);
      audioRef.current.src = streamUrl;
      audioRef.current.crossOrigin = 'use-credentials';
      
      // Setup event listeners for the audio element
      audioRef.current.addEventListener('loadedmetadata', () => {
        setDuration(audioRef.current.duration || 0);
      });
      
      audioRef.current.addEventListener('timeupdate', () => {
        setCurrentTime(audioRef.current.currentTime || 0);
      });
      
      audioRef.current.addEventListener('ended', () => {
        setIsPlaying(false);
      });
      
    } catch (error) {
      console.error('DRM streaming setup failed:', error);
      setError('Failed to setup secure audio streaming');
    }
  };

  // Setup audio element when session token is available
  useEffect(() => {
    if (sessionToken && audioRef.current) {
      const audio = audioRef.current;
      
      // Disable context menu to prevent download attempts
      audio.oncontextmenu = (e) => e.preventDefault();
      
      // Security event listeners
      const handleSecurityViolation = (e) => {
        console.warn('Security violation detected:', e.type);
        e.preventDefault();
        return false;
      };
      
      // Prevent various download/save attempts
      audio.addEventListener('contextmenu', handleSecurityViolation);
      audio.addEventListener('dragstart', handleSecurityViolation);
      audio.addEventListener('selectstart', handleSecurityViolation);
      
      // Audio event listeners
      const handleLoadedMetadata = () => {
        setDuration(audio.duration || 0);
      };
      
      const handleTimeUpdate = () => {
        setCurrentTime(audio.currentTime);
      };
      
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };
      
      const handleError = (e) => {
        console.error('Audio playback error:', e);
        setError('Playback error occurred');
        setIsPlaying(false);
      };
      
      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('play', handlePlay);
      audio.addEventListener('pause', handlePause);
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('error', handleError);
      

      
      return () => {
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('play', handlePlay);
        audio.removeEventListener('pause', handlePause);
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('error', handleError);
        audio.removeEventListener('contextmenu', handleSecurityViolation);
        audio.removeEventListener('dragstart', handleSecurityViolation);
        audio.removeEventListener('selectstart', handleSecurityViolation);
      };
    }
  }, [sessionToken]);
  
  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(e => {
          console.error('Play failed:', e);
          setError('Playback failed');
        });
      }
    }
  };
  
  const handleSeek = (e) => {
    if (audioRef.current && duration > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      const newTime = percent * duration;
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };
  
  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };
  
  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  
  if (isLoading) {
    return (
      <div style={{
        background: '#f8f9fa',
        border: '1px solid #dee2e6',
        borderRadius: '8px',
        padding: '20px',
        margin: '10px 0',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '40px',
          fontSize: '16px'
        }}>🔒 Initializing secure playback...</div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div style={{
        background: '#f8f9fa',
        border: '1px solid #dee2e6',
        borderRadius: '8px',
        padding: '20px',
        margin: '10px 0',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '40px',
          fontSize: '16px',
          color: '#dc3545'
        }}>🚫 {error}</div>
      </div>
    );
  }
  
  return (
    <div style={{ 
      userSelect: 'none',
      background: '#f8f9fa',
      border: '1px solid #dee2e6',
      borderRadius: '8px',
      padding: '20px',
      margin: '10px 0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        preload="none"
        controlsList="nodownload nofullscreen noremoteplayback"
        disablePictureInPicture
        style={{ display: 'none' }}
      />
      
      {/* DRM Status Indicator */}
      {drmStatus && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '15px',
          padding: '8px 12px',
          background: '#e8f5e8',
          border: '1px solid #c3e6c3',
          borderRadius: '4px'
        }}>
          <span style={{ fontWeight: 'bold', color: '#155724' }}>🔒 DRM Protected</span>
          <span style={{ fontSize: '12px', color: '#155724' }}>High Security</span>
        </div>
      )}
      
      {/* Custom Player Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '15px'
      }}>
        <button 
          style={{
            background: sessionToken ? '#007bff' : '#6c757d',
            border: 'none',
            borderRadius: '50%',
            width: '50px',
            height: '50px',
            fontSize: '20px',
            cursor: sessionToken ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={togglePlayPause}
          disabled={!sessionToken}
        >
          {isPlaying ? '⏸️' : '▶️'}
        </button>
        
        <div style={{
          fontFamily: 'monospace',
          fontSize: '14px',
          minWidth: '100px'
        }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
        
        <div 
          className="progress-bar"
          onClick={handleSeek}
          style={{
            width: '100%',
            height: '6px',
            backgroundColor: '#ddd',
            borderRadius: '3px',
            cursor: 'pointer',
            margin: '0 10px'
          }}
        >
          <div 
            className="progress-fill"
            style={{
              width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%',
              height: '100%',
              backgroundColor: '#007bff',
              borderRadius: '3px',
              transition: 'width 0.1s ease'
            }}
          />
        </div>
        
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px'
        }}>
          <span>🔊</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={handleVolumeChange}
            style={{ width: '80px' }}
          />
        </div>
      </div>
      
      {/* Security Notice */}
      <div style={{ 
        fontSize: '12px', 
        color: '#666', 
        marginTop: '10px',
        textAlign: 'center'
      }}>
        🛡️ This content is protected by DRM. Downloading or copying is prohibited.
      </div>

    </div>
  );
};

export default DRMPlayer;