import 'dotenv/config'; // Auto-loads environment variables
import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
const port = process.env.PORT || 3001;

// CORS settings
app.use(cors({
    origin: 'http://localhost:3000', // React app URL
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

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
