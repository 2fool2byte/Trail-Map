const path = require("node:path");
const express = require("express");
const SERVICE = "http://localhost:3301/classify";

const app = express();
const port = process.env.PORT || 3000;
const publicDirectory = path.join(__dirname, "public");

app.use(express.urlencoded({ extended: false }));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDirectory, "index.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(publicDirectory, "login.html"));
});

app.post("/login", async (req, res) => {
  try {
    const serviceResponse = await fetch(SERVICE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        email: req.body.email 
    }),
    });
    const result = await serviceResponse.json();
    console.log(result);

  } catch (error) {
    console.error("Could not reach the classification service:", error.message);
    return res.status(502).json({ error: "The classification service is unavailable." });
  }
});

app.use(express.static(publicDirectory));

app.listen(port, () => {
  console.log(`Northstar demo server running at http://localhost:${port}`);
});