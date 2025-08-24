import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';

const DRMPlayer = forwardRef(({ fileId, onError }, ref) => {
  
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [sessionToken, setSessionToken] = useState(null);
  const [drmStatus, setDrmStatus] = useState(null);
  const [error, setError] = useState(null);
  const [usingSignedUrl, setUsingSignedUrl] = useState(false);
  
  const audioRef = useRef(null);
  const { token, loading } = useAuth();
  
  // Initialize DRM only when needed for regular playback
  const initializeDRM = async () => {
    if (!fileId || !token) {
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      // Get DRM status
      const statusResponse = await api.get(`/drm/status/${fileId}`);
      setDrmStatus({
        ...statusResponse.data.data,
        chunkedStreaming: true
      });
      
      // Generate secure session
      const sessionResponse = await api.post(`/drm/session/${fileId}`, {});
      
      setSessionToken(sessionResponse.data.data.sessionToken);
      setDuration(sessionResponse.data.data.duration || 0);
      
    } catch (error) {
      
      let errorMessage = 'Failed to initialize secure playback';
      if (error.response?.status === 401) {
        errorMessage = 'Authentication required. Please log in again.';
      } else if (error.response?.status === 403) {
        errorMessage = 'Access denied. You do not have permission to access this file.';
      } else if (error.response?.status === 404) {
        errorMessage = 'Audio file not found.';
      } else {
        errorMessage = `Failed to initialize secure playback: ${error.response?.data?.message || error.message}`;
      }
      
      setError(errorMessage);
      if (onError) onError(error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Initialize DRM when component mounts with valid fileId and token
  useEffect(() => {
    if (fileId && token && !sessionToken && !usingSignedUrl) {
      initializeDRM();
    }
    
    // DRM Security: Disable developer tools and right-click
    const handleKeyDown = (e) => {
      // Disable F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
      if (e.key === 'F12' || 
          (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
          (e.ctrlKey && e.key === 'u')) {
        e.preventDefault();
        return false;
      }
    };
    
    const handleContextMenu = (e) => {
      e.preventDefault();
      return false;
    };
    
    const handleSelectStart = (e) => {
      e.preventDefault();
      return false;
    };
    
    const handleDragStart = (e) => {
      e.preventDefault();
      return false;
    };
    
    // Add event listeners
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('selectstart', handleSelectStart);
    document.addEventListener('dragstart', handleDragStart);
    
    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('selectstart', handleSelectStart);
      document.removeEventListener('dragstart', handleDragStart);
    };
  }, [fileId, token, loading, usingSignedUrl]);

  // Setup streaming when sessionToken and audioRef are both available
  useEffect(() => {
    if (sessionToken && audioRef.current && !usingSignedUrl) {
      setupAudioStreaming(sessionToken);
    }
  }, [sessionToken, usingSignedUrl]);

  // Setup DRM audio streaming
  const setupAudioStreaming = async (sessionToken) => {
    try {
      const streamUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api/v1'}/drm/stream/${sessionToken}`;
      const correctedStreamUrl = streamUrl.replace('/api/v1/api/v1', '/api/v1');
      
      if (audioRef.current) {
        audioRef.current.src = correctedStreamUrl;
        audioRef.current.crossOrigin = 'use-credentials';
        audioRef.current.load();
        
        // Add error handling for audio loading
        audioRef.current.addEventListener('error', (e) => {
          if (audioRef.current.error) {
            const errorCode = audioRef.current.error.code;
            const errorMessages = {
              1: 'MEDIA_ERR_ABORTED - The user aborted the loading process',
              2: 'MEDIA_ERR_NETWORK - A network error occurred while loading',
              3: 'MEDIA_ERR_DECODE - An error occurred while decoding the media',
              4: 'MEDIA_ERR_SRC_NOT_SUPPORTED - The media format is not supported'
            };
          }
          setError(`Audio loading failed: ${audioRef.current.error?.message || 'Unknown error'}`);
        });
        
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
      }
      
    } catch (error) {
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
  
  const togglePlayPause = async () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        if (!sessionToken && !usingSignedUrl) {
          await initializeDRM();
        }
        
        audioRef.current.play().catch(e => {
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

  // Seek using signed URL for more accurate timestamp-based streaming
  const seekToWithSignedUrl = async (timeInSeconds) => {
    try {
      setUsingSignedUrl(true);
      
      const response = await api.post(`/drm/signed-url/${fileId}`, {
        startTime: timeInSeconds,
        endTime: -1,
        expiresIn: 30 * 60 * 1000
      });
      
      const { signedUrl } = response.data.data;
      
      if (audioRef.current) {
        audioRef.current.src = signedUrl;
        audioRef.current.load();
        
        const handleCanPlay = () => {
          audioRef.current.currentTime = 0;
          setCurrentTime(timeInSeconds);
          
          audioRef.current.play().then(() => {
            setIsPlaying(true);
          }).catch(err => {
            // Playback failed
          });
          
          audioRef.current.removeEventListener('canplay', handleCanPlay);
        };
        
        audioRef.current.addEventListener('canplay', handleCanPlay);
      }
    } catch (error) {
      setUsingSignedUrl(false);
      seekToRegular(timeInSeconds);
    }
  };
  
  // Regular seeking method (fallback)
  const seekToRegular = async (timeInSeconds) => {
    if (!sessionToken) {
      setUsingSignedUrl(false);
      await initializeDRM();
      return;
    }
    
    const actualDuration = duration || (audioRef.current ? audioRef.current.duration : 0);
    
    if (audioRef.current && actualDuration > 0) {
      const clampedTime = Math.max(0, Math.min(timeInSeconds, actualDuration));
      
      if (audioRef.current.readyState >= 2) {
        audioRef.current.currentTime = clampedTime;
        setCurrentTime(clampedTime);
        
        if (audioRef.current.paused) {
          audioRef.current.play().then(() => {
            setIsPlaying(true);
          }).catch(err => {
            // Playback failed
          });
        }
      } else {
        const handleLoadedData = () => {
          audioRef.current.currentTime = clampedTime;
          setCurrentTime(clampedTime);
          
          if (audioRef.current.paused) {
            audioRef.current.play().then(() => {
              setIsPlaying(true);
            }).catch(err => {
              // Playback failed
            });
          }
          
          audioRef.current.removeEventListener('loadeddata', handleLoadedData);
        };
        audioRef.current.addEventListener('loadeddata', handleLoadedData);
      }
    }
  };

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    seekTo: (timeInSeconds) => {
      seekToWithSignedUrl(timeInSeconds);
    },
    seekToRegular: seekToRegular,
    getCurrentTime: () => currentTime,
    getDuration: () => duration,
    isPlaying: () => isPlaying
  }), [currentTime, duration, isPlaying]);
  
  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };
  
  const formatTime = (time) => {
    if (!time || time < 0) return '0:00';
    
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
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
    <div 
       onContextMenu={(e) => e.preventDefault()}
       onDragStart={(e) => e.preventDefault()}
       onCopy={(e) => e.preventDefault()}
      style={{ 
        userSelect: 'none',
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none',
        WebkitTouchCallout: 'none',
        WebkitUserDrag: 'none',
        KhtmlUserSelect: 'none',
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
        preload="metadata"
        controlsList="nodownload nofullscreen noremoteplayback"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
         onDragStart={(e) => e.preventDefault()}
        style={{ 
          display: 'none',
          userSelect: 'none',
          pointerEvents: 'none'
        }}
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
});

export default DRMPlayer;