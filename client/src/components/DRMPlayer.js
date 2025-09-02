import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import apiURL from '../apiURL';
const DRMPlayer = forwardRef(({ fileId, onError }, ref) => {
  
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [sessionToken, setSessionToken] = useState(null);
  const [drmStatus, setDrmStatus] = useState(null);
  const [error, setError] = useState(null);
  const [usingSignedUrl, setUsingSignedUrl] = useState(false);
  
  const audioRef = useRef(null);
  const { token, loading } = useAuth();
  
  // Initialize DRM only when needed for regular playback
  const initializeDRM = useCallback(async (retryCount = 0) => {
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
      console.error(`🚨 DRM initialization failed (attempt ${retryCount + 1}):`, error);
      
      let errorMessage = 'Failed to initialize secure playback';
      
      if (error.response?.status === 401) {
        errorMessage = 'Authentication required. Please log in again.';
      } else if (error.response?.status === 403) {
        errorMessage = 'Access denied. You do not have permission to access this file.';
      } else if (error.response?.status === 404) {
        errorMessage = 'Audio file not found.';
      } else if (error.response?.status >= 500) {
        // Server error - retry might help
        if (retryCount < 2) {
          setTimeout(() => {
            initializeDRM(retryCount + 1);
          }, 2000);
          return;
        }
        errorMessage = 'Server error. Please try again later.';
      } else {
        errorMessage = `Failed to initialize secure playback: ${error.response?.data?.message || error.message}`;
      }
      
      setError(errorMessage);
      if (onError) onError(error);
    } finally {
      setIsLoading(false);
    }
  }, [fileId, token, setIsLoading, setError, setDrmStatus, setSessionToken, setDuration, onError]);
  
  // Initialize DRM when component mounts with valid fileId and token
  useEffect(() => {
    if (fileId && token && !sessionToken && !usingSignedUrl) {
      initializeDRM();
    }
    
    // Enhanced DRM Security: Disable developer tools, right-click, and download attempts
    const handleKeyDown = (e) => {
      // Disable F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U, Ctrl+S
      if (e.key === 'F12' || 
          (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
          (e.ctrlKey && (e.key === 'u' || e.key === 'U' || e.key === 's' || e.key === 'S')) ||
          (e.ctrlKey && e.shiftKey && e.key === 'C') || // Disable Ctrl+Shift+C
          (e.key === 'F11') || // Disable fullscreen
          (e.ctrlKey && e.key === 'p') || // Disable print
          (e.ctrlKey && e.key === 'P')) {
        e.preventDefault();
        console.warn('DRM: Blocked security bypass attempt');
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
  }, [fileId, token, loading, usingSignedUrl, initializeDRM, sessionToken]);

  // Setup streaming when sessionToken and audioRef are both available
  useEffect(() => {
    if (sessionToken && audioRef.current && !usingSignedUrl) {
      setupAudioStreaming(sessionToken);
    }
  }, [sessionToken, usingSignedUrl]);

  // Setup DRM audio streaming
  const setupAudioStreaming = async (sessionToken) => {
    try {
      const streamUrl = `${apiURL}/drm/stream/${sessionToken}`;
      const correctedStreamUrl = streamUrl.replace('/api/v1/api/v1', '/api/v1');
      
      
      if (audioRef.current) {
        audioRef.current.src = correctedStreamUrl;
        audioRef.current.crossOrigin = 'use-credentials';
        audioRef.current.load();
        
        // Enhanced error handling for audio loading
        const handleAudioError = async (e) => {
          if (!audioRef.current) {
            console.error('🚨 Audio error: audioRef is null');
            setError('Audio player not available');
            return;
          }

          console.error('🚨 Audio loading error:', {
            error: audioRef.current.error,
            code: audioRef.current.error?.code,
            message: audioRef.current.error?.message,
            networkState: audioRef.current.networkState,
            readyState: audioRef.current.readyState
          });
          
          // Check if it's a network error that might indicate session expiry
          if (audioRef.current.error?.code === 4) { // MEDIA_ERR_SRC_NOT_SUPPORTED
            console.warn('⚠️ Possible DRM session expiry detected, attempting to reinitialize...');
            
            try {
              // Try to fetch from the stream URL to check the specific error
              const response = await fetch(correctedStreamUrl, {
                method: 'HEAD',
                credentials: 'include'
              });
              
              if (response.status === 403) {
                // Clear current session and reinitialize
                setSessionToken(null);
                setUsingSignedUrl(false);
                await initializeDRM();
                return;
              }
            } catch (fetchError) {
              console.error('Failed to check stream URL:', fetchError);
            }
          }
          
          setError(`Audio loading failed: ${audioRef.current.error?.message || 'Unknown error'}`);
        };
        
        audioRef.current.addEventListener('error', handleAudioError);
        
        // Setup event listeners for the audio element
        audioRef.current.addEventListener('loadedmetadata', () => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration || 0);
          }
        });
        
        audioRef.current.addEventListener('timeupdate', () => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime || 0);
          }
        });
        
        audioRef.current.addEventListener('ended', () => {
          setIsPlaying(false);
        });
        
        audioRef.current.addEventListener('canplay', () => {});
      }
      
    } catch (error) {
      console.error('🚨 Failed to setup secure audio streaming:', error);
      setError('Failed to setup secure audio streaming');
    }
  };

  // Setup audio element when session token is available
  useEffect(() => {
    if (sessionToken && audioRef.current) {
      const audio = audioRef.current;
      
      // Enhanced security for native controls
      enhanceNativePlayerSecurity();
      
      // Security event listeners
      const handleSecurityViolation = (e) => {
        console.warn('DRM Security: Violation detected -', e.type);
        e.preventDefault();
        e.stopPropagation();
        return false;
      };
      
      // Prevent various download/save attempts
      audio.addEventListener('contextmenu', handleSecurityViolation);
      audio.addEventListener('dragstart', handleSecurityViolation);
      audio.addEventListener('selectstart', handleSecurityViolation);
      audio.addEventListener('copy', handleSecurityViolation);
      
      // Audio event listeners
      const handleLoadedMetadata = () => {
        setDuration(audio.duration || 0);
      };
      
      const handleTimeUpdate = () => {
        if (audio && audio.currentTime !== undefined) {
          setCurrentTime(audio.currentTime);
        }
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
        audio.removeEventListener('copy', handleSecurityViolation);
      };
    }
  }, [sessionToken]);
  
  // Enhanced security for native audio controls
  const enhanceNativePlayerSecurity = () => {
    if (audioRef.current) {
      const audio = audioRef.current;
      
      // Prevent right-click context menu on audio controls
      audio.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      });
      
      // Prevent drag and drop
      audio.addEventListener('dragstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      });
      
      // Prevent text selection
      audio.addEventListener('selectstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      });
      
      // Monitor for download attempts and security events
       audio.addEventListener('loadstart', () => {
       });
       
        // Prevent save/download through browser menu and monitor source
        audio.addEventListener('progress', () => {
          // Get the real URL from the attribute since src property is obfuscated
          const realUrl = audio.getAttribute('src') || '';
          // Continuously monitor for unauthorized access attempts
          if (realUrl && !realUrl.includes('/drm/stream/') && !realUrl.includes('/stream-signed') && !realUrl.includes('/chapters/') && !realUrl.includes('blob:')) {
            console.warn('DRM: Unauthorized source detected', 'URL:', realUrl);
          }
        });
        
        // Obfuscate audio source in developer tools
        try {
          const srcDescriptor = Object.getOwnPropertyDescriptor(audio, 'src');
          if (!srcDescriptor || srcDescriptor.configurable !== false) {
            Object.defineProperty(audio, 'src', {
              get: function() {
                return '[DRM PROTECTED SOURCE]';
              },
              set: function(value) {
                // Allow setting but hide the actual URL
                this.setAttribute('src', value);
              },
              configurable: false
            });
          }
        } catch (error) {
          console.warn('DRM: Could not obfuscate src property:', error.message);
        }
       
       // Block picture-in-picture attempts
       audio.addEventListener('enterpictureinpicture', (e) => {
         e.preventDefault();
         audio.exitPictureInPicture?.();
         console.warn('DRM: Picture-in-picture blocked');
       });
      
      // Prevent keyboard shortcuts on audio element
      audio.addEventListener('keydown', (e) => {
        // Allow basic playback controls but prevent download shortcuts
        if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      });
    }
  };

  // Regular seeking method (fallback)
  const seekToRegular = useCallback(async (timeInSeconds) => {
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
            console.error('Playback failed:', err);
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
              console.error('Playback failed:', err);
            });
          }
          
          audioRef.current.removeEventListener('loadeddata', handleLoadedData);
        };
        audioRef.current.addEventListener('loadeddata', handleLoadedData);
      }
    }
  }, [sessionToken, duration, setUsingSignedUrl, initializeDRM, setCurrentTime, setIsPlaying]);

  // Seek using signed URL for more accurate timestamp-based streaming
  const seekToWithSignedUrl = useCallback(async (timeInSeconds) => {
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
        
        const handleCanPlayThrough = () => {
          // The backend provides a pre-seeked stream, so we don't need to manually set currentTime
          
          // Update our state to reflect the backend-provided position
          setCurrentTime(audioRef.current.currentTime);
          
          // Start playback directly - the stream is already at the correct position
          audioRef.current.play().then(() => {
            setIsPlaying(true);
          }).catch(err => {
            console.error('Playback failed:', err);
          });
          
          audioRef.current.removeEventListener('canplaythrough', handleCanPlayThrough);
        };
        
        audioRef.current.addEventListener('canplaythrough', handleCanPlayThrough);
      }
    } catch (error) {
      console.error('Error with signed URL seeking:', error);
      seekToRegular(timeInSeconds);
    }
  }, [fileId, setUsingSignedUrl, setCurrentTime, setIsPlaying, seekToRegular]);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    seekTo: (timeInSeconds) => {
      seekToWithSignedUrl(timeInSeconds);
    },
    playChapter: async (chapter) => {
      
      try {
        // Generate secure signed URL for chapter streaming
        const response = await api.post(`/files/${fileId}/chapters/${chapter.id}/stream-url`, {
          expiresIn: 30 * 60 * 1000 // 30 minutes
        });
        
        const { streamUrl } = response.data.data;
        
        if (audioRef.current) {
          // Stop current playback
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          
          // Load chapter stream
          audioRef.current.src = streamUrl;
          audioRef.current.crossOrigin = 'use-credentials';
          audioRef.current.load();
          
          // Play the chapter
          audioRef.current.play().catch(err => {
            console.error('Chapter play error:', err);
            if (onError) onError(`Failed to play chapter: ${err.message}`);
          });
          
        }
      } catch (err) {
        console.error('Chapter streaming error:', err);
        if (onError) onError(`Failed to stream chapter: ${err.response?.data?.message || err.message}`);
      }
    },
    seekToRegular: seekToRegular,
    getCurrentTime: () => currentTime,
    getDuration: () => duration,
    isPlaying: () => isPlaying,
    play: () => audioRef.current?.play(),
    pause: () => audioRef.current?.pause(),
    stop: () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    },
    getAudioElement: () => audioRef.current
  }), [currentTime, duration, isPlaying, seekToRegular, seekToWithSignedUrl, fileId, onError]);
  
  // Format time in seconds to H:M:S or M:S
  const formatTime = (timeInSeconds) => {
    if (!timeInSeconds || timeInSeconds < 0) return '0:00';
    
    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    
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
      {/* Native audio player with DRM security */}
      <audio
        ref={audioRef}
        controls
        preload="metadata"
        controlsList="nodownload nofullscreen noremoteplayback"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        onCopy={(e) => e.preventDefault()}
        onDoubleClick={(e) => e.preventDefault()}
         onMouseDown={(e) => {
           // Prevent middle-click and right-click
           if (e.button === 1 || e.button === 2) {
             e.preventDefault();
           }
         }}
        style={{ 
          width: '100%',
          height: '54px',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none',
          WebkitTouchCallout: 'none',
          WebkitUserDrag: 'none',
          KhtmlUserSelect: 'none',
          outline: 'none',
          border: '1px solid #dee2e6',
          borderRadius: '4px',
          backgroundColor: '#ffffff'
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
      
      {/* Player Status Information */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '10px',
        padding: '8px 12px',
        background: '#f8f9fa',
        border: '1px solid #dee2e6',
        borderRadius: '4px',
        fontSize: '14px'
      }}>
        <div style={{
          fontFamily: 'monospace',
          color: '#495057'
        }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
        <div style={{
          color: sessionToken ? '#28a745' : '#6c757d',
          fontWeight: 'bold'
        }}>
          {sessionToken ? '🟢 Ready' : '🔴 Initializing...'}
        </div>
      </div>
      
      {/* Security Notice and Watermark */}
      <div style={{ 
        fontSize: '12px', 
        color: '#666', 
        marginTop: '10px',
        textAlign: 'center',
        position: 'relative'
      }}>
        🛡️ This content is protected by DRM. Downloading or copying is prohibited.
        <div style={{
          position: 'absolute',
          top: '-70px',
          right: '10px',
          background: 'rgba(0, 0, 0, 0.1)',
          color: 'rgba(0, 0, 0, 0.3)',
          padding: '2px 6px',
          borderRadius: '3px',
          fontSize: '10px',
          fontWeight: 'bold',
          pointerEvents: 'none',
          userSelect: 'none'
        }}>
          PROTECTED
        </div>
      </div>

    </div>
  );
});

export default DRMPlayer;