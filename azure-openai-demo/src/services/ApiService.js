// src/services/ApiService.js
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://backoffice-realtime-c2cpfcgkgfbpang0.swedencentral-01.azurewebsites.net';

export const createSession = async (voice) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/AzureOpenAI/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ Voice: voice })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create session - ${response.status}: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating session:', error);
    throw error;
  }
};

export const connectRTC = async (sdp, ephemeralKey, deploymentName, region) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/AzureOpenAI/rtc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        sdp, 
        ephemeralKey,
        deploymentName,
        region
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`RTC connect failed - ${response.status}: ${errorText}`);
    }

    return await response.text();
  } catch (error) {
    console.error('Error connecting RTC:', error);
    throw error;
  }
};