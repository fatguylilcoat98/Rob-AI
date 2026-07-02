/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// Global variables
let userId = null;
let currentUser = null;
let isRecording = false;
let recognition = null;
let chatMessages, messageInput, sendButton, micButton, emptyState;

// Dashboard state
let dashboardOpen = false;

// Camera state
let cameraButton, cameraPreview, cameraPreviewWrap;
let cameraStream = null;
// Feature flags
// Streaming + parallel-TTS are temporarily disabled. The cached older
// shells on installed PWAs still call handleStreamingResponseWithTTS
// before it was wired up, throwing a ReferenceError. The simple
// non-streaming path goes through /api/chat which is known-good.
const USE_STREAMING = false;
const USE_PARALLEL_TTS = false;


let cameraActive = false;
const captureCanvas = document.createElement('canvas');

// Voice playback state
let speakerButton;
let speakerActive = false;
let currentAudio = null;

// Authentication functions
async function authenticateUser(username, password) {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (data.success) {
      currentUser = data.user;
      userId = data.user.id;
      localStorage.setItem('splendor_user', JSON.stringify(data.user));
      localStorage.setItem('splendor_user_id', data.user.id);
      return { success: true, user: data.user };
    } else {
      return { success: false, error: data.error };
    }
  } catch (err) {
    return { success: false, error: 'Connection error. Please try again.' };
  }
}

async function createUser(username, password, displayName) {
  try {
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, displayName })
    });

    const data = await response.json();

    if (data.success) {
      currentUser = data.user;
      userId = data.user.id;
      localStorage.setItem('splendor_user', JSON.stringify(data.user));
      localStorage.setItem('splendor_user_id', data.user.id);
      return { success: true, user: data.user };
    } else {
      return { success: false, error: data.error };
    }
  } catch (err) {
    return { success: false, error: 'Connection error. Please try again.' };
  }
}

function checkAuthState() {
  const storedUser = localStorage.getItem('splendor_user');
  if (storedUser) {
    try {
      currentUser = JSON.parse(storedUser);
      userId = currentUser.id;
      return true;
    } catch (err) {
      localStorage.removeItem('splendor_user');
      localStorage.removeItem('splendor_user_id');
    }
  }
  return false;
}

function logout() {
  currentUser = null;
  userId = null;
  localStorage.removeItem('splendor_user');
  localStorage.removeItem('splendor_user_id');
  localStorage.removeItem('splendor_last_message');
  showLoginModal();
  // Clear chat messages
  if (chatMessages) {
    chatMessages.innerHTML = '';
  }
  showEmptyState();
}

function showLoginModal() {
  const overlay = document.getElementById('loginOverlay');
  const appContainer = document.getElementById('appContainer');
  if (overlay && appContainer) {
    overlay.classList.remove('hidden');
    appContainer.style.display = 'none';
  }
}

function hideLoginModal() {
  const overlay = document.getElementById('loginOverlay');
  const appContainer = document.getElementById('appContainer');
  if (overlay && appContainer) {
    overlay.classList.add('hidden');
    appContainer.style.display = 'flex';
  }
}

function updateUserInfo() {
  const userInfo = document.getElementById('userInfo');
  if (userInfo && currentUser) {
    userInfo.innerHTML = `
      <span>Welcome, ${currentUser.display_name}</span>
      <button class="logout-button" onclick="logout()">Logout</button>
    `;
  }
}

// Cognitive Dashboard Functions
async function openCognitiveDashboard() {
  if (!userId) {
    console.error('No user ID available for dashboard');
    return;
  }

  dashboardOpen = true;
  const dashboardOverlay = document.getElementById('dashboardOverlay');
  const dashboardContent = document.getElementById('dashboardContent');

  if (dashboardOverlay) {
    dashboardOverlay.classList.remove('hidden');
  }

  if (dashboardContent) {
    dashboardContent.innerHTML = '<div class="loading">Loading your cognitive fingerprint...</div>';

    try {
      await loadDashboardData();
    } catch (error) {
      console.error('Dashboard load error:', error);
      dashboardContent.innerHTML = '<div class="loading" style="color: var(--error);">Failed to load dashboard data</div>';
    }
  }
}

function closeCognitiveDashboard() {
  dashboardOpen = false;
  const dashboardOverlay = document.getElementById('dashboardOverlay');
  if (dashboardOverlay) {
    dashboardOverlay.classList.add('hidden');
  }
}

async function loadDashboardData() {
  const dashboardContent = document.getElementById('dashboardContent');

  try {
    // Fetch cognitive profile and sci-fi status
    const [profileResponse, statusResponse] = await Promise.all([
      fetch(`/cognitive/api/${userId}/profile`),
      fetch(`/api/scifi/status/${userId}`)
    ]);

    const profileData = await profileResponse.json();
    const statusData = await statusResponse.json();

    const profile = profileData.profile;
    const summary = profileData.summary;
    const sciFiStatus = statusData.enabled;

    dashboardContent.innerHTML = generateDashboardHTML(profile, summary, sciFiStatus, statusData);

    // Initialize sci-fi toggle functionality
    initializeDashboardControls();

  } catch (error) {
    console.error('Dashboard data fetch error:', error);
    dashboardContent.innerHTML = '<div class="loading" style="color: var(--error);">Error loading dashboard</div>';
  }
}

function generateDashboardHTML(profile, summary, sciFiEnabled, statusData) {
  const hasProfile = summary && summary.exists;

  return `
    <div class="dashboard-grid">
      <!-- Sci-Fi Mode Control -->
      <div class="dashboard-card">
        <h3>🚀 Sci-Fi Mode Control</h3>
        <div class="dashboard-card-content">
          <div class="scifi-controls ${sciFiEnabled ? 'enabled' : ''}">
            <div class="scifi-status">
              <div class="status-indicator ${sciFiEnabled ? 'enabled' : 'disabled'}">
                <div class="status-dot ${sciFiEnabled ? 'enabled' : 'disabled'}"></div>
                ${sciFiEnabled ? 'EXPERIMENTAL MODE ACTIVE' : 'STANDARD MODE ACTIVE'}
              </div>
              <button class="toggle-button ${sciFiEnabled ? 'danger' : ''}" id="scifiToggleBtn">
                ${sciFiEnabled ? 'DISABLE' : 'ENABLE'}
              </button>
            </div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">
              ${sciFiEnabled ? 'Continuous consciousness + ambient awareness active' : 'Standard cognitive fingerprinting only'}
            </div>
          </div>
        </div>
      </div>

      <!-- Cognitive Profile -->
      <div class="dashboard-card">
        <h3>🧠 Cognitive Fingerprint</h3>
        <div class="dashboard-card-content">
          ${hasProfile ? `
            <div class="fingerprint-grid">
              <div class="fingerprint-item">
                <div class="label">Reasoning Style</div>
                <div class="value">${summary.reasoningStyle || 'developing'}</div>
              </div>
              <div class="fingerprint-item">
                <div class="label">Communication</div>
                <div class="value">${summary.communicationStyle || 'developing'}</div>
              </div>
              <div class="fingerprint-item">
                <div class="label">Learning Style</div>
                <div class="value">${summary.learningStyle || 'developing'}</div>
              </div>
              <div class="fingerprint-item">
                <div class="label">Conversations</div>
                <div class="value">${summary.conversations || 0}</div>
              </div>
            </div>

            <div style="margin: 16px 0;">
              <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 6px;">
                Profile Confidence: ${Math.round((summary.confidence || 0) * 100)}%
              </div>
              <div class="confidence-bar">
                <div class="confidence-fill" style="width: ${Math.round((summary.confidence || 0) * 100)}%"></div>
              </div>
            </div>
          ` : `
            <div style="text-align: center; color: var(--text-muted); padding: 20px;">
              <p>Cognitive fingerprint is building...</p>
              <p>Start a conversation to begin pattern analysis.</p>
            </div>
          `}
        </div>
      </div>

      <!-- Evolution Timeline -->
      <div class="dashboard-card">
        <h3>📈 Thinking Evolution</h3>
        <div class="dashboard-card-content">
          <div style="text-align: center; color: var(--text-muted); padding: 20px;">
            <p>Evolution tracking coming soon...</p>
            <p>This will show how your thinking patterns change over time.</p>
          </div>
        </div>
      </div>

      <!-- Cost & Usage -->
      <div class="dashboard-card">
        <h3>💰 Usage & Cost</h3>
        <div class="dashboard-card-content">
          <div class="fingerprint-grid">
            <div class="fingerprint-item">
              <div class="label">Mode</div>
              <div class="value">${sciFiEnabled ? 'Sci-Fi' : 'Standard'}</div>
            </div>
            <div class="fingerprint-item">
              <div class="label">Est. Daily Cost</div>
              <div class="value">${sciFiEnabled ? '$10-15' : '$2-5'}</div>
            </div>
          </div>

          <div style="margin-top: 16px; font-size: 12px; color: var(--text-muted);">
            ${sciFiEnabled ?
              'Sci-fi mode includes continuous consciousness and ambient awareness' :
              'Standard mode includes cognitive fingerprinting and adaptive responses'
            }
          </div>
        </div>
      </div>
    </div>
  `;
}

function initializeDashboardControls() {
  const scifiToggleBtn = document.getElementById('scifiToggleBtn');
  if (scifiToggleBtn) {
    scifiToggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleSciFiMode();
    });
  }
  console.log('Dashboard controls initialized');
}

async function toggleSciFiMode() {
  if (!userId) return;

  try {
    const response = await fetch(`/api/scifi/toggle/${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const result = await response.json();

    if (result.success) {
      // Show a brief notification
      showNotification(result.message, 'success');

      // Reload dashboard data
      setTimeout(() => {
        loadDashboardData();
      }, 1000);
    } else {
      showNotification('Failed to toggle sci-fi mode: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Sci-fi toggle error:', error);
    showNotification('Failed to toggle sci-fi mode', 'error');
  }
}

function showNotification(message, type = 'info') {
  // Simple notification system
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--error)' : 'var(--primary)'};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 3000;
    font-size: 14px;
    max-width: 300px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  `;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Helper functions
function getUserId() {
  // For authenticated users, return the stored user ID
  if (currentUser && currentUser.id) {
    return currentUser.id;
  }

  // Fallback to stored user ID
  return localStorage.getItem('splendor_user_id') || null;
}

function getLastMessageDate() {
  const lastDate = localStorage.getItem('splendor_last_message');
  return lastDate ? new Date(lastDate) : null;
}

function setLastMessageDate() {
  localStorage.setItem('splendor_last_message', new Date().toISOString());
}

function isFirstMessageToday() {
  const now = new Date();
  const today = now.toDateString();
  const lastMessageToday = getLastMessageDate();

  if (!lastMessageToday) return true;

  const lastDateString = lastMessageToday.toDateString();
  return lastDateString !== today;
}

function adjustTextareaHeight() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
}

function hideEmptyState() {
  if (emptyState) {
    emptyState.style.display = 'none';
  }
}

function scrollToBottom() {
  setTimeout(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 100);
}

function appendMessage(sender, content) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message';

  const bubbleDiv = document.createElement('div');
  bubbleDiv.className = sender === 'splendor' ? 'splendor-message' : 'user-message';
  bubbleDiv.textContent = content;

  const timeDiv = document.createElement('div');
  timeDiv.className = 'message-time';
  timeDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  messageDiv.appendChild(bubbleDiv);
  messageDiv.appendChild(timeDiv);
  chatMessages.appendChild(messageDiv);

  scrollToBottom();

  // Return the bubble element so it can be updated
  return bubbleDiv;
}

function showThinking() {
  const thinkingDiv = document.createElement('div');
  thinkingDiv.className = 'thinking-container';
  thinkingDiv.id = 'thinkingIndicator';

  const bubbleDiv = document.createElement('div');
  bubbleDiv.className = 'thinking';

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('div');
    dot.className = 'thinking-dot';
    bubbleDiv.appendChild(dot);
  }

  thinkingDiv.appendChild(bubbleDiv);
  chatMessages.appendChild(thinkingDiv);

  scrollToBottom();
}

function hideThinking() {
  const thinking = document.getElementById('thinkingIndicator');
  if (thinking) {
    thinking.remove();
  }
}


// Streaming chat function - streams response tokens as they arrive
async function streamChat(message, imageData = null) {
  try {
    // Get current reality context
    const realityContextData = typeof getRealityContext === 'function' ? getRealityContext() : null;

    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        userId: userId,
        imageData,
        realityContext: realityContextData
      }),
    });

    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullResponse = '';
    let conversationId = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Decode the chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep the incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6); // Remove 'data: '
          
          if (data === '[DONE]') {
            return { fullResponse, conversationId };
          }

          try {
            const parsed = JSON.parse(data);
            
            if (parsed.type === 'token') {
              fullResponse += parsed.text;
              // Return the token immediately for UI update
              return { token: parsed.text, fullResponse, done: false };
            } else if (parsed.type === 'done') {
              conversationId = parsed.conversation_id;
              fullResponse = parsed.full_response; // Use complete response
              return { fullResponse, conversationId, done: true };
            } else if (parsed.type === 'error') {
              throw new Error(parsed.message);
            }
          } catch (e) {
            console.warn('Failed to parse SSE data:', data);
          }
        }
      }
    }

    return { fullResponse, conversationId };

  } catch (error) {
    console.error('Streaming chat error:', error);
    throw error;
  }
}

// Streaming wrapper that handles token-by-token UI updates
async function handleStreamingResponse(message, imageData = null, thinkingElement = null) {
  let fullResponse = '';
  
  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        userId: userId,
        imageData,
        realityContext: typeof getRealityContext === 'function' ? getRealityContext() : null
      }),
    });

    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          

// Sentence boundary detection - avoids splitting abbreviations and decimals
function detectSentenceBoundary(text) {
  // Pattern for sentence endings: period/question/exclamation followed by space or end
  // But NOT for: Dr. Smith, 3.14, etc.
  const sentenceEnds = /[.!?]+\s+(?=[A-Z])|[.!?]+$/g;
  
  // Find all potential boundaries
  const matches = [...text.matchAll(sentenceEnds)];
  if (matches.length === 0) return null;
  
  const lastMatch = matches[matches.length - 1];
  const endIndex = lastMatch.index + lastMatch[0].length;
  
  // Extract the sentence
  const sentence = text.substring(0, endIndex).trim();
  
  // Avoid splitting common abbreviations
  const abbreviations = ['Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Prof.', 'Inc.', 'Ltd.', 'etc.', 'vs.'];
  const endsWithAbbrev = abbreviations.some(abbr => sentence.endsWith(abbr));
  
  if (endsWithAbbrev) return null;
  
  // Avoid splitting decimals (if sentence ends with number.number pattern)
  if (/\d+\.\d*$/.test(sentence)) return null;
  
  return {
    sentence: sentence,
    remaining: text.substring(endIndex).trim()
  };
}

// Audio queue manager for gapless playback
class AudioQueue {
  constructor() {
    this.queue = [];
    this.currentSequence = 0;
    this.isPlaying = false;
  }
  
  addChunk(audioBase64, sequenceNumber) {
    this.queue.push({ audio: audioBase64, sequence: sequenceNumber });
    this.queue.sort((a, b) => a.sequence - b.sequence);
    this.tryPlayNext();
  }
  
  async tryPlayNext() {
    if (this.isPlaying || !speakerActive) return;
    
    const nextChunk = this.queue.find(chunk => chunk.sequence === this.currentSequence);
    if (!nextChunk) return;
    
    this.isPlaying = true;
    
    try {
      const audioBlob = this.base64ToBlob(nextChunk.audio, 'audio/mpeg');
      const audioUrl = URL.createObjectURL(audioBlob);
      const audioEl = new Audio(audioUrl);
      
      audioEl.onended = () => {
        this.currentSequence++;
        this.isPlaying = false;
        this.removePlayedChunk(nextChunk.sequence);
        this.tryPlayNext();
      };
      
      audioEl.onerror = () => {
        this.isPlaying = false;
        this.currentSequence++;
        this.removePlayedChunk(nextChunk.sequence);
        this.tryPlayNext();
      };
      
      await audioEl.play();
      
    } catch (error) {
      console.error('Audio playback error:', error);
      this.isPlaying = false;
      this.currentSequence++;
      this.removePlayedChunk(nextChunk.sequence);
      this.tryPlayNext();
    }
  }
  
  base64ToBlob(base64, contentType) {
    const sliceSize = 1024;
    const byteCharacters = atob(base64);
    const bytesLength = byteCharacters.length;
    const slicesCount = Math.ceil(bytesLength / sliceSize);
    const byteArrays = [];

    for (let sliceIndex = 0; sliceIndex < slicesCount; ++sliceIndex) {
      const begin = sliceIndex * sliceSize;
      const end = Math.min(begin + sliceSize, bytesLength);
      const bytes = new Array(end - begin);
      
      for (let offset = begin, i = 0; offset < end; ++i, ++offset) {
        bytes[i] = byteCharacters[offset].charCodeAt(0);
      }
      
      byteArrays[sliceIndex] = new Uint8Array(bytes);
    }
    
    return new Blob(byteArrays, { type: contentType });
  }
  
  removePlayedChunk(sequence) {
    this.queue = this.queue.filter(chunk => chunk.sequence !== sequence);
  }
  
  clear() {
    this.queue = [];
    this.currentSequence = 0;
    this.isPlaying = false;
  }
}

// Enhanced streaming with parallel TTS
async function handleStreamingResponseWithTTS(message, imageData = null, thinkingElement = null) {
  let fullResponse = '';
  let buffer = '';
  let sequenceNumber = 0;
  const audioQueue = new AudioQueue();
  
  // Clear any existing audio
  if (currentAudio) {
    try { currentAudio.pause(); } catch {}
    currentAudio = null;
  }
  
  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        userId: userId,
        imageData,
        realityContext: typeof getRealityContext === 'function' ? getRealityContext() : null
      }),
    });

    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let streamBuffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      streamBuffer += decoder.decode(value, { stream: true });
      const lines = streamBuffer.split('\n');
      streamBuffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          if (data === '[DONE]') {
            // Process any remaining text in buffer
            if (buffer.trim() && USE_PARALLEL_TTS && speakerActive) {
              fireTTSChunk(buffer.trim(), sequenceNumber++);
            }
            return fullResponse;
          }

          try {
            const parsed = JSON.parse(data);
            
            if (parsed.type === 'token') {
              fullResponse += parsed.text;
              buffer += parsed.text;
              
              // Update UI immediately
              if (thinkingElement) {
                thinkingElement.classList.remove('thinking');
                thinkingElement.textContent = fullResponse;
              }
              
              // Check for sentence boundary
              if (USE_PARALLEL_TTS && speakerActive) {
                const boundary = detectSentenceBoundary(buffer);
                if (boundary) {
                  // Fire TTS for complete sentence
                  fireTTSChunk(boundary.sentence, sequenceNumber++);
                  buffer = boundary.remaining;
                }
              }
              
            } else if (parsed.type === 'done') {
              fullResponse = parsed.full_response;
              if (thinkingElement) {
                thinkingElement.textContent = fullResponse;
              }
              
              // Handle any remaining text
              if (buffer.trim() && USE_PARALLEL_TTS && speakerActive) {
                fireTTSChunk(buffer.trim(), sequenceNumber++);
              }
              
              return fullResponse;
            } else if (parsed.type === 'error') {
              throw new Error(parsed.message);
            }
          } catch (e) {
            console.warn('Failed to parse SSE data:', data);
          }
        }
      }
    }

    return fullResponse;

  } catch (error) {
    console.error('Streaming with TTS error:', error);
    throw error;
  }
  
  // Fire-and-forget TTS synthesis
  async function fireTTSChunk(text, sequence) {
    try {
      const ttsResponse = await fetch('/api/voice/speak-chunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          sequence_number: sequence
        })
      });
      
      const ttsData = await ttsResponse.json();
      
      if (ttsData.audio && !ttsData.fallback) {
        audioQueue.addChunk(ttsData.audio, sequence);
      }
      
    } catch (error) {
      console.error(`TTS chunk ${sequence} failed:`, error);
    }
  }
}

          if (data === '[DONE]') {
            return fullResponse;
          }

          try {
            const parsed = JSON.parse(data);
            
            if (parsed.type === 'token') {
              fullResponse += parsed.text;
              
              // Update UI immediately with new token
              if (thinkingElement) {
                thinkingElement.classList.remove('thinking');
                thinkingElement.textContent = fullResponse;
              }
            } else if (parsed.type === 'done') {
              fullResponse = parsed.full_response;
              if (thinkingElement) {
                thinkingElement.textContent = fullResponse;
              }
              return fullResponse;
            } else if (parsed.type === 'error') {
              throw new Error(parsed.message);
            }
          } catch (e) {
            console.warn('Failed to parse SSE data:', data);
          }
        }
      }
    }

    return fullResponse;

  } catch (error) {
    console.error('Streaming error:', error);
    throw error;
  }
}

async function fetchSplendorResponse(message, imageData = null) {
  try {
    // Get current reality context
    const realityContextData = typeof getRealityContext === 'function' ? getRealityContext() : null;

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        userId: userId,
        imageData,
        realityContext: realityContextData
      }),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error || 'Something went wrong');
    } else {
      return data.message;
    }
  } catch (error) {
    console.error('Chat error:', error);
    throw error;
  }
}

function captureCameraFrame() {
  if (!cameraActive || !cameraStream || !cameraPreview) return null;
  try {
    const w = cameraPreview.videoWidth;
    const h = cameraPreview.videoHeight;
    if (!w || !h) return null;
    captureCanvas.width = w;
    captureCanvas.height = h;
    captureCanvas.getContext('2d').drawImage(cameraPreview, 0, 0, w, h);
    return captureCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  } catch (err) {
    console.error('captureCameraFrame error:', err);
    return null;
  }
}

// Fetch TTS audio and return as blob for pre-buffering
async function fetchTTSAudio(text) {
  if (!speakerActive) return null;

  try {
    const response = await fetch('/api/voice/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    const data = await response.json();

    if (data.audio) {
      // Convert base64 to blob
      const binaryString = atob(data.audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return new Blob([bytes], { type: 'audio/mpeg' });
    } else if (data.fallback === 'browser_tts' && 'speechSynthesis' in window) {
      // For browser TTS, we can't pre-buffer, so return null
      return null;
    }
  } catch (err) {
    console.error('TTS fetch error:', err);
    return null;
  }
}

// Fallback for browser TTS when no audio blob available
function playBrowserTTS(text) {
  if (!speakerActive) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.1;
  utter.pitch = 1.0;
  window.speechSynthesis.speak(utter);
}

async function sendMessage() {
  const message = messageInput.value.trim();
  const imageData = captureCameraFrame();

  if (!message && !imageData) {
    console.log('No message or image to send');
    return;
  }

  // iOS: unlock the persistent audio element on this real user gesture
  // so the post-fetch playSpoken() can actually emit sound. No-op on
  // Android and on subsequent sends.
  unlockIosAudio();

  console.log(`💬 Sending message from user ${userId}:`, message, imageData ? '(with image)' : '');

  appendMessage('user', message || (imageData ? '(image)' : ''));
  messageInput.value = '';
  adjustTextareaHeight();
  hideEmptyState();
  setLastMessageDate();

  // Show thinking indicator immediately
  const thinkingEl = appendMessage('splendor', 'Thinking...');
  thinkingEl.classList.add('thinking');
  sendButton.disabled = true;

  try {
    // Get text response - use streaming if enabled
    let response;
    if (USE_STREAMING && typeof handleStreamingResponse === 'function') {
      if (USE_PARALLEL_TTS && typeof handleStreamingResponseWithTTS === 'function') {
        response = await handleStreamingResponseWithTTS(message, imageData, thinkingEl);
        // Skip regular TTS since parallel TTS is already playing
        return;
      } else {
        response = await handleStreamingResponse(message, imageData, thinkingEl);
      }
    } else {
      response = await fetchSplendorResponse(message, imageData);
    }

    // Pre-load the audio for the response
    const audioBlob = await fetchTTSAudio(response);

    if (audioBlob && speakerActive) {
      const audioUrl = URL.createObjectURL(audioBlob);
      const audioEl = new Audio(audioUrl);
      currentAudio = audioEl;
      await audioEl.load(); // fully buffer it

      // Now drop both together
      thinkingEl.classList.remove('thinking');
      thinkingEl.textContent = response;
      audioEl.play().catch(err => console.error('Audio playback failed:', err));

      // Clean up URL when audio ends
      audioEl.addEventListener('ended', () => URL.revokeObjectURL(audioUrl));
    } else {
      // No audio or speaker off - just show text
      thinkingEl.classList.remove('thinking');
      thinkingEl.textContent = response;

      // Try browser TTS as fallback if speaker is on
      if (speakerActive) {
        playBrowserTTS(response);
      }
    }

  } catch (err) {
    console.error('Send message error:', err);
    thinkingEl.classList.remove('thinking');
    // Surface the actual server error message so failures aren't hidden
    // behind a generic. Falls back to the generic if no message present.
    const detail = (err && err.message && err.message.length < 240)
      ? err.message
      : 'Something went wrong. Try again.';
    thinkingEl.textContent = detail;
  } finally {
    sendButton.disabled = false;
    messageInput.focus();
  }
}

async function toggleCamera() {
  if (!cameraButton || !cameraPreview || !cameraPreviewWrap) return;

  if (cameraActive) {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
    cameraActive = false;
    cameraPreviewWrap.classList.remove('active');
    cameraButton.classList.remove('active');
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    appendMessage('splendor', 'This device does not expose a camera I can use.');
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    });
    cameraPreview.srcObject = cameraStream;
    cameraActive = true;
    cameraPreviewWrap.classList.add('active');
    cameraButton.classList.add('active');
  } catch (err) {
    console.error('Camera error:', err);
    appendMessage('splendor', "I can't access the camera. Please check your browser permissions.");
    cameraActive = false;
  }
}

function toggleSpeaker() {
  // iOS: prime audio inside this real tap so future TTS replies play.
  // Calling here means a user who turns the speaker on BEFORE typing
  // still gets working audio on iOS.
  unlockIosAudio();
  speakerActive = !speakerActive;
  if (speakerButton) speakerButton.classList.toggle('active', speakerActive);
  if (!speakerActive) {
    // Stop OpenAI audio
    if (currentAudio) {
      try { currentAudio.pause(); } catch {}
      currentAudio = null;
    }
    // Stop browser TTS
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }
}

async function playSpoken(text) {
  try {
    const response = await fetch('/api/voice/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    const data = await response.json();

    if (data.audio) {
      const src = 'data:audio/mpeg;base64,' + data.audio;
      // iOS Safari blocks Audio().play() that runs after async work
      // (the user's tap gesture has "expired" by the time the audio
      // arrives). Reuse the audio element we unlocked synchronously
      // inside the user's first tap — that one keeps working.
      const el = window.unlockedAudio;
      if (el) {
        try {
          el.src = src;
          // iOS PWA quirks: load() forces re-buffer of the new src.
          el.load();
          const p = el.play();
          if (p && p.catch) {
            p.catch((err) => {
              console.error('Audio playback rejected (likely iOS silent switch or expired gesture):', err);
              // Last-ditch fallback so the user still hears something.
              if ('speechSynthesis' in window) {
                try {
                  window.speechSynthesis.cancel();
                  const u = new SpeechSynthesisUtterance(text);
                  window.speechSynthesis.speak(u);
                } catch {}
              }
            });
          }
          currentAudio = el;
        } catch (err) {
          console.error('Audio element error:', err);
        }
      } else {
        // Pre-unlock path (very first reply or unlock didn't fire yet).
        // Best effort; will fail on iOS but works on Android.
        const audio = new Audio(src);
        currentAudio = audio;
        audio.play().catch((err) => console.error('Audio playback failed (no unlock):', err));
      }
    } else if (data.fallback === 'browser_tts' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.1;
      utter.pitch = 1.0;
      window.speechSynthesis.speak(utter);
    }
  } catch (err) {
    console.error('Voice playback error:', err);
  }
}

// iOS audio unlock — must run synchronously inside the first real
// user gesture (button click, etc.). Creates one persistent <audio>
// element, primes it with a 1-frame silent MP3, calls play() in the
// gesture so iOS marks it "user-activated." All future playSpoken()
// calls reuse this element and play() works even from async code.
//
// Tiny silent MP3 (~0.07s) — works as iOS gesture primer.
const SILENT_MP3 = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQwAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAACcQCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgID///////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAnGMHkkIAAAAAAAAAAAAAAAAAAAA//sQxAADwAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';

function unlockIosAudio() {
  if (window.unlockedAudio) return; // already done
  try {
    const el = document.createElement('audio');
    el.preload = 'auto';
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    el.src = SILENT_MP3;
    // Don't append to DOM — keep it offscreen.
    const p = el.play();
    if (p && p.then) {
      p.then(() => {
        // After the silent primer plays, immediately pause so we can
        // reuse the same element for actual TTS playback.
        try { el.pause(); el.currentTime = 0; } catch {}
        window.unlockedAudio = el;
        console.log('[audio] iOS audio unlocked');
      }).catch((err) => {
        // Some iOS versions throw on the silent primer. Keep the
        // element anyway — subsequent .play() calls in real gestures
        // (button taps) will still work.
        window.unlockedAudio = el;
        console.warn('[audio] silent primer rejected, keeping element anyway:', err && err.message);
      });
    } else {
      window.unlockedAudio = el;
    }
  } catch (err) {
    console.error('[audio] unlock failed:', err);
  }
}

async function setupAudioContext() {
  try {
    // Request microphone access with echo cancellation
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        }
      });

      // Stop the stream immediately - we just wanted to set permissions and test echo cancellation
      stream.getTracks().forEach(track => track.stop());
      console.log('Audio context setup complete with echo cancellation');
      return true;
    }
  } catch (error) {
    console.warn('Could not set up enhanced audio context:', error);
    return false;
  }
}

function toggleVoiceInput() {
  console.log('Toggle voice input called');

  if (!recognition) {
    console.log('Voice recognition not supported');
    return;
  }

  if (isRecording) {
    recognition.stop();
    isRecording = false;
    micButton.classList.remove('listening');
    micButton.title = 'Start voice input (click and speak, then click send when done)';
    console.log('Stopped recording - click Send when ready');
  } else {
    try {
      // Clear input and set up audio context for echo cancellation
      messageInput.value = '';  // Start with clean slate
      setupAudioContext().then(() => {
        recognition.start();
        isRecording = true;
        micButton.classList.add('listening');
        micButton.title = 'Stop voice input (recording continuously until you stop)';
        console.log('Started continuous recording - speak freely, click mic again when done');
      }).catch(() => {
        // Fallback if audio setup fails
        recognition.start();
        isRecording = true;
        micButton.classList.add('listening');
        micButton.title = 'Stop voice input (recording continuously until you stop)';
        console.log('Started recording with basic audio');
      });
    } catch (error) {
      console.error('Voice recognition start error:', error);
      isRecording = false;
      micButton.classList.remove('listening');
      micButton.title = 'Voice input error - try again';
    }
  }
}

function initVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;  // Keep recording until user stops
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      // Process all results to build complete transcripts
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      // Simply set the value to final + interim (no complex concatenation)
      messageInput.value = finalTranscript + interimTranscript;
      adjustTextareaHeight();
    };

    recognition.onend = () => {
      isRecording = false;
      micButton.classList.remove('listening');
      console.log('Voice recognition ended - ready to send when you click send button');
      // NO AUTO-SEND - user must click send button manually
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      isRecording = false;
      micButton.classList.remove('listening');

      // Handle specific errors
      if (event.error === 'no-speech') {
        console.log('No speech detected, continuing to listen...');
        // Don't stop on no-speech, just continue
        return;
      } else if (event.error === 'network') {
        appendMessage('system', 'Network error with voice recognition. Please try again.');
      } else if (event.error === 'not-allowed') {
        appendMessage('system', 'Microphone permission denied. Please allow microphone access and try again.');
      }
    };

    recognition.onstart = () => {
      console.log('Voice recognition started');
    };

    console.log('Voice recognition initialized with continuous mode');

    // Set initial tooltip
    if (micButton) {
      micButton.title = 'Start voice input (continuous recording until you stop)';
    }

    // Pre-setup audio context for better echo cancellation
    setTimeout(() => {
      setupAudioContext().then(() => {
        console.log('Audio context pre-configured for echo cancellation');
      }).catch(() => {
        console.log('Audio context setup will be done on first use');
      });
    }, 1000);

  } else {
    // Hide mic button if not supported
    micButton.style.display = 'none';
    console.log('Voice recognition not supported');
  }
}

async function checkMorningGreeting() {
  const now = new Date();
  const hour = now.getHours();

  // Check if it's morning (5am-10am) and first visit today
  if (hour >= 5 && hour <= 10 && isFirstMessageToday()) {
    try {
      const response = await fetch(`/api/chat/morning/${userId}`);
      const data = await response.json();

      if (data.message) {
        appendMessage('splendor', data.message);
        hideEmptyState();
      }
    } catch (error) {
      console.error('Morning greeting error:', error);
    }
  }
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing Splendor...');

  // Check authentication state first
  const isAuthenticated = checkAuthState();

  if (isAuthenticated) {
    console.log(`🔐 User authenticated: ${currentUser.username} (${currentUser.id})`);
    hideLoginModal();
    updateUserInfo();
  } else {
    console.log('🔐 No authentication found, showing login');
    showLoginModal();
  }

  // Initialize global variables
  userId = getUserId();
  console.log(`🆔 User ID: ${userId}`);
  chatMessages = document.getElementById('chatMessages');
  messageInput = document.getElementById('messageInput');
  sendButton = document.getElementById('sendButton');
  micButton = document.getElementById('micButton');
  emptyState = document.getElementById('emptyState');
  cameraButton = document.getElementById('cameraButton');
  cameraPreview = document.getElementById('cameraPreview');
  cameraPreviewWrap = document.getElementById('cameraPreviewWrap');
  speakerButton = document.getElementById('speakerButton');

  // Cognitive dashboard elements
  const brainButton = document.getElementById('brainButton');
  const dashboardOverlay = document.getElementById('dashboardOverlay');
  const closeDashboard = document.getElementById('closeDashboard');
  const dashboardContent = document.getElementById('dashboardContent');

  console.log('Elements found:', {
    chatMessages: !!chatMessages,
    messageInput: !!messageInput,
    sendButton: !!sendButton,
    micButton: !!micButton,
    emptyState: !!emptyState,
    cameraButton: !!cameraButton,
    speakerButton: !!speakerButton
  });

  // Initialize reality context system
  if (typeof initializeRealityContext === 'function') {
    initializeRealityContext();
    console.log('[REALITY] Reality context system starting...');
  }

  // Add event listeners
  if (sendButton) {
    sendButton.addEventListener('click', (e) => {
      console.log('Send button clicked');
      e.preventDefault();
      sendMessage();
    });
  }

  if (messageInput) {
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        console.log('Enter key pressed');
        e.preventDefault();
        sendMessage();
      }
    });

    messageInput.addEventListener('input', () => {
      adjustTextareaHeight();
    });
  }

  if (micButton) {
    micButton.addEventListener('click', (e) => {
      console.log('Mic button clicked');
      e.preventDefault();
      toggleVoiceInput();
    });
  }

  if (cameraButton) {
    cameraButton.addEventListener('click', (e) => {
      e.preventDefault();
      toggleCamera();
    });
  }

  if (speakerButton) {
    speakerButton.addEventListener('click', (e) => {
      e.preventDefault();
      toggleSpeaker();
    });
  }

  // Cognitive Dashboard Event Listeners
  if (brainButton) {
    brainButton.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Brain button clicked');
      openCognitiveDashboard();
    });
  }

  if (closeDashboard) {
    closeDashboard.addEventListener('click', (e) => {
      e.preventDefault();
      closeCognitiveDashboard();
    });
  }

  // Close dashboard when clicking overlay
  if (dashboardOverlay) {
    dashboardOverlay.addEventListener('click', (e) => {
      if (e.target === dashboardOverlay) {
        closeCognitiveDashboard();
      }
    });
  }

  // Trigger camera when user says "use your eyes"
  if (messageInput) {
    messageInput.addEventListener('input', () => {
      const v = messageInput.value.toLowerCase();
      if (!cameraActive && v.includes('use your eyes')) {
        toggleCamera();
      }
    });
  }

  // Initialize voice recognition
  initVoiceRecognition();

  // Setup login form handlers
  setupLoginHandlers();

  // Check for morning greeting (only if authenticated)
  if (isAuthenticated) {
    checkMorningGreeting();
  }

  console.log('Splendor initialized successfully');
});

// Service Worker Registration
if ('serviceWorker' in navigator) {
  // Auto cache clearing system with version detection
  async function autoCheckAndClearCache() {
    try {
      console.log('🔄 Checking for version updates...');

      // Get current version from server
      const response = await fetch('/version');
      const data = await response.json();
      const currentVersion = data.version;

      // Update version display
      const versionElement = document.getElementById('versionInfo');
      if (versionElement) {
        versionElement.textContent = `v${currentVersion}`;
      }

      // Get stored version and last cache clear time
      const storedVersion = localStorage.getItem('splendor_version');
      const lastCacheCleared = localStorage.getItem('splendor_cache_cleared');
      const now = Date.now();

      console.log(`Current: v${currentVersion}, Stored: v${storedVersion || 'none'}`);

      // Check if we need to clear cache
      let shouldClearCache = false;
      let reason = '';

      // Version change detected
      if (storedVersion && storedVersion !== currentVersion) {
        shouldClearCache = true;
        reason = `version updated from v${storedVersion} to v${currentVersion}`;
      }

      // First run (no stored version)
      if (!storedVersion) {
        shouldClearCache = true;
        reason = 'first run - clearing any stale cache';
      }

      // 24-hour auto clear
      if (lastCacheCleared) {
        const hoursSinceLastClear = (now - parseInt(lastCacheCleared)) / (1000 * 60 * 60);
        if (hoursSinceLastClear > 24) {
          shouldClearCache = true;
          reason = 'scheduled 24-hour cache refresh';
        }
      }

      if (shouldClearCache) {
        console.log(`🧹 Auto-clearing cache: ${reason}`);

        // Preserve important user settings
        const preserveKeys = ['splendor_user_id', 'splendor_voice_preference', 'splendor_theme_preference'];
        const preserved = {};
        preserveKeys.forEach(key => {
          const value = localStorage.getItem(key);
          if (value) preserved[key] = value;
        });

        // Clear service worker caches
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          const messageChannel = new MessageChannel();
          navigator.serviceWorker.controller.postMessage(
            { type: 'CLEAR_CACHE' },
            [messageChannel.port2]
          );
        }

        // Clear storage but preserve user settings
        localStorage.clear();
        sessionStorage.clear();

        // Restore preserved settings
        Object.entries(preserved).forEach(([key, value]) => {
          localStorage.setItem(key, value);
        });

        // Update cache clear timestamp and version
        localStorage.setItem('splendor_version', currentVersion);
        localStorage.setItem('splendor_cache_cleared', now.toString());

        console.log('✅ Cache cleared automatically - fresh version loaded');

        // Silent reload if this was an automatic clear
        if (reason.includes('version updated') || reason.includes('first run')) {
          console.log('🔄 Reloading with fresh cache...');
          setTimeout(() => window.location.reload(true), 500);
          return;
        }
      } else {
        // No cache clear needed - just update stored version
        localStorage.setItem('splendor_version', currentVersion);
        console.log('✅ Version check complete - no cache clear needed');
      }

    } catch (error) {
      console.log('Version check failed - using fallback', error);
      const versionElement = document.getElementById('versionInfo');
      if (versionElement) {
        versionElement.textContent = 'v6.3.0+';
      }
    }
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });

    // Auto check cache and version on page load
    autoCheckAndClearCache();
  });
}

function setupLoginHandlers() {
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const toggleSignup = document.getElementById('toggleSignup');
  const toggleLogin = document.getElementById('toggleLogin');
  const loginStatus = document.getElementById('loginStatus');

  // Toggle between login and signup
  toggleSignup?.addEventListener('click', () => {
    loginForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
    loginStatus.textContent = '';
  });

  toggleLogin?.addEventListener('click', () => {
    signupForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
    loginStatus.textContent = '';
  });

  // Handle login
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    loginStatus.className = 'login-status';
    loginStatus.textContent = 'Signing in...';

    const result = await authenticateUser(username, password);

    if (result.success) {
      loginStatus.className = 'login-status success';
      loginStatus.textContent = 'Welcome back! Loading your consciousness...';

      setTimeout(() => {
        hideLoginModal();
        updateUserInfo();
        checkMorningGreeting();
      }, 1000);
    } else {
      loginStatus.className = 'login-status error';
      loginStatus.textContent = result.error;
    }
  });

  // Handle signup
  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('signupUsername').value;
    const password = document.getElementById('signupPassword').value;
    const displayName = document.getElementById('signupDisplayName').value;

    loginStatus.className = 'login-status';
    loginStatus.textContent = 'Creating your account...';

    const result = await createUser(username, password, displayName);

    if (result.success) {
      loginStatus.className = 'login-status success';
      loginStatus.textContent = 'Account created! Welcome to Splendor...';

      setTimeout(() => {
        hideLoginModal();
        updateUserInfo();
      }, 1000);
    } else {
      loginStatus.className = 'login-status error';
      loginStatus.textContent = result.error;
    }
  });
}