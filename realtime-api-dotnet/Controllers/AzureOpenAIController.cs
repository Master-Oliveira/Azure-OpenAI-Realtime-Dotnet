using Microsoft.AspNetCore.Mvc;
using System.Text;
using System.Text.Json;
using Azure.Identity;

namespace realtime_api_dotnet.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AzureOpenAIController : ControllerBase
{
    private readonly IConfiguration _configuration;
    private readonly HttpClient _httpClient;
    private readonly ILogger<AzureOpenAIController> _logger;

    public AzureOpenAIController(
        IConfiguration configuration,
        HttpClient httpClient, 
        ILogger<AzureOpenAIController> logger)
    {
        _configuration = configuration;
        _httpClient = httpClient;
        _logger = logger;
    }

    [HttpGet("token")]
    public IActionResult GetToken()
    {
        var credential = new DefaultAzureCredential();

        var token = credential.GetToken(new Azure.Core.TokenRequestContext(new[] { "https://ai.azure.com/.default" })).Token;

        return Ok(token);
    }

    [HttpPost("sessions")]
    public async Task<IActionResult> CreateSession([FromBody] SessionRequest request)
    {
        var resourceName = _configuration["AzureOpenAI:ResourceName"];
        var realtimeDeploymentName = _configuration["AzureOpenAI:RealtimeDeploymentName"];
        var apiVersion = _configuration["AzureOpenAI:ApiVersion"];

        var sessionsUrl = $"https://{resourceName}.openai.azure.com/openai/realtimeapi/sessions?api-version={apiVersion}";

        var body = new
        {
            model = realtimeDeploymentName,
            voice = request.Voice,
            instructions = request.SystemPrompt
        };

        var content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");

        var credential = new DefaultAzureCredential();
        
        _httpClient.DefaultRequestHeaders.Clear();
        _httpClient.DefaultRequestHeaders.Add("authorization", $"Bearer {credential.GetToken(new Azure.Core.TokenRequestContext(new[] { "https://cognitiveservices.azure.com/.default" })).Token}");
        
        var response = await _httpClient.PostAsync(sessionsUrl, content);
        
        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync();
            _logger.LogError($"Failed to create session: {response.StatusCode}, {error}");
            return StatusCode((int)response.StatusCode, error);
        }

        var sessionResponse = await response.Content.ReadAsStringAsync();

        var jsonResponse = JsonDocument.Parse(sessionResponse).RootElement;

        // include the system prompt in the response so the front end receives it
        var enhancedResponse = new
        {
            id = jsonResponse.GetProperty("id").GetString(),
            client_secret = jsonResponse.GetProperty("client_secret"),
            system_prompt = request.SystemPrompt
        };

        return Ok(JsonSerializer.Serialize(enhancedResponse));
    }

    [HttpPost("rtc")]
    public async Task<IActionResult> ConnectRTC([FromBody] RTCRequest request)
    {
        var rtcUrl = $"https://{request.Region}.realtimeapi-preview.ai.azure.com/v1/realtimertc?model={request.DeploymentName}";

        // Create HttpContent with application/sdp without charset parameter
        var content = new StringContent(request.Sdp);
        content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/sdp");

        _httpClient.DefaultRequestHeaders.Clear();
        _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {request.EphemeralKey}");

        var response = await _httpClient.PostAsync(rtcUrl, content);

        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync();
            _logger.LogError($"RTC connect failed: {response.StatusCode}, {error}");
            return StatusCode((int)response.StatusCode, error);
        }

        var answerSdp = await response.Content.ReadAsStringAsync();
        return Content(answerSdp, "application/sdp");
    }

    public class ChatMessageDto
    {
        public string Sender { get; set; }
        public string Text { get; set; }
    }

    public class QueryRequest
    {
        public string Query { get; set; }

        public List<ChatMessageDto> Messages { get; set; } = new List<ChatMessageDto>();
    }
}