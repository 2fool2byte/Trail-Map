const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");

const classifyUrl = "http://localhost:3301/classify";

async function classifyEndpoint(endpointPath) {
  const requestLog = {
    timestamp: new Date().toISOString(),
    requesterIP: "127.0.0.1",
    method: "POST",
    endpointPath,
  };

  const response = await fetch(classifyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestLog),
  });
  const contentType = response.headers.get("content-type") || "";
  const responseBody = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  console.log(`\nPOST ${classifyUrl} -> ${response.status}`);
  console.log("Classification:", responseBody);

  if (!response.ok) {
    throw new Error(`Classification service returned HTTP ${response.status}`);
  }
}

async function main() {
  const prompt = readline.createInterface({
    input: stdin,
    output: stdout,
    prompt: "Endpoint path: ",
  });

  try {
    console.log("Enter an endpoint path to classify (for example, /api/private/token).");
    console.log("Press Enter on an empty line to quit.");

    prompt.prompt();
    for await (const line of prompt) {
      const input = line.trim();
      if (!input) {
        break;
      }

      if (input.includes("://")) {
        console.error("Enter a path, not a full URL.");
        continue;
      }

      const endpointPath = input.startsWith("/") ? input : `/${input}`;
      try {
        await classifyEndpoint(endpointPath);
      } catch (error) {
        console.error(`Could not classify "${endpointPath}":`, error.message);
      }

      prompt.prompt();
    }
  } finally {
    prompt.close();
  }
}

main().catch((error) => {
  console.error("CLI failed:", error.message);
  process.exitCode = 1;
});
