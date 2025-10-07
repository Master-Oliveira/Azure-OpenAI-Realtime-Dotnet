const { app } = require('@azure/functions');

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

const DIRECTLINE_URL = process.env.DIRECTLINE_URL;
const DIRECTLINE_SECRET = process.env.DIRECTLINE_SECRET;

app.http('directLineConversation', {
    route: 'AzureOpenAI/directLineConversation',
    methods: ['GET', 'POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        const DIRECTLINE_URL = process.env.DIRECTLINE_URL;
        context.log(`Http function processed request for url "${request.url}" to "${DIRECTLINE_URL}"`);
      
        const directLineConversationRef = await createDirectLineConversation();

        // Request welcome message
        // await requestWelcomeMessage(directLineConversationRef.conversationId);
        const json = JSON.stringify(directLineConversationRef);
        return { body: json };
    }
});

