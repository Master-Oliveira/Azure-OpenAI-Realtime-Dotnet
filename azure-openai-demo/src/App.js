// App.js
import { useState } from 'react';
import ChatWindow from './components/ChatWindow';
import Controls from './components/Controls';
import Logs from './components/Logs';
import './App.css';

function App() {
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState('Idle');
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [currentTranscript, setCurrentTranscript] = useState('');

  const addLog = (msg) => {
    const ts = new Date().toLocaleTimeString();
    setLogs(prevLogs => [...prevLogs, `[${ts}] ${msg}`]);
  };

  const updateStatus = (msg) => {
    setStatus(msg);
    addLog(`Status → ${msg}`);
  };

  const addMessage = (sender, text = '') => {
    // Only add messages with actual content
    if (text && text.trim()) {
      console.log(`Adding ${sender} message to history`);
      addLog(`Adding ${sender} message to history`);
      setMessages(prevMessages => [...prevMessages, { sender, text }]);
    }
  };

  const updateAssistantMessage = (delta) => {
  // Append incoming delta to current transcript
  setCurrentTranscript(prev => prev + delta);
  };

  return (
    <div className="container">
      <h1>Azure Voice Live Demo</h1>
      
      <ChatWindow 
        messages={messages} 
        currentTranscript={currentTranscript} 
      />
      
      <Controls 
        isConnected={isConnected}
        setIsConnected={setIsConnected}
        updateStatus={updateStatus}
        addLog={addLog}
        addMessage={addMessage}
        updateAssistantMessage={updateAssistantMessage}
        setCurrentTranscript={setCurrentTranscript}
        currentTranscript={currentTranscript}
        status={status}
        messages={messages}
      />

      <Logs logs={logs} />
    </div>
  );
}

export default App;