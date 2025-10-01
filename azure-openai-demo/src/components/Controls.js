// src/components/Controls.js
import React, { useState, useRef, useEffect } from 'react';
import { createSession, connectRTC } from '../services/ApiService';

const API_BASE_URL = process.env.REACT_APP_API_URL + '/api/AzureOpenAI' || 'https://backoffice-realtime-c2cpfcgkgfbpang0.swedencentral-01.azurewebsites.net/api/AzureOpenAI';
const DIRECTLINE_URL = process.env.REACT_APP_DIRECTLINE_URL || 'https://europe.directline.botframework.com/v3/directline';
const DIRECTLINE_SECRET = process.env.REACT_APP_DIRECTLINE_SECRET || '6Yr5uHyKYTE.GpDNA3KUY-DAL8nYwmmPBf0DaUwmib5hzMUcnUiut7g';

function Controls({ 
  isConnected, 
  setIsConnected, 
  updateStatus, 
  addLog, 
  settings, 
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
  
  const peerConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);
  const audioStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const sessionIdRef = useRef(null);
  const ephKeyRef = useRef(null);
  const webSocketRef = useRef(null);
  const directLineConversationRef = useRef(null);

  // For audio processing
  const audioContextRef = useRef(null);
  const audioBufferRef = useRef(null);
  
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

      // Create session
      const sessionResponse = await createSession(settings.voice);
      sessionIdRef.current = sessionResponse.id;
      ephKeyRef.current = sessionResponse.client_secret.value;

      // Store the system prompt from the backend response
      if (sessionResponse.system_prompt) {
        systemPromptRef.current = sessionResponse.system_prompt;
        addLog(`System prompt received (${systemPromptRef.current.length} chars)`);
      }
      
      addLog(`Session ID → ${sessionIdRef.current}`);
      
      // Initialize WebRTC
      await initializeWebRTC();

      // Create Direct Line conversation (Bot Framework)
      directLineConversationRef.current = await createDirectLineConversation();

      await initializeWebSocket(directLineConversationRef.current);

      // Request welcome message
      await requestWelcomeMessage(directLineConversationRef.current.conversationId);
      
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
              throw new Error(`Intent classification failed with ${response.status}`);
            }
            return response.json();
          })
    return response;
  }

  const requestWelcomeMessage = async (conversationId) => {
    const result = await fetch(`${DIRECTLINE_URL}/conversations/${conversationId}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DIRECTLINE_SECRET}` },
      body: JSON.stringify({ from: { id: '12345', name: 'usuario' }, name: 'requestWelcomeDialog', type: 'event', value: "{ canal:'voz', origen:'pruebas_microsoft_frontal'}" })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Welcome message request failed with ${response.status}`);
      }
      return response.json();
    })
    return result;
  }

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
            if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
              // Send the bot's response as user input to continue the voice conversation
              dataChannelRef.current.send(JSON.stringify({
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
              dataChannelRef.current.send(JSON.stringify({
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

  // Close data channel and peer connection
  if (dataChannelRef.current) {
    try {
      dataChannelRef.current.close();
    } catch (err) {
      // Ignore errors during cleanup
    }
    dataChannelRef.current = null;
  }
  
  if (peerConnectionRef.current) {
    try {
      peerConnectionRef.current.close();
    } catch (err) {
      // Ignore errors during cleanup
    }
    peerConnectionRef.current = null;
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

  const initializeWebRTC = async () => {
    peerConnectionRef.current = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    // Remote audio playback
    peerConnectionRef.current.addEventListener('track', ({ track }) => {
      if (track.kind !== 'audio') return;
      const audio = new Audio();
      audio.srcObject = new MediaStream([track]);
      audio.play();
    });

    // DataChannel
    dataChannelRef.current = peerConnectionRef.current.createDataChannel('realtime');
    dataChannelRef.current.onopen = handleDataChannelOpen;
    dataChannelRef.current.onclose = () => addLog('DataChannel closed');
    dataChannelRef.current.onerror = (e) => addLog(`DataChannel error: ${e}`);
    dataChannelRef.current.onmessage = handleDataChannelMessage;

    // Local audio
    await setupAudio();

    const offer = await peerConnectionRef.current.createOffer({ offerToReceiveAudio: true });
    await peerConnectionRef.current.setLocalDescription(offer);
    await waitForIceGathering();

    const rtcUrl = `https://${settings.region}.realtimeapi-preview.ai.azure.com/v1/realtimertc?model=${settings.deploymentName}`;
    addLog(`RTC URL → ${rtcUrl}`);

    const answerSdp = await connectRTC(
      peerConnectionRef.current.localDescription.sdp,
      ephKeyRef.current,
      settings.deploymentName,
      settings.region
    );

    await peerConnectionRef.current.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    addLog('✅ WebRTC connected');
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

    // add track to peer connection early (before negotiating)
    audioStreamRef.current.getAudioTracks().forEach(track => 
      peerConnectionRef.current.addTrack(track, audioStreamRef.current)
    );

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
      if (!isRecording || !dataChannelRef.current || dataChannelRef.current.readyState !== 'open') {
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
        dataChannelRef.current.send(JSON.stringify({
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
    
    if (dataChannelRef.current?.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
    }
  };

  const waitForIceGathering = () => {
    return new Promise((resolve) => {
      if (peerConnectionRef.current.iceGatheringState === 'complete') return resolve();
      const handler = () => {
        if (peerConnectionRef.current.iceGatheringState === 'complete') {
          peerConnectionRef.current.removeEventListener('icegatheringstatechange', handler);
          resolve();
        }
      };
      peerConnectionRef.current.addEventListener('icegatheringstatechange', handler);
      setTimeout(resolve, 7000); // failsafe
    });
  };

  const handleDataChannelOpen = () => {
    addLog('DataChannel open – sending session.update');
    updateStatus('Connected');

    console.log('HandleDataChannelOpen System prompt:', systemPromptRef.current);

    const cfg = {
      type: 'session.update',
      session: {
        instructions: systemPromptRef.current,
        modalities: ['audio', 'text'],
        input_audio_transcription: {
          model: 'whisper-1'
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.6,
          prefix_padding_ms: 500,
          silence_duration_ms: 1200,
          create_response: false // disabling auto-response so the response is only provided once the backend has returned data
        }
      }
    };
    dataChannelRef.current.send(JSON.stringify(cfg));
    startRecording();
  };

  const handleDataChannelMessage = ({ data }) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    addLog(`⬅ ${msg.type}`);

    switch (msg.type) {
      case 'session.created':
        break;

      case 'conversation.item.input_audio_transcription.completed':
        const transcript = msg.transcript ?? '';

        // Update both the ref and the state for the message history
        messageHistoryRef.current = [...messageHistoryRef.current, { sender: 'user', text: transcript }];

        // Add user message from speech transcription
        addMessage('user', transcript);

        // First use the LLM to determine if this is a statistical question where we need to call the query API in the backend, or just a general question where the LLM can respond directly
        if (dataChannelRef.current?.readyState === 'open') {
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