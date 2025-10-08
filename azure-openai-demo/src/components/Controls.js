// src/components/Controls.js
import { useState, useRef, useEffect } from 'react';
import { generateToken } from '../services/ApiService';

const DIRECTLINE_URL = process.env.REACT_APP_DIRECTLINE_URL || 'https://europe.directline.botframework.com/v3/directline';
const DIRECTLINE_SECRET = process.env.REACT_APP_DIRECTLINE_SECRET || '6Yr5uHyKYTE.GpDNA3KUY-DAL8nYwmmPBf0DaUwmib5hzMUcnUiut7g';

function Controls({ 
  isConnected, 
  setIsConnected, 
  updateStatus, 
  addLog, 
  addMessage, 
  updateAssistantMessage, 
  setCurrentTranscript,
  currentTranscript,
  status,
  messages
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [directLineActivities, setDirectLineActivities] = useState([]);
  const messageHistoryRef = useRef([]);
  
  const audioStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const webSocketRef = useRef(null);
  const webSocketVoiceRef = useRef(null);
  const directLineConversationRef = useRef(null);

  // For audio processing
  const audioContextRef = useRef(null);
  const audioBufferRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingAudioRef = useRef(false);
  const currentAudioSourceRef = useRef(null);
  
  // Initialize audio context safely
  useEffect(() => {
    return () => {
    // Cleanup when component unmounts
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
        audioContextRef.current = null;
      } catch (err) {
        console.error("Error closing audio context:", err);
      }
    }
  };
}, []);

  const startConversation = async () => {
    try {
      updateStatus('Initializing…');

      // Generate token
      const token = await generateToken();

      // Initialize WebSocket connection for Voice Live API
      await initializeWebSocketVoice(token);

      // Create Direct Line conversation (Bot Framework)
      directLineConversationRef.current = await createDirectLineConversation();

      await initializeWebSocket(directLineConversationRef.current);

      

      setIsConnected(true);
    } catch (err) {
      addLog(`❌ ${err.message}`);
      updateStatus('Failed');
    }
  };

  const createDirectLineConversation = async() => {
    const response = await fetch(`${DIRECTLINE_URL}/conversations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DIRECTLINE_SECRET}` }
          })
          .then(response => {
            if (!response.ok) {
              throw new Error(`Get conversation failed with ${response.status}`);
            }
            return response.json();
          })
    return response;
  }

  const requestWelcomeMessage = async (conversationId) => {
    const raw = "{\n    \"from\": {\n        \"id\": \"12345\",\n        \"name\": \"usuario\"\n    },\n    \"name\": \"requestWelcomeDialog\",\n    \"type\": \"event\",\n    \"value\": '{\"canal\": \"voz\", \"origen\": \"pruebas_microsoft_frontal\"}'\n}";

    const requestOptions = {
      method: "POST",
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DIRECTLINE_SECRET}` },
      body: raw,
      redirect: "follow"
    };

    const result = await fetch(`${DIRECTLINE_URL}/conversations/${conversationId}/activities`, requestOptions)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Welcome message request failed with ${response.status}`);
      }
      return response.json();
    })
    return result;
  }

  const initializeWebSocketVoice = async (token) => {
    const resource = "aisa-macae-ujyrbtzcb57v";

    webSocketVoiceRef.current = new WebSocket(`wss://${resource}.services.ai.azure.com/voice-live/realtime?api-version=2025-10-01&model=gpt-4.1-mini&Authorization=Bearer ${token}`);
    addLog(`Connecting WebSocket Voice Live conversation`);

    webSocketVoiceRef.current.onopen = () => {
      addLog('WebSocket Voice connected');
      handleDataChannelOpen();
    }
      
    webSocketVoiceRef.current.onmessage = (event) => {
      handleDataChannelMessage(event);
    };
    webSocketVoiceRef.current.onerror = (error) => {
      addLog(`❌ WebSocket Voice error: ${error.message}`);
    };
    webSocketVoiceRef.current.onclose = () => addLog('WebSocket Voice disconnected');
    
    // Local audio
    await setupAudio();
  };

  const initializeWebSocket = async (directLineConversation) => {
    webSocketRef.current = new WebSocket(directLineConversation.streamUrl);
    addLog(`Connecting WebSocket conversation: ${directLineConversation.conversationId}`);

    webSocketRef.current.onopen = () => addLog('WebSocket connected');
    webSocketRef.current.onmessage = (event) => {
      handleWebSocketMessage(event);
    };
    webSocketRef.current.onclose = () => addLog('WebSocket disconnected');
  };

  const handleWebSocketMessage = (event) => {
    try {
      // Parse the Direct Line WebSocket message
      const data = JSON.parse(event.data);
      
      if (data.activities && Array.isArray(data.activities)) {
        // Store all activities
        setDirectLineActivities(data.activities);
        
        // Find the last message from the bot (not from user)
        const botMessages = data.activities.filter(activity => 
          activity.from && 
          activity.from.id !== '12345' && // Filter out user messages (user ID we use)
          activity.type === 'message' && 
          activity.text
        );
        
        if (botMessages.length > 0) {
          const lastBotMessage = botMessages[botMessages.length - 1];
          addLog(`📨 Bot message received: ${lastBotMessage.text}`);

          if (lastBotMessage.text.trim().length > 0) {
            // Send the bot's response to the voice conversation if WebRTC is connected
            if (webSocketVoiceRef.current && webSocketVoiceRef.current.readyState === WebSocket.OPEN) {
              // Send the bot's response as user input to continue the voice conversation
              webSocketVoiceRef.current.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'message',
                  role: 'user',
                  content: [
                    {
                      type: 'input_text',
                      text: lastBotMessage.text
                    }
                  ]
                }
              }));

              // Request a response
              webSocketVoiceRef.current.send(JSON.stringify({
                type: 'response.create',
                response: {
                  conversation: 'none'
                }
              }));

            }
            
          }
        }
      }
    } catch (error) {
      addLog(`❌ Error parsing WebSocket message: ${error.message}`);
      console.error('WebSocket message parsing error:', error);
    }
  }

  // Add a ref to store the system prompt
  const systemPromptRef = useRef(null);

  const stopConversation = () => {
  stopRecording();

    // Close WebSocket connection
    if (webSocketRef.current) {
      try {
        webSocketRef.current.close();
      } catch (err) {
        // Ignore errors during cleanup
      }
      webSocketRef.current = null;
    }

    // Close WebSocket connection
    if (webSocketVoiceRef.current) {
      try {
        webSocketVoiceRef.current.close();
      } catch (err) {
        // Ignore errors during cleanup
      }
      webSocketVoiceRef.current = null;
    }

  // Stop audio tracks
  if (audioStreamRef.current) {
    audioStreamRef.current.getTracks().forEach(t => t.stop());
    audioStreamRef.current = null;
  }
  
  // Close audio context last
  if (audioContextRef.current) {
    try {
      audioContextRef.current.close();
      audioContextRef.current = null;
      addLog('✅ Audio context closed');
    } catch (err) {
      addLog(`❌ Error closing audio context: ${err.message}`);
    }
  }
  
  mediaRecorderRef.current = null;
  setIsRecording(false);
  setIsConnected(false);
  updateStatus('Disconnected');
};

  const setupAudio = async () => {
    // Get audio with specific constraints for 24kHz compatibility with Azure
    audioStreamRef.current = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        channelCount: 1,       // Mono
        sampleRate: 24000,     // 24kHz as required by Azure
        echoCancellation: true,
        noiseSuppression: true,
      } 
    });

    // We'll still use webm/opus for recording as it's more efficient
    // but we'll convert to PCM before sending to Azure
    mediaRecorderRef.current = new MediaRecorder(audioStreamRef.current, { 
      mimeType: 'audio/webm;codecs=opus', 
      audioBitsPerSecond: 64000 
    });
  };

  const startRecording = () => {
  if (!mediaRecorderRef.current || isRecording) return;
  
  setIsRecording(true);
  mediaRecorderRef.current.start(100); // 100 ms chunks
  updateStatus('Recording');
  
  // Set up the audio processor with better error handling
  setupAudioProcessor().then(processor => {
    if (processor) {
      if (audioBufferRef.current) {
        // Clear any existing processor first
        clearInterval(audioBufferRef.current);
      }
      audioBufferRef.current = processor;
    }
  }).catch(err => {
    addLog(`❌ Failed to set up audio processor: ${err.message}`);
  });
  
  // For debugging purposes
  mediaRecorderRef.current.ondataavailable = async (evt) => {
    if (evt.data.size === 0) return;
    if (evt.data.size > 1000) addLog(`Audio chunk size: ${evt.data.size}`);
  };
};
  
  // Helper function to convert ArrayBuffer to base64
  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const setupAudioProcessor = async () => {
  try {
    // Create a new AudioContext if none exists or if the current one is closed
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      addLog('✅ Created new AudioContext');
    } else if (audioContextRef.current.state === 'suspended') {
      // Resume context if it's suspended
      await audioContextRef.current.resume();
      addLog('✅ Resumed AudioContext');
    }
    
    // Create the audio processing pipeline
    const source = audioContextRef.current.createMediaStreamSource(audioStreamRef.current);
    
    // Create an analyzer for PCM data
    const analyzer = audioContextRef.current.createAnalyser();
    analyzer.fftSize = 2048;
    source.connect(analyzer);
    
    // Process function to convert and send audio data
    const pcmProcessor = () => {
      if (!webSocketVoiceRef.current || webSocketVoiceRef.current.readyState !== WebSocket.OPEN) {
        return;
      }
      
      const dataArray = new Float32Array(analyzer.fftSize);
      analyzer.getFloatTimeDomainData(dataArray);
      
      // Convert Float32 to Int16 PCM
      const pcmData = new Int16Array(dataArray.length);
      for (let i = 0; i < dataArray.length; i++) {
        const s = Math.max(-1, Math.min(1, dataArray[i]));
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      // Convert to base64 for sending
      const base64 = arrayBufferToBase64(pcmData.buffer);
      
      // Send to Azure OpenAI
      try {
        webSocketVoiceRef.current.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64
        }));
      } catch (err) {
        addLog(`❌ Error sending audio data: ${err.message}`);
      }
    };
    
    // Process audio at regular intervals (100ms)
    const interval = setInterval(pcmProcessor, 100);
    addLog('✅ Audio processor set up successfully');
    return interval;
  } catch (error) {
    addLog(`❌ Audio processor setup error: ${error.message}`);
    return null;
  }
};

  const stopRecording = () => {
    if (!isRecording) return;
    setIsRecording(false);
    mediaRecorderRef.current.stop();
    updateStatus('Stopped recording');
    
    // Clear the audio processor interval
    if (audioBufferRef.current) {
      clearInterval(audioBufferRef.current);
      audioBufferRef.current = null;
    }
    
    if (webSocketVoiceRef.current?.readyState === WebSocket.OPEN) {
      webSocketVoiceRef.current.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
    }
  };

  const handleDataChannelOpen = async () => {
    addLog('DataChannel voice open – sending session.update');
    updateStatus('Connected');

    systemPromptRef.current = "You are a service just reads messages exactly as they are sent to you. When you receive a message, just repeat it back exactly as it is, without any changes or additional commentary. \
                If the message is empty or contains only whitespace, do not respond. \
                Do not add any extra text or explanations. Just return the message as it is."

    console.log('HandleDataChannelOpen Voice System prompt:', systemPromptRef.current);

    const cfg = {
            type: "session.update",
            session: {
                instructions: systemPromptRef.current,
                modalities: ['audio', 'text'],
                input_audio_transcription: {
                  model: 'whisper-1'
                },
                voice:{
                  name: 'es-ES-ElviraNeural',
                  type: "azure-standard",
                  temperature: 0.5
                },
                input_audio_echo_cancellation: {type: "server_echo_cancellation"},
                turn_detection: {
                  type: 'server_vad',
                  threshold: 0.6,
                  prefix_padding_ms: 500,
                  silence_duration_ms: 1200,
                  create_response: false // disabling auto-response so the response is only provided once the backend has returned data
                }
            }
        };
    webSocketVoiceRef.current.send(JSON.stringify(cfg));
    startRecording();

    // Request welcome message
    await requestWelcomeMessage(directLineConversationRef.current.conversationId);
  };

 // Enhanced audio playback with queuing
const playAudioChunk = async (audioBuffer) => {
  try {
    // Ensure we have an audio context
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }
    
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    
    // Add to queue
    audioQueueRef.current.push(audioBuffer);
    
    // Process queue if not already playing
    if (!isPlayingAudioRef.current) {
      processAudioQueue();
    }
    
  } catch (error) {
    addLog(`❌ Error queuing audio chunk: ${error.message}`);
  }
};

const processAudioQueue = async () => {
  if (audioQueueRef.current.length === 0) {
    isPlayingAudioRef.current = false;
    return;
  }
  
  isPlayingAudioRef.current = true;
  const audioBuffer = audioQueueRef.current.shift();
  
  try {
    // Convert the raw PCM data to AudioBuffer
    const audioData = new Int16Array(audioBuffer);
    const audioBufferNode = audioContextRef.current.createBuffer(
      1,                          // mono channel
      audioData.length,           // length in samples
      24000                       // sample rate (24kHz for Azure OpenAI)
    );
    
    // Convert Int16 PCM to Float32 for Web Audio API
    const channelData = audioBufferNode.getChannelData(0);
    for (let i = 0; i < audioData.length; i++) {
      channelData[i] = audioData[i] / 32768.0; // Convert to [-1, 1] range
    }
    
    // Create and play the audio
    const source = audioContextRef.current.createBufferSource();
    currentAudioSourceRef.current = source;
    source.buffer = audioBufferNode;
    source.connect(audioContextRef.current.destination);
    
    // When this chunk finishes, process the next one
    source.onended = () => {
      currentAudioSourceRef.current = null;
      processAudioQueue();
    };
    
    source.start();
    
  } catch (error) {
    addLog(`❌ Error playing audio chunk: ${error.message}`);
    isPlayingAudioRef.current = false;
    processAudioQueue(); // Try next chunk
  }
};

// Function to stop current audio playback
const stopCurrentAudio = () => {
  if (currentAudioSourceRef.current) {
    try {
      currentAudioSourceRef.current.stop();
      currentAudioSourceRef.current = null;
    } catch (error) {
      // Ignore errors when stopping
    }
  }
  
  // Clear the queue
  audioQueueRef.current = [];
  isPlayingAudioRef.current = false;
};

  const handleDataChannelMessage = ({ data }) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    addLog(`⬅ ${msg.type}`);

    switch (msg.type) {
      case 'session.created':
        break;
      
      case 'input_audio_buffer.speech_started':
        // Stop current audio playback when user starts speaking
        stopCurrentAudio();
        addLog('🎤 User started speaking - stopping audio playback');
        break;

      case 'response.audio.delta':
        if (msg.delta) {
          try {
            // Decode base64 audio data
            const audioData = atob(msg.delta);
            const audioArray = new Uint8Array(audioData.length);
            for (let i = 0; i < audioData.length; i++) {
              audioArray[i] = audioData.charCodeAt(i);
            }
            
            // Convert to PCM audio and play
            playAudioChunk(audioArray.buffer);
          } catch (error) {
            addLog(`❌ Error processing audio delta: ${error.message}`);
          }
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        const transcript = msg.transcript ?? '';

        // Update both the ref and the state for the message history
        messageHistoryRef.current = [...messageHistoryRef.current, { sender: 'user', text: transcript }];

        // Add user message from speech transcription
        addMessage('user', transcript);

        // Send the user message to Direct Line for bot processing
        if (webSocketVoiceRef.current?.readyState === WebSocket.OPEN) {
          setCurrentTranscript('Analyzing question...');

          console.log("Messages array length: ", messageHistoryRef.current.length);
          console.log("Message array content:", JSON.stringify(messageHistoryRef.current));

          // make a call to AOAI to classify the intent of the question
          fetch(`${DIRECTLINE_URL}/conversations/${directLineConversationRef.current.conversationId}/activities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json','Authorization': `Bearer ${DIRECTLINE_SECRET}` },
            body: JSON.stringify({ from: { id: '12345', name: 'usuario' }, type: 'message', text: transcript })
          })
          .then(response => {
            if (!response.ok) {
              throw new Error(`Bot invocation ${response.status}`);
            }
            return response.json();
          })
          .then(data => {
            console.log("Direct Line response data:", data);
          })
          
        }
      break;
          
      case 'response.created':
        // Reset transcript when a response starts
        setCurrentTranscript('');
        break;

      case 'response.text_delta':
      case 'response.delta': // newer schema
        // Accumulate delta updates to the current transcript
        if (msg.delta?.text) {
          updateAssistantMessage(msg.delta.text);
        } else if (msg.delta?.content) {
          updateAssistantMessage(msg.delta.content);
        }
        break;

      case 'response.output_item.done':
        if (msg.item?.content[0]?.transcript) {
          // Each completed item is a full assistant response bubble
          const transcript = msg.item.content[0].transcript;
          addLog(`Assistant response received: ${transcript.substring(0, 20)}...`);
          addMessage('assistant', transcript);

          // Update both the ref and the state
          messageHistoryRef.current = [...messageHistoryRef.current, { sender: 'assistant', text: transcript }];
          //setLocalMessageHistory(messageHistoryRef.current);

          console.log("Assistant response added to history, new length:", messageHistoryRef.current.length);
          console.log("Full message history:", JSON.stringify(messageHistoryRef.current));

          // Clear current transcript placeholder after adding to history
          setCurrentTranscript('');
        }
        break;
      case 'response.done':
        // Response fully completed; nothing to accumulate as bubbles already added
        // Ensure placeholder is cleared
        setCurrentTranscript('');
        break;

      case 'response.completed':
        // Response fully completed; nothing to accumulate as bubbles already added
        // Ensure placeholder is cleared
        setCurrentTranscript('');
        break;

      case 'error':
        console.error('Error message from server:', msg.error);
        addLog(`❌ ${msg.error?.message || 'Unknown error'}`);
        updateStatus(`Error: ${msg.error?.message || ''}`);
        break;

      default:
        // other event types ignored
    }
  };

  return (
    <div className="controls">
      <button 
        onClick={startConversation} 
        disabled={isConnected}
      >
        {isRecording && <span className="recording-indicator"></span>}
        Start Conversation
      </button>
      <button 
        onClick={stopConversation} 
        disabled={!isConnected}
      >
        End Conversation
      </button>
      <span className="status-indicator">{status}</span>
    </div>
  );
}

export default Controls;