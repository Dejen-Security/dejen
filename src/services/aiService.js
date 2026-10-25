const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn("[Gemini Service] ⚠️ EXPO_PUBLIC_GEMINI_API_KEY is not defined in your .env file!");
}

export async function analyzeMessageWithGemini(sender, messageText, retries = 5, delay = 1000) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
  
  if (sender === "BATCH_AUDIT") {
    try {
      const messagesArray = JSON.parse(messageText);
      if (Array.isArray(messagesArray) && messagesArray.length > 30) {
        console.log(`[Gemini Batch] Large inbox detected (${messagesArray.length} messages). Splitting into chunks of 30...`);
        const chunkSize = 30;
        let allThreats = [];

        for (let i = 0; i < messagesArray.length; i += chunkSize) {
          const chunk = messagesArray.slice(i, i + chunkSize);
          console.log(`[Gemini Batch] Processing chunk ${Math.floor(i / chunkSize) + 1} (${chunk.length} messages)...`);
          
          const chunkResult = await analyzeMessageWithGemini("BATCH_AUDIT_CHUNK", JSON.stringify(chunk), retries, delay);
          if (chunkResult && Array.isArray(chunkResult.threats)) {
            console.log(`[Gemini Batch] Chunk returned ${chunkResult.threats.length} threats.`);
            allThreats.push(...chunkResult.threats);
          }
        }
        console.log(`[Gemini Batch] Complete! Total threats found across all chunks: ${allThreats.length}`);
        return { threats: allThreats };
      }
    } catch (e) {
      console.warn("[Gemini Batch] Chunking parse error, running single request:", e);
    }
  }

  const isBatch = sender === "BATCH_AUDIT" || sender === "BATCH_AUDIT_CHUNK";
  
  const prompt = isBatch 
    ? `You are an elite cybersecurity threat analyst specializing in Ethiopian financial fraud, Telebirr scams, CBE phishing, fake lotteries, and SMS social engineering. 
    Analyze the following array of SMS messages. 
    CRITICAL EVALUATION RULES:
    1. Do not dismiss messages just because they contain generic, placeholder, or test words (e.g., "scam message", "test"). Evaluate the intent, sender ID anomalies, and text pattern.
    2. Any message referencing urgent money transfers, blocked accounts, lottery/prize wins, unexpected job selections, or suspicious links must be marked with a high scam probability (>= 50).
    Return ONLY a valid JSON object with key "threats" containing an array of suspicious messages with keys: "id" (number), "sender" (string), "scam_probability" (0-100 number), "category" (string), "reason" (string).
    Payload:\n${messageText}`
    : `You are an elite cybersecurity threat analyst specializing in Ethiopian financial fraud and SMS phishing. 
    Analyze this SMS text and determine its malicious risk level. Treat placeholders, test phrases, suspicious phrasing, or fraudulent banking/telecom alerts with high scrutiny.
    Return ONLY a valid JSON object with keys: "scam_probability" (0-100 number), "category" (string), "reason" (string).
    Sender: "${sender}"
    Text: "${messageText}"`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[Gemini API] Sending request (${sender}), attempt ${attempt}/${retries}...`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      
      const data = await response.json();
      
      if (response.status === 429 || response.status === 503 || data.error) {
        const errorMsg = data.error?.message || `Server status ${response.status}`;
        if (attempt < retries) {
          console.warn(`[Gemini API] Busy/Rate-limited (${response.status}). Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; 
          continue;
        } else {
          throw new Error(errorMsg);
        }
      }

      const textPart = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textPart) throw new Error("Invalid response structure from Gemini API.");

      const cleanedText = textPart.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedJson = JSON.parse(cleanedText);
      
      console.log(`[Gemini API] Success! Response received for ${sender}.`);
      return parsedJson; 

    } catch (error) {
      const errorReason = error.message || error;
      console.error(`[Gemini Error - Attempt ${attempt}/${retries}]:`, errorReason);
      
      if (attempt === retries) {
        if (isBatch) {
          console.warn("[Gemini Batch] API failed after 5 attempts. Triggering keyword fallback...");
          try {
            const parsed = JSON.parse(messageText);
            if (Array.isArray(parsed)) {
              const fallbackThreats = [];
              parsed.forEach(msg => {
                const body = (msg.body || "").toLowerCase();
                const senderId = (msg.sender || "").toLowerCase();
                if (
                  body.includes("telebirr") || body.includes("cbe") || body.includes("won") || 
                  body.includes("prize") || body.includes("congrats") || body.includes("lottery") || 
                  body.includes("free") || body.includes("transfer") || body.includes("blocked") || 
                  body.includes("scam") || senderId.includes("telebirr") || senderId.startsWith("55")
                ) {
                  fallbackThreats.push({
                    id: msg.id,
                    sender: msg.sender,
                    scam_probability: 85,
                    category: "Suspicious SMS",
                    reason: "Flagged via offline security heuristic keyword matcher."
                  });
                }
              });
              console.log(`[Fallback Heuristic] Caught ${fallbackThreats.length} potential threats offline.`);
              return { threats: fallbackThreats };
            }
          } catch (err) {}
          return { threats: [] };
        }

        return { scam_probability: 0, category: "Analysis Failed", reason: errorReason };
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}