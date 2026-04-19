export const config = {
  openclaw: {
    root: process.env.OPENCLAW_ROOT || '',
  },
  ai: {
    baseUrl: process.env.AI_BASE_URL?.trim() || "https://api.openai.com/v1",
    apiKey: process.env.AI_API_KEY?.trim() || "sk-xxx",
    model: process.env.AI_MODEL?.trim() || "gpt-5.4-mini",
  },
};
