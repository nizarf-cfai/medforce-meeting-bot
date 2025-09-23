# Microsoft Graph API Teams Bot Setup Guide

## Prerequisites

1. **Azure AD App Registration** (you mentioned you already have this)
2. **Bot Framework Registration**
3. **Microsoft Graph API Permissions**

## Required Environment Variables

Create a `.env` file with the following variables:

```env
# Azure AD App Registration
MICROSOFT_APP_ID=your-app-id-here
MICROSOFT_APP_PASSWORD=your-app-password-here

# Bot Framework
BOT_ENDPOINT=https://your-bot-endpoint.ngrok.io

# Microsoft Graph API
GRAPH_TENANT_ID=your-tenant-id-here
GRAPH_CLIENT_ID=your-client-id-here
GRAPH_CLIENT_SECRET=your-client-secret-here

# Server Configuration
PORT=3000
```

## Required Microsoft Graph API Permissions

Your Azure AD app needs these permissions:

- `Calls.AccessMedia.All` - Access meeting audio/video streams
- `Calls.Initiate.All` - Initiate calls
- `Calls.JoinGroupCall.All` - Join group calls
- `Calls.JoinGroupCallAsGuest.All` - Join as guest
- `OnlineMeetings.ReadWrite.All` - Read/write meeting info
- `Chat.ReadWrite.All` - Access meeting chat

## Bot Framework Registration

1. Go to [Azure Bot Service](https://portal.azure.com/#create/Microsoft.AzureBot)
2. Create a new bot resource
3. Configure messaging endpoint: `https://your-domain.com/api/messages`
4. Enable Microsoft Teams channel

## Testing the Graph API Version

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the Graph API version:
   ```bash
   npm run build-graph
   ```

3. Start the Graph API server:
   ```bash
   npm run start-graph
   ```

4. Open: `http://localhost:3000/index-graph.html`

## Key Differences from ACS Version

- **Full Meeting Integration**: Bot joins as a trusted participant
- **Real Audio Access**: Can access actual meeting audio streams
- **Voice Responses**: Bot can speak and be heard in the meeting
- **Meeting Chat**: Can read and write to meeting chat
- **Real-time Transcription**: Processes actual meeting audio

## Next Steps

1. Configure your Azure AD app with the required permissions
2. Set up Bot Framework registration
3. Update the `.env` file with your credentials
4. Test the Graph API integration

