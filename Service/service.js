const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const { choice, TypeSafeClient } = require("@typesafe-ai/sdk");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

if (!process.env.TYPESAFE_API_KEY && process.env.APIKEY) {
  process.env.TYPESAFE_API_KEY = process.env.APIKEY;
}

const MODEL = process.env.TYPESAFE_MODEL || "jev-latest";
const app = express();
const port = process.env.SERVICEPORT || 3301;

app.use(express.json());

async function classifyEndpointPath(endpointPath) {
  const client = new TypeSafeClient({ defaultModel: MODEL });
  const result = await client.systemOne({
    state: { endpointPath },
    questions: {
      endpoint_sensitivity: choice(
        "Does the endpoint path suggest access to sensitive data or a protected resource?",
        {
          suspicious:
            "A path segment suggests credentials, sensitive information, verification, authentication, internal/private resources, or an API. Examples include password, token, secret, ssn, auth, verify, internal, private, and api. Match without regard to letter case. login is ALWAYS considered not_suspicious.",
          not_suspicious:
            "No path segment suggests credentials, sensitive information, verification, authentication, internal/private resources, or an API. but login is considered not suspicious.",
        },
      ),
    },
  });

  const decision = result.answers.endpoint_sensitivity?.choice;
  if (decision !== "suspicious" && decision !== "not_suspicious") {
    throw new Error("Jev returned an unrecognized endpoint classification.");
  }

  return (`${decision}, ${result.answers.endpoint_sensitivity?.confidence}`);
}

app.post("/classify", async (req, res) => {
  console.log("Received request log:", req.body);
  const { endpointPath } = req.body || {};
  if (typeof endpointPath !== "string" || endpointPath.length === 0) {
    return res.status(400).json({ error: "endpointPath must be a non-empty string." });
  }

  if (!process.env.TYPESAFE_API_KEY) {
    console.error("Classification failed: TYPESAFE_API_KEY is not configured.");
    return res.status(500).json({ error: "The classification service is not configured." });
  }

  try {
    const decision = await classifyEndpointPath(endpointPath);
    return res.status(200).json({ decision });
  } catch (error) {
    console.error("Endpoint path classification failed:", error.message);
    return res.status(502).json({ error: "Could not classify the endpoint path." });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
