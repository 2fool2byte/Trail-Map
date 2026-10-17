const API_URL = "https://api.typesafe.ai/v1/systemone";
const MODEL = process.env.TYPESAFE_MODEL || "jev-latest";

const express = require("express");

const app = express();
const port = process.env.SERVICEPORT || 3301;

app.use(express.json());

app.post("/classify", (req, res) => {
  let decision = "";
  async function analyzeRequest({ method, path, body }) {
    const apiKey = process.env.APIKEY;

    if (!apiKey) {
      throw new Error("API key is not configured");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
  }

  res.status(200).json({
    success: true,
    received: decision,
  });

});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});