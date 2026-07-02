import React, { useState, useRef, useEffect } from 'react'
import MemoryCard from './MemoryCard'
import CognitivePulse from './CognitivePulse'
import { authFetch, AuthenticationError, AuthorizationError } from '../lib/authFetch'
import './OracleInterface.css'

const OracleInterface = ({ onSystemStateChange }) => {
  const [message, setMessage] = useState('')
  const [response, setResponse] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [pulseEvents, setPulseEvents] = useState([])
  const [memories, setMemories] = useState([])

  const fileInputRef = useRef(null)
  const cameraVideoRef = useRef(null)
  const recognitionRef = useRef(null)
  const mediaStreamRef = useRef(null)

  // Fetch real memory items for Provenance Stream
  const fetchMemories = async () => {
    try {
      const res = await fetch('/api/oracle/memories/recent?limit=12', { credentials: 'same-origin' })
      if (!res.ok) return
      const data = await res.json()
      if (data.success && Array.isArray(data.memories)) {
        setMemories(data.memories)
      }
    } catch (e) {
      // Endpoint may not be configured; leave memories empty rather than fake data
    }
  }

  // Fetch real cognitive events for Cognitive Pulse
  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/oracle/events/recent?limit=40', { credentials: 'same-origin' })
      if (!res.ok) return
      const data = await res.json()
      if (data.success && Array.isArray(data.events)) {
        const formatted = data.events.map(ev => {
          if (typeof ev === 'string') return ev
          const ts = ev.type || ev.event_type || 'event'
          const desc = ev.description || ev.message || ''
          return desc ? `${ts}: ${desc}` : `${ts}...`
        })
        setPulseEvents(prev => {
          // If new event count is greater, pulse the orb briefly
          if (formatted.length > prev.length && onSystemStateChange) {
            onSystemStateChange('memory_retrieval')
            setTimeout(() => onSystemStateChange('idle'), 800)
          }
          return formatted
        })
      }
    } catch (e) {
      // Leave empty rather than show fake events
    }
  }

  useEffect(() => {
    // Initial real-data fetch
    fetchMemories()
    fetchEvents()

    // Poll for new events every 5s, memories every 30s
    const eventsTimer = setInterval(fetchEvents, 5000)
    const memoriesTimer = setInterval(fetchMemories, 30000)

    // Initialize voice recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = false
      recognitionRef.current.interimResults = false
      recognitionRef.current.lang = 'en-US'

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript
        setMessage(transcript)
        addPulseEvent('voice_input_processed')
        setIsRecording(false)
      }

      recognitionRef.current.onerror = () => {
        setIsRecording(false)
      }

      recognitionRef.current.onend = () => {
        setIsRecording(false)
      }
    }

    return () => {
      clearInterval(eventsTimer)
      clearInterval(memoriesTimer)
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  const addPulseEvent = (eventType) => {
    setPulseEvents(prev => [
      `${eventType.replace(/_/g, ' ')}...`,
      ...prev.slice(0, 19)
    ])
  }

  const handleSendMessage = async () => {
    if (!message.trim()) return

    const currentMessage = message
    setMessage('')
    addPulseEvent('message_processing')
    onSystemStateChange?.('thinking')

    try {
      const response = await authFetch('/api/enhanced/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: currentMessage,
          include_memory: true,
          include_consciousness: true
        })
      })

      if (response.ok) {
        const data = await response.json()
        setResponse(data.response)
        addPulseEvent('response_generated')
        onSystemStateChange?.('idle')

        if (voiceEnabled && data.response) {
          speak(data.response)
        }
      } else {
        throw new Error('Chat API error')
      }
    } catch (error) {
      console.error('Chat error:', error)

      if (error instanceof AuthenticationError) {
        setResponse('Authentication required. Please sign in to continue using Splendor.')
        addPulseEvent('authentication_required')
        onSystemStateChange?.('conflict')
      } else if (error instanceof AuthorizationError) {
        setResponse('Access denied. You do not have permission to access this feature.')
        addPulseEvent('access_denied')
        onSystemStateChange?.('conflict')
      } else {
        setResponse('I apologize, but I encountered an error processing your message. Please try again.')
        addPulseEvent('chat_error_occurred')
        onSystemStateChange?.('uncertain')
      }

      setTimeout(() => onSystemStateChange?.('idle'), 3000)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const toggleVoiceRecognition = () => {
    if (!recognitionRef.current) {
      alert('Voice recognition not supported in this browser')
      return
    }

    if (isRecording) {
      recognitionRef.current.stop()
      setIsRecording(false)
      onSystemStateChange?.('idle')
    } else {
      recognitionRef.current.start()
      setIsRecording(true)
      onSystemStateChange?.('listening')
      addPulseEvent('voice_recognition_active')
    }
  }

  const toggleVoiceOutput = () => {
    setVoiceEnabled(!voiceEnabled)
    addPulseEvent(voiceEnabled ? 'text_to_speech_disabled' : 'text_to_speech_enabled')
  }

  const speak = (text) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.9
      utterance.pitch = 1.0
      utterance.volume = 0.8
      speechSynthesis.speak(utterance)
      addPulseEvent('speech_synthesis_active')
    }
  }

  const handleFileUpload = async (file) => {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    addPulseEvent('image_file_upload_processing')

    const formData = new FormData()
    formData.append('image', file)
    formData.append('message', `[Image uploaded via file upload]`)

    try {
      const response = await authFetch('/api/enhanced/chat', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const data = await response.json()
        setResponse(data.response)
        addPulseEvent('image_analysis_complete')
      } else {
        throw new Error('Upload failed')
      }
    } catch (error) {
      console.error('Upload error:', error)

      if (error instanceof AuthenticationError) {
        setResponse('Authentication required. Please sign in to upload images.')
        addPulseEvent('authentication_required')
      } else if (error instanceof AuthorizationError) {
        setResponse('Access denied. You do not have permission to upload images.')
        addPulseEvent('access_denied')
      } else {
        addPulseEvent('image_upload_failed')
        setResponse('Image upload failed. Please try again.')
      }
    }
  }

  const toggleCamera = async () => {
    if (cameraActive) {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop())
        mediaStreamRef.current = null
      }
      setCameraActive(false)
      addPulseEvent('camera_stream_closed')
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' }
        })
        mediaStreamRef.current = stream
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream
        }
        setCameraActive(true)
        addPulseEvent('camera_stream_active')
      } catch (error) {
        console.error('Camera error:', error)
        alert('Camera access denied or unavailable')
      }
    }
  }

  const capturePhoto = () => {
    if (!cameraVideoRef.current || !mediaStreamRef.current) return

    const canvas = document.createElement('canvas')
    canvas.width = cameraVideoRef.current.videoWidth
    canvas.height = cameraVideoRef.current.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(cameraVideoRef.current, 0, 0)

    canvas.toBlob(blob => {
      handleFileUpload(blob)
    }, 'image/jpeg', 0.8)

    toggleCamera() // Close camera after capture
  }

  return (
    <>
      {/* Provenance Stream - Left */}
      <div className="provenance-panel">
        <div className="panel-header">
          <div className="panel-title">PROVENANCE STREAM</div>
          <div className="panel-subtitle">Memory Verification & Source Tracking</div>
        </div>
        <div className="memory-cards">
          {memories.length === 0 && (
            <div className="empty-state">No verified memories yet.</div>
          )}
          {memories.map((mem) => (
            <MemoryCard
              key={mem.id}
              date={(mem.created_at || '').slice(0, 10)}
              type={mem.source_type || mem.memory_type || 'UNKNOWN'}
              reference={mem.citation || mem.id}
              warning={mem.confidence != null && mem.confidence < 0.6
                ? `Low confidence (${Math.round(mem.confidence * 100)}%) — inferred memory`
                : null}
              content={mem.content}
            />
          ))}
        </div>
      </div>

      {/* Cognitive Pulse - Right */}
      <div className="cognitive-panel">
        <div className="panel-header">
          <div className="panel-title">COGNITIVE PULSE</div>
          <div className="panel-subtitle">Live System Events</div>
        </div>
        {pulseEvents.length === 0 ? (
          <div className="empty-state" style={{padding: '14px'}}>No live events.</div>
        ) : (
          <CognitivePulse events={pulseEvents} />
        )}
      </div>

      {/* Conversation Interface - Bottom */}
      <div className="conversation-console">
        <div className="response-display">
          {response}
        </div>

        <div className="input-system">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            className="message-input"
            placeholder=""
          />

          <div className="control-buttons">
            <button
              className="control-btn send-btn"
              onClick={handleSendMessage}
              title="Send message"
              disabled={!message.trim()}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13"/>
                <path d="M22 2 15 22 11 13 2 9 22 2z"/>
              </svg>
            </button>

            <button
              className={`control-btn mic-btn ${isRecording ? 'active' : ''}`}
              onClick={toggleVoiceRecognition}
              title="Voice input"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m12 1 0 6"/>
                <path d="m12 17 0 6"/>
                <path d="m12 1 a4 4 0 0 1 4 4 l0 6 a4 4 0 0 1 -8 0 l0 -6 a4 4 0 0 1 4 -4"/>
                <path d="m8 11 a4 4 0 0 0 8 0"/>
              </svg>
            </button>

            <button
              className="control-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Upload file"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m14.5 2.5 a3 3 0 0 1 0 4.24l-8.5 8.5a1.5 1.5 0 0 1-2.12-2.12l8.5-8.5"/>
                <path d="m14 7 3 3"/>
                <path d="m5 22 7.5-7.5"/>
              </svg>
            </button>

            <button
              className={`control-btn ${cameraActive ? 'active' : ''}`}
              onClick={toggleCamera}
              title="Camera"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="6" width="20" height="12" rx="2"/>
                <circle cx="12" cy="12" r="3"/>
                <path d="m7 2 5 4 5-4"/>
              </svg>
            </button>

            <button
              className={`control-btn ${voiceEnabled ? 'active' : ''}`}
              onClick={toggleVoiceOutput}
              title="Text to speech"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5,6 9,2 9,2 15,6 15,11 19"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Hidden Elements */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => e.target.files[0] && handleFileUpload(e.target.files[0])}
        accept="image/*"
        style={{ display: 'none' }}
      />

      {/* Camera Preview */}
      {cameraActive && (
        <div className="camera-preview">
          <video
            ref={cameraVideoRef}
            autoPlay
            playsInline
            muted
            className="camera-video"
          />
          <div className="camera-controls">
            <button className="capture-btn" onClick={capturePhoto}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="6" width="20" height="12" rx="2"/>
                <circle cx="12" cy="12" r="3"/>
                <path d="m7 2 5 4 5-4"/>
              </svg>
            </button>
            <button className="close-camera-btn" onClick={toggleCamera}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default OracleInterface