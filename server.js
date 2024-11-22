/**
 * Running this service by node server.js will start the server on port 3001
 * The server will listen for requests to /api/news and fetch news articles from Google News using the SERPAPI API
 */
import 'dotenv/config'; // Auto-loads environment variables
import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
const port = process.env.PORT || 3001;

// CORS settings
app.use(cors({
    origin: ['http://localhost:3000', 'https://hankswang123.github.io/'], // React app URL
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

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
