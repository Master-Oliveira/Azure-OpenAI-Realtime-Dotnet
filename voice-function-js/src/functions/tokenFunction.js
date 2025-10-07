const { app } = require('@azure/functions');
const { DefaultAzureCredential } = require("@azure/identity");

app.http('token', {
    route: 'AzureOpenAI/token',
    methods: ['GET', 'POST'],
    authLevel: 'Anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        const credential = new DefaultAzureCredential();

        const token = await credential.getToken("https://ai.azure.com/.default");

        return { body: token.token };
    }
});
