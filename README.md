# Audio Copilot
Audio Copilot enables the interaction with content during playback on-going. It will help transform the passive listening into an interactive, engaging and real-time experience. It can understand the on-going playback intelligently and be ready for user’s query at any time. 

## Features/Tests TBD
- Logic to generate new Assistant ID when the existing assistant expires
- Test [WebRTC API Integration](https://platform.openai.com/docs/guides/realtime-webrtc)
- Model settings, e.g. voice to be used, before launching a conversation
- Launch two realtime api instants to talk with each other to implment the NotebookLM audio overview effect
- Test more features of different models in OpenAI

## Functions implemented
- Audio Copilot. ( Key feature: Interrupt the on-going playback and ask for questions by integrating [OpenAI Realtime API](https://openai.com/index/introducing-the-realtime-api/) )
- Chatbot integrated to ask question by typing with communicating GPT-4o by [Assistant API](https://platform.openai.com/docs/assistants/overview)
- Control the player by voice commands. e.g. 'stop', 'resume'...
- Search News by google integrated by [SERPAPI](https://serpapi.com/search-api)
- Search Videos by youtube.com integrated by [SERPAPI](https://serpapi.com/search-api)

## An Education Scenario which Audio Copilot could help 
### Whole process
- Step 1 - Preapre the PDF file from [National Geographic Little Kids](https://magazinelib.com/?s=national+geographic+little+kids)
- Step 2 - Generate the podcast by uploading PDF to [NotebookLM](https://notebooklm.google.com/)
- Step 3 - Generate the scripts by uplodading podcast to [Fireflies](https://app.fireflies.ai/)
- Step 4 - User could engage an dicussion by Audio Copilot during listening podcast and reading the magzine.

<img src="/readme/audio-copilot.png" width="800" />

This idea is implemented based on [OpenAI Realtime Console](https://github.com/openai/openai-realtime-console)<br>
## Issues solved
- put 'fnm env --use-on-cd | Out-String | Invoke-Expression' to 'C:\Users\<YourUsername>\Documents\WindowsPowerShell\profile.ps1' to avoid run this command each time before 'npm start'
- install 'concurrently' as dependency to start the 'server.js' and react app(react-scripts start) are started together
- `RealtimeClient.updateSession({ modalities: ['text', 'voice'] });` will lead to other setting not working, e.g. voice, function calling