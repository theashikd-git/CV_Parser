require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenAI, Type } = require('@google/genai');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.GEMINI_API_KEY) {
  console.error('\n[ERROR] GEMINI_API_KEY is not set.');
  console.error('Copy .env.example to .env and add your free key from https://aistudio.google.com/apikey, then restart.\n');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PARSE_INSTRUCTIONS = `You are an ATS (applicant tracking system) resume parser. Parse the given CV/resume text into structured sections, and identify the exact substrings in the original text that correspond to each section so they can be highlighted on a UI.

CRITICAL: every "source_snippet" field MUST be an exact, verbatim substring copied from the CV text you are given (not paraphrased), so it can be located with a string search. If a section genuinely is not present in the CV, use null (for contact/summary) or an empty array (for experience/education/skills.items/certifications.items), and source_snippet should be null in that case. Do not invent content that is not in the CV.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    contact: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, nullable: true },
        email: { type: Type.STRING, nullable: true },
        phone: { type: Type.STRING, nullable: true },
        location: { type: Type.STRING, nullable: true },
        linkedin: { type: Type.STRING, nullable: true },
        source_snippet: { type: Type.STRING, nullable: true },
      },
    },
    summary: {
      type: Type.OBJECT,
      properties: {
        text: { type: Type.STRING, nullable: true },
        source_snippet: { type: Type.STRING, nullable: true },
      },
    },
    experience: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          organization: { type: Type.STRING },
          location: { type: Type.STRING, nullable: true },
          start_date: { type: Type.STRING, nullable: true },
          end_date: { type: Type.STRING, nullable: true },
          description: { type: Type.STRING, nullable: true },
          source_snippet: { type: Type.STRING },
        },
      },
    },
    education: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          degree: { type: Type.STRING },
          institution: { type: Type.STRING },
          location: { type: Type.STRING, nullable: true },
          year: { type: Type.STRING, nullable: true },
          source_snippet: { type: Type.STRING },
        },
      },
    },
    skills: {
      type: Type.OBJECT,
      properties: {
        items: { type: Type.ARRAY, items: { type: Type.STRING } },
        source_snippet: { type: Type.STRING, nullable: true },
      },
    },
    certifications: {
      type: Type.OBJECT,
      properties: {
        items: { type: Type.ARRAY, items: { type: Type.STRING } },
        source_snippet: { type: Type.STRING, nullable: true },
      },
    },
  },
};

app.post('/api/parse-cv', async (req, res) => {
  try {
    const { cvText } = req.body;

    if (!cvText || typeof cvText !== 'string' || !cvText.trim()) {
      return res.status(400).json({ error: 'cvText is required and must be a non-empty string.' });
    }

    const truncated = cvText.slice(0, 14000);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `${PARSE_INSTRUCTIONS}\n\nCV text:\n"""\n${truncated}\n"""`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const parsed = JSON.parse(response.text);

    res.json({ parsed, charsProcessed: truncated.length });
  } catch (err) {
    console.error('parse-cv error:', err);
    res.status(500).json({ error: err.message || 'Failed to parse CV.' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Vantage Point CV parser running at http://localhost:${PORT}`);
});
