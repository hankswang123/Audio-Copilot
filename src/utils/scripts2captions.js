//import { audioScripts } from './audio_scripts.js';
/**
 * This function will generate the audioCaptions used by runtime
 * This will reduce the effort of manually creating the audioCaptions
 */
//import { audioScripts } from './audio_scripts/audio_scripts.js';
//import { audioScripts } from './audio_scripts.js';
/*
async function fetchKeywords({magzine} = {magzine: 'National_Geographic_Little_Kids_USA_-_November-December_2024'}) {
    const response = await fetch(`./play/${magzine}/keywords.txt`);
    const keywords = await response.text();
    return keywords;
}*/

// To fetch the scripts from the public folder
async function fetchAudioScripts({magzine} = {magzine: 'National_Geographic_Little_Kids_USA_-_November-December_2024'}) {
    const response = await fetch(`./play/${magzine}/${magzine}.txt`);
    const script = await response.text();
    return script;
}

// Function to transform the script into the desired format to be used as audioCaptions
//async function transformAudioScripts(script) {
export async function transformAudioScripts({magzine} = {magzine: 'National_Geographic_Little_Kids_USA_-_November-December_2024'}) {

    const script = await fetchAudioScripts({magzine});

    //const lines = script.trim().split('\n').filter(line => line.trim() !== '');
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
//export const audioCaptions = transformAudioScripts(audioScripts);
//const audio_scripts1 = fetchAudioScripts();
export const audioCaptions = await transformAudioScripts();

export const keywords = {
    "Zebra": [26, 56, 2],
    "Markhor": [58, 90, 4],
    "Snow Bird": [93, 127, 6],
    "Snowshoe Hare": [128, 164, 12],
    "Walrus": [166, 218, 18],
    "Venus": [220, 247, 20],
    "Mandrill": [252, 306, 24],
    "Mallard Ducks": [314, 360, 27],
    "Purple Sea Urchin": [356, 393, 34],
    "Penguin": [395, 438, 38],
    "Puffin": [440, 476, 42],
    "Polar Bear": [478, 525, 48],
  };

console.log(audioCaptions);

/*
Note that in client-side environments like web browsers, we recommend
using WebRTC instead. It is possible, however, to use the standard 
WebSocket interface in browser-like environments like Deno and 
Cloudflare Workers.
*/