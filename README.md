# Audio Copilot
Audio Copilot enables the interaction with content during playback on-going. It will help transform the passive listening into an interactive, engaging and real-time experience. It can understand the on-going playback intelligently and be ready for user’s query at any time. 

## Functions implemented
- Audio Copilot. ( Key feature: Interrupt the on-going playback and ask for questions by integrating [OpenAI Realtime API](https://openai.com/index/introducing-the-realtime-api/) )
- Control the player by voice commands. e.g. 'stop', 'resume'...
- Search News by google integrated by SERPAPI

## An Education Scenario which Audio Copilot could help 
### Whole process
- Step 1 - Preapre the PDF file from [National Geographic Little Kids](https://magazinelib.com/?s=national+geographic+little+kids)
- Step 2 - Generate the podcast by uploading PDF to [NotebookLM](https://notebooklm.google.com/)
- Step 3 - Generate the scripts by uplodading podcast to [Fireflies](https://app.fireflies.ai/)
- Step 4 - User could engage an dicussion by Audio Copilot during listening podcast and reading the magzine.

<img src="/readme/audio-copilot.png" width="800" />

This idea is implemented based on [OpenAI Realtime Console](https://github.com/openai/openai-realtime-console)