import { BotFrameworkAdapter, TurnContext } from 'botbuilder';
import { TeamsActivityHandler } from 'botbuilder-adapter-teams';
import { Client } from '@microsoft/microsoft-graph-client';
import { AuthenticationProvider } from '@microsoft/microsoft-graph-client';
import dotenv from 'dotenv';

dotenv.config();

// Custom authentication provider for Microsoft Graph
class CustomAuthenticationProvider {
  constructor(accessToken) {
    this.accessToken = accessToken;
  }

  async getAccessToken() {
    return this.accessToken;
  }
}

// Teams Bot for Microsoft Graph API integration
class TeamsGraphBot extends TeamsActivityHandler {
  constructor() {
    super();
    
    // Initialize Microsoft Graph client
    this.graphClient = null;
    this.currentCall = null;
    this.isInCall = false;
    
    // Handle when bot is added to a team
    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded;
      for (let member of membersAdded) {
        if (member.id !== context.activity.recipient.id) {
          await context.sendActivity('Hello! I\'m the Teams meeting bot. I can join meetings and provide audio transcription!');
        }
      }
      await next();
    });

    // Handle when bot receives a message
    this.onMessage(async (context, next) => {
      const message = context.activity.text.toLowerCase();
      
      if (message.includes('join meeting')) {
        await this.handleJoinMeeting(context);
      } else if (message.includes('leave meeting')) {
        await this.handleLeaveMeeting(context);
      } else if (message.includes('test voice')) {
        await this.handleTestVoice(context);
      } else if (message.includes('start transcription')) {
        await this.handleStartTranscription(context);
      } else {
        await context.sendActivity('I can help you with meeting operations. Try saying "join meeting", "test voice", or "start transcription".');
      }
      
      await next();
    });

    // Handle call events
    this.onCall(async (context, next) => {
      const callEvent = context.activity.value;
      
      switch (callEvent.eventType) {
        case 'callStarted':
          await this.handleCallStarted(context, callEvent);
          break;
        case 'callEnded':
          await this.handleCallEnded(context, callEvent);
          break;
        case 'mediaStreamStarted':
          await this.handleMediaStreamStarted(context, callEvent);
          break;
        case 'mediaStreamStopped':
          await this.handleMediaStreamStopped(context, callEvent);
          break;
      }
      
      await next();
    });
  }

  // Initialize Microsoft Graph client with access token
  async initializeGraphClient(accessToken) {
    const authProvider = new CustomAuthenticationProvider(accessToken);
    this.graphClient = Client.initWithMiddleware({ authProvider });
  }

  // Handle join meeting request
  async handleJoinMeeting(context) {
    try {
      await context.sendActivity('🤖 Attempting to join the meeting...');
      
      // Get meeting link from message or use a default
      const meetingLink = this.extractMeetingLink(context.activity.text);
      
      if (!meetingLink) {
        await context.sendActivity('❌ Please provide a Teams meeting link. Example: "join meeting https://teams.microsoft.com/l/meetup-join/..."');
        return;
      }

      // Join the meeting using Microsoft Graph API
      await this.joinMeetingWithGraph(meetingLink);
      
      await context.sendActivity('✅ Successfully joined the meeting! I can now provide audio transcription and voice responses.');
      
    } catch (error) {
      console.error('Error joining meeting:', error);
      await context.sendActivity(`❌ Failed to join meeting: ${error.message}`);
    }
  }

  // Extract meeting link from message
  extractMeetingLink(text) {
    const meetingLinkRegex = /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s]+/;
    const match = text.match(meetingLinkRegex);
    return match ? match[0] : null;
  }

  // Join meeting using Microsoft Graph API
  async joinMeetingWithGraph(meetingLink) {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized. Please provide access token.');
    }

    try {
      // Create a call to join the meeting
      const call = {
        '@odata.type': '#microsoft.graph.call',
        'callbackUri': `${process.env.BOT_ENDPOINT}/api/calls`,
        'requestedModalities': ['audio'],
        'mediaConfig': {
          '@odata.type': '#microsoft.graph.serviceHostedMediaConfig'
        },
        'chatInfo': {
          '@odata.type': '#microsoft.graph.chatInfo',
          'threadId': this.extractThreadId(meetingLink),
          'messageId': '0'
        },
        'meetingInfo': {
          '@odata.type': '#microsoft.graph.joinMeetingIdMeetingInfo',
          'joinMeetingId': this.extractMeetingId(meetingLink),
          'passcode': null
        }
      };

      // Make the call
      this.currentCall = await this.graphClient.api('/communications/calls').post(call);
      this.isInCall = true;
      
      console.log('Successfully joined meeting via Graph API:', this.currentCall.id);
      
    } catch (error) {
      console.error('Error joining meeting with Graph API:', error);
      throw error;
    }
  }

  // Extract thread ID from meeting link
  extractThreadId(meetingLink) {
    // This is a simplified extraction - in practice, you'd need more robust parsing
    const url = new URL(meetingLink);
    const pathParts = url.pathname.split('/');
    return pathParts[pathParts.length - 1] || 'default-thread';
  }

  // Extract meeting ID from meeting link
  extractMeetingId(meetingLink) {
    // This is a simplified extraction - in practice, you'd need more robust parsing
    const url = new URL(meetingLink);
    const pathParts = url.pathname.split('/');
    return pathParts[pathParts.length - 1] || 'default-meeting';
  }

  // Handle call started event
  async handleCallStarted(context, callEvent) {
    console.log('Call started:', callEvent);
    
    // Play welcome message when bot joins
    await this.playWelcomeMessage();
    
    // Start audio transcription
    await this.startAudioTranscription();
  }

  // Handle call ended event
  async handleCallEnded(context, callEvent) {
    console.log('Call ended:', callEvent);
    this.isInCall = false;
    this.currentCall = null;
  }

  // Handle media stream started
  async handleMediaStreamStarted(context, callEvent) {
    console.log('Media stream started:', callEvent);
    // Start processing audio for transcription
  }

  // Handle media stream stopped
  async handleMediaStreamStopped(context, callEvent) {
    console.log('Media stream stopped:', callEvent);
    // Stop processing audio
  }

  // Play welcome message when bot joins
  async playWelcomeMessage() {
    if (!this.currentCall) return;
    
    try {
      // Create a play prompt action
      const playPromptAction = {
        '@odata.type': '#microsoft.graph.playPrompt',
        'prompts': [
          {
            '@odata.type': '#microsoft.graph.mediaPrompt',
            'mediaInfo': {
              '@odata.type': '#microsoft.graph.mediaInfo',
              'uri': this.createTTSAudioUri('Hello everyone! I am the meeting bot. I can provide audio transcription and voice responses.'),
              'resourceId': null
            }
          }
        ]
      };

      // Execute the play prompt
      await this.graphClient.api(`/communications/calls/${this.currentCall.id}/playPrompt`).post(playPromptAction);
      
      console.log('Welcome message played successfully');
      
    } catch (error) {
      console.error('Error playing welcome message:', error);
    }
  }

  // Create TTS audio URI (simplified - in practice, you'd use Azure Cognitive Services)
  createTTSAudioUri(text) {
    // This is a placeholder - you'd need to implement actual TTS
    // For now, we'll use a simple approach
    return `data:audio/wav;base64,${Buffer.from(text).toString('base64')}`;
  }

  // Start audio transcription
  async startAudioTranscription() {
    if (!this.currentCall) return;
    
    try {
      // Subscribe to media streams for transcription
      const subscribeToTone = {
        '@odata.type': '#microsoft.graph.subscribeToTone',
        'clientContext': 'transcription-client'
      };

      await this.graphClient.api(`/communications/calls/${this.currentCall.id}/subscribeToTone`).post(subscribeToTone);
      
      console.log('Audio transcription started');
      
    } catch (error) {
      console.error('Error starting audio transcription:', error);
    }
  }

  // Handle test voice request
  async handleTestVoice(context) {
    if (!this.isInCall) {
      await context.sendActivity('❌ Please join a meeting first before testing voice.');
      return;
    }

    try {
      await this.playWelcomeMessage();
      await context.sendActivity('🎤 Voice test completed! Check if you can hear the bot in the meeting.');
    } catch (error) {
      console.error('Error testing voice:', error);
      await context.sendActivity(`❌ Voice test failed: ${error.message}`);
    }
  }

  // Handle start transcription request
  async handleStartTranscription(context) {
    if (!this.isInCall) {
      await context.sendActivity('❌ Please join a meeting first before starting transcription.');
      return;
    }

    try {
      await this.startAudioTranscription();
      await context.sendActivity('✅ Audio transcription started! I will now transcribe the meeting audio.');
    } catch (error) {
      console.error('Error starting transcription:', error);
      await context.sendActivity(`❌ Failed to start transcription: ${error.message}`);
    }
  }

  // Handle leave meeting request
  async handleLeaveMeeting(context) {
    if (!this.isInCall) {
      await context.sendActivity('❌ Not currently in a meeting.');
      return;
    }

    try {
      // Terminate the call
      await this.graphClient.api(`/communications/calls/${this.currentCall.id}`).delete();
      
      this.isInCall = false;
      this.currentCall = null;
      
      await context.sendActivity('✅ Successfully left the meeting.');
      
    } catch (error) {
      console.error('Error leaving meeting:', error);
      await context.sendActivity(`❌ Failed to leave meeting: ${error.message}`);
    }
  }
}

export default TeamsGraphBot;

