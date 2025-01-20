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
    const { magzine, word } = req.query;

    try {
        // dirPath = path.join(__dirname, `public/wordCard/${magzine}`);
        const dirPath = path.join(__dirname, `public/wordCard`);
        const filePath = path.join(dirPath, `${word}.png`);        

        // Ensure the directory exists
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        // Check if the file already exists
        if (fs.existsSync(filePath)) {
            //res.json(`/wordCard/${magzine}/${word}.png`);
            res.json(`/wordCard/${word}.png`);
            return;
        }        

        const prompt = await promptGen(word); 
        console.log('generted prompt by openAI:', prompt);

        const apikey = process.env.RECRAFT_API_KEY;
        if (!apikey) {
            throw new Error("recraft API key is not set");
        }         

        const recraft = new OpenAI({
            baseURL: process.env.RECRAFT_API_URL,
            apiKey: apikey,
        });               

        const finalPrompt = prompt || word;

        const imgRes = await recraft.images.generate({
            model: 'recraft20b',
            prompt: finalPrompt,
            style: 'digital_illustration',
            extra_body: {'substyle': 'hand_drawn'},
        }); 

        const imgUrl = imgRes.data[0].url;
        const imgResponse = await axios.get(imgUrl, { responseType: 'arraybuffer' });
        await fs.promises.writeFile(filePath, imgResponse.data);
        //res.json(`/wordCard/${magzine}/${word}.png`);        
        res.json(`/wordCard/${word}.png`);        

        // 使用 Promise 处理图片下载
        /*
        await new Promise(async (resolve, reject) => {
            try {
                const imgUrl = imgRes.data[0].url;
                const imgResponse = await axios.get(imgUrl, { 
                    responseType: 'stream',
                    maxRedirects: 0 
                });

                const writer = fs.createWriteStream(filePath);
                
                writer.on('finish', resolve);
                writer.on('error', reject);
                
                imgResponse.data.pipe(writer);
            } catch (error) {
                reject(error);
            }
        });

        // 图片保存完成后再发送响应
        console.info('Image downloaded successfully');
        res.setHeader('Content-Type', 'application/json');
        res.json(`/wordCard/${magzine}/${word}.png`);*/

    } catch(error) {
        console.error('Error generating image:', error);
        res.status(500).json({ 
            error: 'Failed to generate Image from recraft.ai', 
            details: error.message 
        });
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
