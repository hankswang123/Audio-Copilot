/**
 * This fetch_scripts logic does not work yet when json is indicated as the response_format
 */
import 'dotenv/config'; // Auto-loads environment variables
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

// Set your OpenAI API key
const OPENAI_API_KEY =  process.env.OPENAI_API_KEY;

// Define the path to your audio file
//const audioFilePath = './audio/ngl_sep_lite.mp3';
const audioFilePath = './ngl_sep_lite.mp3';

// Function to transcribe audio using OpenAI Whisper API
async function transcribeAudio() {
    // Read the audio file
    const audioFile = fs.createReadStream(audioFilePath);

    // Create a FormData object and append the audio file
    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('model', 'whisper-1'); // Specify the Whisper model
    //formData.append('response_format', 'text'); // Options: 'text', 'json', or 'srt'
    formData.append('response_format', 'json'); // Request JSON format for timestamps

    try {
        // Send the request to OpenAI Whisper API
        const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
            headers: {
                ...formData.getHeaders(),
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            }
        });

        // Print the transcription
        //console.log('Transcription:', response.data);

        // Format transcription into the two desired structures

        // 1. Single String Format with Timestamped Lines (audioScripts format)
        const audioScripts = response.data.segments
            .map(segment => {
                const minutes = Math.floor(segment.start / 60).toString().padStart(2, '0');
                const seconds = Math.floor(segment.start % 60).toString().padStart(2, '0');
                return `${minutes}:${seconds}\n ${segment.text}`;
            })
            .join('\n\n');

        console.log("AudioScripts Format:\n", audioScripts);

        // 2. Captions Array Format with time in seconds (audioCaptions format)
        const audioCaptions = response.data.segments.map(segment => ({
            time: Math.round(segment.start), // Start time in seconds
            text: segment.text
        }));

        console.log("\nAudioCaptions Array Format:\n", JSON.stringify(audioCaptions, null, 2));

    } catch (error) {
        // Handle any errors
        console.error('API Kye:', OPENAI_API_KEY);
        console.error('Error transcribing audio:', error.response ? error.response.data : error.message);
    }
}

// Run the transcription function
transcribeAudio();
