const path = require("node:path");
const express = require("express");
const SERVICE = "http://localhost:3301/classify";

const app = express();
const port = process.env.PORT || 3000;
const publicDirectory = path.join(__dirname, "public");

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

async function pleaseAnalyze(logData) {
  console.log("Sending log data to classification service:", logData);

  const serviceResponse = await fetch(SERVICE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(logData),
  });

  if (!serviceResponse.ok) {
    throw new Error(`Classification service returned HTTP ${serviceResponse.status}`);
  }

  return serviceResponse.json();
}

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDirectory, "index.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(publicDirectory, "login.html"));
});

app.post("/login", async (req, res) => {
    console.log("Received login request");
  const requestLog = {
    timestamp: new Date().toISOString(),
    requesterIP: req.ip,
    method: req.method,
    endpointPath: req.path,
  };

  try {
    const serviceResponse = await pleaseAnalyze(requestLog);
    console.log("Service response from classification service:", serviceResponse);
    //return res.status(200).json(serviceResponse);
  } catch (error) {
    console.error("Could not classify the login request:", error.message);
    return res.status(502).json({ error: "The classification service is unavailable." });
  }
});

app.use(express.static(publicDirectory));

app.listen(port, () => {
  console.log(`Northstar demo server running at http://localhost:${port}`);
});