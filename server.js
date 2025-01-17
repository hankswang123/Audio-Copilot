/**
 * Running this service by node server.js will start the server on port 3001
 * The server will listen for requests to /api/news and fetch news articles from Google News using the SERPAPI API
 */
import 'dotenv/config'; // Auto-loads environment variables
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { OpenAI } from "openai";

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
//Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001; 

// CORS settings
app.use(cors({
    origin: ['http://localhost:3000', 'https://hankswang123.github.io/Audio-Copilot/'], // React app URL
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

app.get("/api/news", async (req, res) => {
    try {
        const { q } = req.query;
        const apikey = process.env.SERPAPI_API_KEY;

        if (!apikey) {
            throw new Error("SERPAPI API key is not set");
        }

        const response = await axios.get('https://serpapi.com/search', {
            params: {
                engine: "google_news",
                q,
                gl: "us",
                hl: "en",
                api_key: apikey
            }
        });

        const newsResults = response.data.news_results;
        res.json(newsResults);
    } catch (error) {
        console.error("Detailed error:", error);
        res.status(500).json({ error: 'Failed to fetch news', details: error.message });
    }
});

app.get("/api/videos", async (req, res) => {
    try {
        const { q } = req.query;
        const apikey = process.env.SERPAPI_API_KEY;

        if (!apikey) {
            throw new Error("SERPAPI API key is not set");
        }

        const response = await axios.get('https://serpapi.com/search', {
            params: {
                engine: "youtube",
                search_query: q,
                api_key: apikey
            }
        });

        //const videoResults = response.data.news_results;
        //console.log(response);
        const videoResults = response.data.video_results;
        console.log("Video results:");
        console.log(videoResults);
        res.json(videoResults);
    } catch (error) {
        console.error("Detailed error:", error);
        res.status(600).json({ error: 'Failed to fetch videos from youtube', details: error.message });
    }
});

//Generate Prompt for word card image generation
const promptGen = async (word) => { 
    try{
        const openai = new OpenAI({
            //model: 'gpt-4o',
            apiKey: process.env.OPENAI_API_KEY, 
            });

        const response = await openai.chat.completions.create(  {  
            model: 'gpt-4o',  
            messages: [
            { role: 'system', content: 'Create a detailed and imaginative prompt for image generation based on a given word. If the word is a noun, describe its scenario clearly. If it is a non-noun word, use your imagination to depict a vivid scene or concept related to the word.' },
            { role: 'user', content: word },
            ],
            max_tokens: 70,
            temperature: 0.7,
        });

        return response.choices[0].message.content;  
    }catch(error){
        console.error('Error generating prompt:', error);
        return null;
    }
}

// Generate image from recraft.ai
// used by word card
app.get("/api/image_gen", async (req, res) => {

    //const { magzine, word, prompt } = req.query;
    const { magzine, word } = req.query;

    try{

        const dirPath = path.join(__dirname, `public/wordCard/${magzine}`);
        const filePath = path.join(dirPath, `${word}.png`);        

        // Ensure the directory exists
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        // Check if the file already exists
        if (fs.existsSync(filePath)) {
            res.json(`/wordCard/${magzine}/${word}.png`);
            return;
        }        

        const prompt = await promptGen(word); 
        console.log('generted prompt by openAI:', prompt);

        const apikey = process.env.RECRAFT_API_KEY;
        if (!apikey) {
            throw new Error("recraft API key is not set");
        }         

        //since recraft API is openAI compitable, just use recraft's URL and apiKey
        const recraft = new OpenAI({
            baseURL: process.env.RECRAFT_API_URL,
            //baseURL: 'https://external.api.recraft.ai/v1/',
            apiKey: apikey,
        });               
        
        if(!prompt){
            prompt = word;
        }

        // https://www.recraft.ai/docs#generate-image
        const imgRes = await recraft.images.generate( {
            // prompt: 'a sunny park where people are smiling and greeting each other, creating a very friendly atomosphere',
            model: 'recraft20b',
            prompt: prompt, //'a bright eye with starry sky reflected in the pupil, appearing mysterious and deep',
            style: 'digital_illustration',
            extra_body: {'substyle': 'hand_drawn'}, // https://www.recraft.ai/docs#list-of-styles
            //style: 'vector_illustration',
            //style: 'icon',        
        }); 
        res.json(imgRes.data[0].url);
        
        // Save the PNG file to the desired directory        
        // TBD(issue): whole page will be refreshed after image is downloaded
        /*
        const writer = fs.createWriteStream(filePath);
        const imgUrl = imgRes.data[0].url;
        const imgResponse = await axios.get(imgUrl, { responseType: 'stream', maxRedirects: 0 });
        imgResponse.data.pipe(writer);        

        writer.on('finish', () => {
            console.info('Image downloaded successfully');
            res.json(`/wordCard/${magzine}/${word}.png`);
        });

        writer.on('error', (error) => {
            console.error('Error saving PGN file from Recraft:', error);
            res.status(500).json({ error: error.message });
        });     */         
        
      }catch(error){
        console.error('Error generating image:', error);
        res.status(600).json({ error: 'Failed to generate Image from recraft.ai', details: error.message });
      }     
});

// An endpoint which would work with the client code above - it returns
// the contents of a REST API request to this protected endpoint
app.get("/api/session", async (req, res) => {
    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-realtime-preview-2024-12-17",
        voice: "verse",
      }),
    });
    const data = await r.json();
  
    // Send back the JSON we received from the OpenAI REST API
    res.send(data);
  });

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
