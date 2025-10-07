const { app } = require('@azure/functions');

const DIRECTLINE_URL = process.env.DIRECTLINE_URL;
const DIRECTLINE_SECRET_CHATBOTRN = process.env.DIRECTLINE_SECRET_CHATBOTRN;
const DIRECTLINE_SECRET_SANIACHAT = process.env.DIRECTLINE_SECRET_SANIACHAT;

const createDirectLineConversation = async(DIRECTLINE_URL, DIRECTLINE_SECRET) => {
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

// Token ChatbotRN
app.http('directLineConversation', {
    route: 'AzureOpenAI/chatbotrn/directLineConversation',
    methods: ['GET', 'POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}" to "${DIRECTLINE_URL}"`);
        const directLineConversationRef = await createDirectLineConversation(DIRECTLINE_URL, DIRECTLINE_SECRET_CHATBOTRN);
        const json = JSON.stringify(directLineConversationRef);
        return { body: json };
    }
});

// Token SanIAChat
app.http('directLineConversation', {
    route: 'AzureOpenAI/saniachat/directLineConversation',
    methods: ['GET', 'POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}" to "${DIRECTLINE_URL}"`);
        const directLineConversationRef = await createDirectLineConversation(DIRECTLINE_URL, DIRECTLINE_SECRET_SANIACHAT);
        const json = JSON.stringify(directLineConversationRef);
        return { body: json };
    }
});
