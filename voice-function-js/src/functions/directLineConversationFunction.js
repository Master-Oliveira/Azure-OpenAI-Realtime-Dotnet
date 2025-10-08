const { app } = require('@azure/functions');

const DIRECTLINE_URL = process.env.DIRECTLINE_URL;
const DIRECTLINE_SECRET_CHATBOTRN = process.env.DIRECTLINE_SECRET_CHATBOTRN;
const DIRECTLINE_SECRET_SANIACHAT = process.env.DIRECTLINE_SECRET_SANIACHAT;

const ALLOWED_ORIGINS = new Set([
    "https://portal.azure.com",
    "https://pre.sania.chat",
    "http://localhost:4200",
    "https://www.sanitas.es",
    "https://misanitasapp",
    "https://appmisanitas",
    "https://digital.dev.eks.sanitas.dom",
    "https://digital.test.eks.sanitas.dom",
    "https://bo.digital.test.eks.sanitas.dom"
]);

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
app.http('directLineChatConversation', {
    route: 'AzureOpenAI/chatbotrn/directLineConversation',
    methods: ['GET', 'POST'],
    authLevel: 'Anonymous',
    handler: async (request, context) => {
        const origin = request.headers.get("origin") || request.headers.get("referer") || "";
        if (![...ALLOWED_ORIGINS].some(o => origin.startsWith(o))) {
            context.log(`Blocked request from disallowed origin: ${origin}`);
            return {
                status: 403,
                body: "Forbidden: origin not allowed"
            };
        }
        context.log(`Http function processed request for url "${request.url}" to "${DIRECTLINE_URL}"`);
        const directLineConversationRef = await createDirectLineConversation(DIRECTLINE_URL, DIRECTLINE_SECRET_CHATBOTRN);
        const json = JSON.stringify(directLineConversationRef);
        return { body: json };
    }
});

// Token SanIAChat
app.http('directLineSaniaConversation', {
    route: 'AzureOpenAI/saniachat/directLineConversation',
    methods: ['GET', 'POST'],
    authLevel: 'Anonymous',
    handler: async (request, context) => {
        const origin = request.headers.get("origin") || request.headers.get("referer") || "";
        if (![...ALLOWED_ORIGINS].some(o => origin.startsWith(o))) {
            context.log(`Blocked request from disallowed origin: ${origin}`);
            return {
                status: 403,
                body: "Forbidden: origin not allowed"
            };
        }
        context.log(`Http function processed request for url "${request.url}" to "${DIRECTLINE_URL}"`);
        const directLineConversationRef = await createDirectLineConversation(DIRECTLINE_URL, DIRECTLINE_SECRET_SANIACHAT);
        const json = JSON.stringify(directLineConversationRef);
        return { body: json };
    }
});
