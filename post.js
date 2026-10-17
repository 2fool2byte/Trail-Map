const classifyUrl = "http://localhost:3301/classify";

async function testClassification() {
  const requestLog = {
    timestamp: new Date().toISOString(),
    requesterIP: "127.0.0.1",
    method: "POST",
    endpointPath: "/page",
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

  console.log(`POST ${classifyUrl} -> ${response.status}`);
  console.log("Request log:", requestLog);
  console.log("Classification response:", responseBody);

  if (!response.ok) {
    process.exitCode = 1;
  }
}

testClassification().catch((error) => {
  console.error(`Could not POST to ${classifyUrl}:`, error.message);
  process.exitCode = 1;
});