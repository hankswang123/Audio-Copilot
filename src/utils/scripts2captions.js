//import { audioScripts } from './audio_scripts.js';
/**
 * This function will generate the audioCaptions used by runtime
 * This will reduce the effort of manually creating the audioCaptions
 */
//import { audioScripts } from './audio_scripts/audio_scripts.js';
import { audioScripts } from './audio_scripts.js';

// Function to transform the script into the desired format to be used as audioCaptions
function transformAudioScripts(script) {
    const lines = script.trim().split('\n').filter(line => line.trim() !== '');

    const audioCaptions = [];
    let currentTime = 0;

    lines.forEach(line => {
        // Match timestamp and ignore speaker
        const timeMatch = line.match(/(\d{2}):(\d{2})/);
        if (timeMatch) {
            // Convert MM:SS to total seconds
            const minutes = parseInt(timeMatch[1], 10);
            const seconds = parseInt(timeMatch[2], 10);
            currentTime = minutes * 60 + seconds;
        } else {
            // Process line as text
            const text = line.trim();
            if (text) {
                audioCaptions.push({ time: currentTime, text });
            }
        }
    });

    return audioCaptions;
}

// Transform the audioScripts to desired audioCaptions format
export const audioCaptions = transformAudioScripts(audioScripts);
/*
export const keywords = [
    {"Zebra": 26},
    {"Snow Bird": 96},
];*/

export const keywords = {
    "Zebra": [26, 56, 2],
    "Markhor": [58, 90, 4],
    "Snow Bird": [93, 127, 6],
    "Snowshoe Hare": [128, 164, 12],
    "Walrus": [166, 218, 18],
    "Venus": [220, 247, 20],
    "Mandrill": [252, 306, 24],
  };

console.log(audioCaptions);

/*
Note that in client-side environments like web browsers, we recommend
using WebRTC instead. It is possible, however, to use the standard 
WebSocket interface in browser-like environments like Deno and 
Cloudflare Workers.
*/