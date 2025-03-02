/**
 * Running this service by node server.js will start the server on port 3001
 * The server will listen for requests to /api/serp/news and fetch news articles from Google News using the SERPAPI API
 * The server will listen for requests to /api/serp/videos and fetch videos from YouTube using the SERPAPI API
 * The server will listen for requests to /api/recraft/image and generate an image based on a given word using the recraft.ai API
 * The server will listen for requests to /api/session and return the contents of a REST API request to a protected endpoint
 */
import 'dotenv/config'; // Auto-loads environment variables
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { OpenAI } from "openai";
import jwt from 'jsonwebtoken';
import WebSocket from "ws";

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

// Call SERPAPI API to fetch news articles from google news
app.get("/api/serp/news", async (req, res) => {
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

// Call SERPAPI API to fetch videos from youtube
app.get("/api/serp/videos", async (req, res) => {
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

// Call deepseek API to chat
app.get("/api/deepseek/chat", async (req, res) => {
    try {
        console.log('deepseek chat is called');
        const { q } = req.query;

        const deepseek = new OpenAI({
            baseURL: process.env.DEEPSEEK_BASE_URL,
            apiKey: process.env.DEEPSEEK_API_KEY, 
            });

        const response = await deepseek.chat.completions.create(  {  
            model: 'deepseek-chat',  
            messages: [
                { role: 'system', content: '你是一个百科全书，用有趣的方式回答用户提出的各种问题.' },
                { role: 'user', content: q},
            ],
        });

        console.log(response.choices[0].message.content);

        res.json(response.choices[0].message.content);  
    } catch (error) {
        console.error("Detailed error:", error);
        res.status(600).json({ error: 'Failed to get response from deepseek', details: error.message });
    }
});

//Deepseek: Generate Prompt for word card image generation
const promptGen_ds = async (word) => { 
    try{
        const deepseek = new OpenAI({
            baseURL: process.env.DEEPSEEK_BASE_URL,
            apiKey: process.env.DEEPSEEK_API_KEY, 
            });

        const response = await deepseek.chat.completions.create(  {  
            model: 'deepseek-chat',  
            messages: [
                { role: 'system', content: 'Create a detailed and imaginative prompt for image generation based on a given word using simple English words as much as possible instead of complicated ones within 4 sentences and 100 words . If the given word is a noun, describe its scenario clearly. If it is a non-noun word, use your imagination to depict a vivid scene or concept related to the word.' },
                { role: 'user', content: word },
            ],
        });

        return response.choices[0].message.content;  
    }catch(error){
        console.error('Error generating prompt by deepseek:', error);
        return null;
    }
}

//Generate Prompt for word card image generation
const promptGen = async (word) => { 
    try{
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY, 
            });

        const response = await openai.chat.completions.create(  {  
            model: 'gpt-4o',  
            messages: [
                { role: 'system', content: 'Create a detailed and imaginative prompt for image generation based on a given word using simple English words as much as possible instead of complicated ones within 4 sentences and 100 words . If the given word is a noun, describe its scenario clearly. If it is a non-noun word, use your imagination to depict a vivid scene or concept related to the word.' },
                { role: 'user', content: word },
            ],
            max_tokens: 100,
            temperature: 0.7,
        });

        return response.choices[0].message.content;  
    }catch(error){
        console.error('Error generating prompt:', error);
        return null;
    }
}

// Call recraft.ai API to generate image based on the word
app.get("/api/audio/check", async (req, res) => {
    const { magzine, word } = req.query;

    try {
        // dirPath = path.join(__dirname, `public/wordCard/${magzine}`);
        const dirPath = path.join(__dirname, `public/play/${magzine}`);
        const audioPath = path.join(dirPath, `${magzine}.wav`);
        const scriptPath = path.join(dirPath, 'audio_scripts.txt');
        const keywordsPath = path.join(dirPath, 'keywords.txt');

        // Check if the audio file already exists
        if (fs.existsSync(audioPath)&&fs.existsSync(scriptPath)&&fs.existsSync(keywordsPath)) {
            res.json({audioExisting: 'true', scriptExisting: 'true', keywordsExisting: 'true'});
        } else if(fs.existsSync(audioPath)&&fs.existsSync(scriptPath)){
            res.json({audioExisting: 'true', scriptExisting: 'true', keywordsExisting: 'false'});
        }
        else if(fs.existsSync(audioPath)&&fs.existsSync(keywordsPath)){ 
            res.json({audioExisting: 'true', scriptExisting: 'false', keywordsExisting: 'true'});   
        }
        else if(fs.existsSync(audioPath)){ 
            res.json({audioExisting: 'true', scriptExisting: 'false', keywordsExisting: 'false'});                        
        } else{res.json({audioExisting: 'false'});}

    } catch(error) {
        console.error('Error checking audio file:', error);
        res.status(500).json({ 
            error: 'Failed to check audio file existance', 
            details: error.message 
        });
    }     
});

let imgURLCache = [];
const hasKey = (key) => imgURLCache.some(obj => obj.hasOwnProperty(key));
const getValueByKey = (key) => {
  const obj = imgURLCache.find(obj => obj.hasOwnProperty(key));
  return obj ? obj[key] : undefined;
};
const addKeyValuePair = (key, value) => {
  const newObj = {};
  newObj[key] = value;
  imgURLCache.push(newObj);
};

// Call recraft.ai API to generate image based on the provided prompt
app.get("/api/recraft/image_prompt", async (req, res) => {
    const { magzine, word } = req.query;

    try {

        // 3. Image is not existing neither in public/wordCard nor in src/wordCard
        // Generate the image using recraft.ai API and return the real image URL in recraft.ai
        const finalPrompt = word; 

        const apikey = process.env.RECRAFT_API_KEY;
        if (!apikey) {
            throw new Error("recraft API key is not set");
        }         

        const recraft = new OpenAI({
            baseURL: process.env.RECRAFT_BASE_URL,
            apiKey: apikey,
        });               

        const imgRes = await recraft.images.generate({
            model: 'recraft20b',
            prompt: finalPrompt,
            style: 'digital_illustration',
            extra_body: {'substyle': 'hand_drawn'},
        }); 

        const imgUrl = imgRes.data[0].url;
        console.log('Image URL from recraft: ', imgUrl);

        res.json({imgURL: imgUrl, prompt: `${finalPrompt}`});

    } catch(error) {
        console.error('Error generating image:', error);
        res.status(500).json({ 
            error: 'Failed to generate Image from recraft.ai', 
            details: error.message 
        });
    }     
});

// Call recraft.ai API to generate image based on the word
app.get("/api/recraft/image", async (req, res) => {
    const { magzine, word } = req.query;

    try {
        // dirPath = path.join(__dirname, `public/wordCard/${magzine}`);
        const dirPath = path.join(__dirname, `public/wordCard`);
        const imgPath = path.join(dirPath, `${word}.png`);        
        const promptPath = path.join(dirPath, `${word}.txt`);

        const dirPath1 = path.join(__dirname, `src/wordCard`);
        const imgPath1 = path.join(dirPath1, `${word}.png`);        
        const promptPath1 = path.join(dirPath1, `${word}.txt`);                

        // Ensure the directory exists
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        //const prompt = await promptGen(word); 
        // 1. Check if the Image already downloaded in public/wordCard folder
        if (fs.existsSync(imgPath)) {
            if(fs.existsSync(promptPath)){
                const savedPrompt = await fs.promises.readFile(promptPath, 'utf-8');
                res.json({imgURL: `/wordCard/${word}.png`, prompt: `${savedPrompt}`});
            }else{
                const addPrompt = await promptGen(word); 
                await fs.promises.writeFile(promptPath1, addPrompt);
                res.json({imgURL: `/wordCard/${word}.png`, prompt: `${addPrompt}`});
            }            
            return;
        }

        // 2. Check if the Image already downloaded in src/wordCard folder
        // src/wordCard is the temp working folder for image generation
        // The images will be moved to public/wordCard folder when next 'npm start'
        if (fs.existsSync(imgPath1)) {
            if(fs.existsSync(promptPath1)){
                const savedPrompt = await fs.promises.readFile(promptPath1, 'utf-8');
                //read image URL from cache
                const imgURL1 = getValueByKey(word);
                if(imgURL1){
                    res.json({imgURL: imgURL1, prompt: `${savedPrompt}`});
                }
            }else{
                const addPrompt = await promptGen(word); 
                await fs.promises.writeFile(promptPath1, addPrompt);
                const imgURL1 = getValueByKey(word);
                if(imgURL1){
                    res.json({imgURL: imgURL1, prompt: `${addPrompt}`});
                }
            }            
            return;
        }        

        // 3. Image is not existing neither in public/wordCard nor in src/wordCard
        // Generate the image using recraft.ai API and return the real image URL in recraft.ai
        const prompt = await promptGen(word); 
        //const prompt = await promptGen_ds(word); 
        console.log('generted prompt by openAI:', prompt);
        //console.log('generted prompt by deepseek:', prompt);

        const apikey = process.env.RECRAFT_API_KEY;
        if (!apikey) {
            throw new Error("recraft API key is not set");
        }         

        const recraft = new OpenAI({
            baseURL: process.env.RECRAFT_BASE_URL,
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
        console.log('Image URL from recraft: ', imgUrl);
        //write image URL to cache
        addKeyValuePair(word, imgUrl);

        // Download the image and save it to src/wordCard folder to avoid Refresh issue!!!
        const imgResponse = await axios.get(imgUrl, { responseType: 'arraybuffer' });
        await fs.promises.writeFile(imgPath1, imgResponse.data);
        console.log('Image downloaded to: ', imgPath1);
        await fs.promises.writeFile(promptPath1, finalPrompt);
        console.log('Prompt saved to: ', promptPath1);

        res.json({imgURL: imgUrl, prompt: `${finalPrompt}`});

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

// An endpoint which would return jwt token for zhipu api caling
app.get("/api/zhipu/jwt", async (req, res) => {
    const zhipu_api_key = process.env.ZHIPUAI_API_KEY;
    const [id, secret] = zhipu_api_key.split(".");
    const payload = {
      api_key: id,
      exp: Math.floor(Date.now() / 1000) + 600,
      timestamp: Date.now(),
    };
  
    const token = jwt.sign(payload, secret, { algorithm: "HS256" });
    res.send(token);   
  });  

// An endpoint which would return jwt token for zhipu api caling
app.get("/api/zhipu/rt", async (req, res) => {
    const url = "wss://open.bigmodel.cn/api/paas/v4/realtime";
    const ws = new WebSocket(url, {
      headers: {
        "Authorization": "Bearer " + process.env.ZHIPUAI_API_KEY,
      },
    });
    
    ws.on("open", function open() {
      console.log("Connected to server.");
    });
    
    ws.on("message", function incoming(message) {
      console.log(message);
    });  
  });   

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
