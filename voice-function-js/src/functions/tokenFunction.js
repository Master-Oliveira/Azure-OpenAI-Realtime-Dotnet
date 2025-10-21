const { app } = require('@azure/functions');
const { DefaultAzureCredential } = require("@azure/identity");

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

app.http('token', {
    route: 'AzureOpenAI/token',
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
        context.log(`Http function processed request for url "${request.url}"`);
        const credential = new DefaultAzureCredential();
        const token = await credential.getToken("https://ai.azure.com/.default");
        return { body: token.token };
    }
});
