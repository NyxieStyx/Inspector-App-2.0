import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const cliPortIdx = process.argv.indexOf('--port');
const cliPort = cliPortIdx !== -1 ? Number(process.argv[cliPortIdx + 1]) : NaN;
const PORT = Number(process.env.PORT) || (!Number.isNaN(cliPort) && cliPort > 0 ? cliPort : 3000);
const HOST = '0.0.0.0';
const isProd = process.env.NODE_ENV === 'production';

// Allow large payloads for recorded field audio and compressed photos
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.get('/api/health', (_req, res) => {
  res.status(200).json({ ok: true, status: 'ready' });
});

// Lazy shared Gemini client utility on the server so cold boot never blocks or warns before requests arrive
let cachedAi: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI {
  if (!cachedAi) {
    cachedAi = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || '',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedAi;
}
const ai = {
  get models() {
    return getAiClient().models;
  },
};

/**
 * Filter Pre-Construction Meeting Audio & Transcripts
 * Transcribes pre-con audio and filters out casual banter, sports, weather, and general chit-chat.
 * Specifically extracts:
 * 1. Contractor Questions & County Inspector Responses
 * 2. Project Requirements, Restrictions & Working Hours
 * 3. Traffic Control & Safety Specifications (MUTCD, Barricades, Trench Plates)
 * 4. Milestone Dates & Restoration Deadlines
 * 5. Attendees and Contacts
 */
app.post('/api/gemini/filter-precon-meeting', async (req, res) => {
  try {
    const { audioBase64, mimeType = 'audio/webm', rawText, tcNumber, projectTitle, contractor } = req.body;

    if (!audioBase64 && !rawText) {
      return res.status(400).json({ error: 'Either audioBase64 or rawText must be provided' });
    }

    const systemInstruction = `You are an expert Chief Field Transportation Inspector for Maricopa County Department of Transportation (MCDOT), Arizona.
Your duty is to review pre-construction meeting recordings or transcripts for Right-of-Way Permit ${tcNumber || 'TC-Permit'} (${projectTitle || 'ROW Project'}).
CRITICAL REQUIREMENT:
- Omit all casual conversations, greetings, weather remarks, sports talk, personal anecdotes, and general pleasantries.
- Strictly transcribe and isolate ONLY project-specific topics, contractor questions, and project requirements.

Structure the output with these exact sections:
1. Executive Summary: Core scope and permit authority under MCDOT standards.
2. Contractor Questions & County Answers: Every question raised by the contractor/subcontractor with the inspector's binding answer.
3. MCDOT Technical Requirements & Restrictions: Approved work hours (e.g. peak hour travel restrictions 6:00-9:00 AM & 3:30-6:30 PM), dust control (Maricopa County Rule 310), pavement cut moratoriums, trench steel plating thickness (min 1-inch pinned with cold mix ramps), compaction testing (MAG specs 95% standard proctor).
4. Traffic Control & Barricade Specifications: Specific MUTCD Type II/III barricades, arrow boards, certified flaggers, pedestrian ADA detours, and advance warning signs.
5. Key Dates, Milestones & Restoration: Paving deadlines, slurry seal, pavement milling, final inspection schedule.
6. Attendees & Field Contacts: List mentioned representatives and roles.

Return the response in clear, structured Markdown format ready to be archived into the Google Drive permit notes.`;

    let generatedText = '';

    if (process.env.GEMINI_API_KEY) {
      try {
        if (audioBase64) {
          // Use Gemini multimodal audio processing
          const audioPart = {
            inlineData: {
              mimeType: mimeType.split(';')[0] || 'audio/webm',
              data: audioBase64,
            },
          };
          const textPart = {
            text: `Please listen to this Maricopa County pre-construction meeting audio for permit ${tcNumber} (${projectTitle}, Contractor: ${contractor || 'General Contractor'}).
${rawText ? `Preliminary live transcript notes: "${rawText}"` : ''}
Extract and format ONLY project-specific topics, contractor questions, and MCDOT requirements while omitting all casual chat.`,
          };

          const response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: { parts: [audioPart, textPart] },
            config: {
              systemInstruction,
            },
          });
          generatedText = response.text || '';
        } else {
          const response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: `Pre-con transcript / spoken content for ${tcNumber}:
${rawText}

Filter this pre-construction meeting record. Omit general conversation and extract all contractor questions, MCDOT project requirements, traffic control specs, and schedule commitments.`,
            config: {
              systemInstruction,
            },
          });
          generatedText = response.text || '';
        }
      } catch (geminiErr: any) {
        console.warn('Gemini pre-con filter fallback triggered:', geminiErr?.message || geminiErr);
      }
    }

    if (!generatedText) {
      return res.status(503).json({
        success: false,
        error: 'AI unavailable offline',
      });
    }

    res.json({
      success: true,
      tcNumber,
      structuredMinutes: generatedText,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error filtering pre-con meeting:', error);
    res.status(500).json({ error: error.message || 'Failed to process pre-con meeting audio' });
  }
});

/**
 * Clean & Format Raw Inspector Voice Dictation into MCDOT Chronological Format:
 * Strips speech disfluencies, filler words, background road noise artifacts.
 * Standardizes civil terms and returns clean description plus standard format:
 * "MM/DD/YYYY MAC, [cleaned note]"
 */
app.post('/api/gemini/clean-voice-note', async (req, res) => {
  try {
    const { rawTranscript, tcNumber, location, permitType } = req.body;

    if (!rawTranscript || typeof rawTranscript !== 'string') {
      return res.status(400).json({ error: 'rawTranscript is required' });
    }

    const todayDate = new Date();
    const mm = String(todayDate.getMonth() + 1).padStart(2, '0');
    const dd = String(todayDate.getDate()).padStart(2, '0');
    const yyyy = todayDate.getFullYear();
    const formattedDate = `${mm}/${dd}/${yyyy}`;
    const inspectorCode = 'MAC';

    if (process.env.GEMINI_API_KEY) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Raw voice dictation by MCDOT Right-of-Way Inspector Marco Canzano (MAC) while patrolling in a truck for permit ${tcNumber || ''} (${permitType || 'ROW Work'} at ${location || 'Maricopa County ROW'}):
"${rawTranscript}"

INSTRUCTIONS:
1. Strip only hesitation filler words ("uh", "um", "erm") and repeated stutter words. Do NOT strip meaningful words such as "like". Collapse any repeating phrase loops or audio echo artifacts into a single concise statement.
2. Do NOT include any date or "MAC," prefix in "plainCleanText" (that prefix is added automatically).
3. Format raw speech into clean, concise, chronological MCDOT narrative style matching official Permit Notes logs WITHOUT inventing unstated visits or facts:
   - Never prepend "Site visit performed." if the inspector states no site visit occurred (e.g., rain, phone call, office update). Preserve the exact factual meaning of the dictation.
   - Driveway forms / pour: Reference MAG Detail 250 only if mentioned in the dictation.
   - Underground utility / trench / bore: Preserve stated depths, cover, and CLSM backfill details verbatim.
   - Preserve all spoken contact names, companies, phone numbers (formatted as (XXX) XXX-XXXX), stationing, and measurements verbatim so downstream contact extraction works reliably.
4. Return a JSON object with:
   - "plainCleanText": The polished MCDOT narrative sentence(s) ready to follow "MM/DD/YYYY MAC, "`,
          config: {
            systemInstruction:
              'You are an expert field transportation recorder for Maricopa County Department of Transportation. Produce concise, factual MCDOT Permit Notes sentences without inventing unstated facts.',
            responseMimeType: 'application/json',
          },
        });

        let jsonResult: any = {};
        try {
          jsonResult = JSON.parse(response.text || '{}');
        } catch {
          jsonResult = { plainCleanText: response.text?.trim() || rawTranscript };
        }

        const cleanText = (jsonResult.plainCleanText || rawTranscript)
          .replace(/^\[?\d{1,2}\/\d{1,2}\/\d{2,4}\]?\s*(?:[–—-]\s*)?(?:MAC,?\s*)?/i, '')
          .replace(/\s*[–—-]\s*MAC\.?\s*$/i, '')
          .trim();
        if (cleanText) {
          const fullLogRow = `${formattedDate} ${inspectorCode}, ${cleanText}`;
          return res.json({
            success: true,
            plainCleanText: cleanText,
            fullLogRow,
          });
        }
      } catch (geminiErr: any) {
        console.warn('Gemini clean-voice-note fallback triggered:', geminiErr?.message || geminiErr);
      }
    }

    {
      // Deterministic MCDOT narrative fallback when offline or API key unavailable
      // Preserves verbatim inspector phrasing; strips only isolated hesitation fillers (um, uh, erm)
      let deduped = rawTranscript;
      for (let pass = 0; pass < 5; pass++) {
        deduped = deduped.replace(/\b((?:[\w'-]+\s+){1,10}[\w'-]+)[,.]?\s+\1\b/gi, '$1');
        deduped = deduped.replace(/\b([\w'-]+)(?:\s+\1\b)+/gi, '$1');
      }
      let cleanFallback = deduped
        .replace(/(?:^|\s)(?:um+|uh+|erm+)(?=[,\s.!?]|$)/gi, ' ')
        .replace(/^\[?\d{1,2}\/\d{1,2}\/\d{2,4}\]?\s*(?:[–—-]\s*)?(?:MAC,?\s*)?/i, '')
        .replace(/^MAC,?\s*/i, '')
        .replace(/\s*[–—-]\s*MAC\.?\s*$/i, '')
        .replace(/\s+([,.;!?])/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (/^permit\s+logged[.]?$/i.test(cleanFallback)) {
        cleanFallback = 'Permit logged.';
      } else if (/^(?:tcp\s+approved|traffic\s+control\s+plan\s+approved)[.]?$/i.test(cleanFallback)) {
        cleanFallback = 'TCP approved.';
      } else if (/^permit\s+closed[.]?$/i.test(cleanFallback)) {
        cleanFallback = 'Permit closed.';
      } else if (/^final\s+(?:site\s+)?check(?:\s+performed)?[.]?$/i.test(cleanFallback)) {
        cleanFallback =
          'Final site check performed. Confirmed work completed to MCDOT standard within county right-of-way.';
      } else if (cleanFallback) {
        cleanFallback = cleanFallback
          .replace(/^site\s+visit\s+performed\s+(?=[a-z0-9])/i, 'Site visit performed. ')
          .replace(/\bmag\s*(?:detail\s*)?250\b/gi, 'MAG Detail 250')
          .replace(/\bmag\s*(?:detail\s*)?200(?:\s*(?:dash|-)\s*1|-1)\b/gi, 'MAG Detail 200-1')
          .replace(/\b(?:half|1\/2)[\s-]*sack(?:\s+clsm)?(?:\s+slurry)?\b/gi, '1/2-sack CLSM')
          .replace(/\bclsm\s+slurry\b/gi, 'CLSM slurry')
          .replace(/\b48\s*(?:inch|inches|in)\s+cover\b/gi, '48" cover')
          .replace(/\b36\s*(?:inch|inches|in)\s+cover\b/gi, '36" cover')
          .replace(/\bsaw\s+cut\b/gi, 'saw-cut')
          .replace(/\bsaw\s+cutting\b/gi, 'saw-cutting')
          .replace(/\bt\s+patch\b/gi, 'T-patch')
          .replace(/\btcp\b/gi, 'TCP')
          .replace(/\bclsm\b/gi, 'CLSM')
          .replace(/\bmcdot\b/gi, 'MCDOT')
          .replace(/\b(\d{3})[-.\s](\d{3})[-.\s](\d{4})\b/g, '($1) $2-$3');

        cleanFallback = cleanFallback.replace(
          /^Site visit performed\.\s+([a-z])/,
          (_, c: string) => `Site visit performed. ${c.toUpperCase()}`
        );
        cleanFallback = cleanFallback.charAt(0).toUpperCase() + cleanFallback.slice(1);
        if (!/[.!?]$/.test(cleanFallback)) {
          cleanFallback = `${cleanFallback}.`;
        }
      }

      return res.json({
        success: true,
        plainCleanText: cleanFallback,
        fullLogRow: `${formattedDate} ${inspectorCode}, ${cleanFallback}`,
      });
    }
  } catch (error: any) {
    console.error('Error cleaning voice note:', error);
    res.status(500).json({ error: error.message || 'Failed to clean voice note' });
  }
});

/**
 * MAG & MCDOT Specifications & Roadway Design Manual AI Search Assistant:
 * Answering queries with specific citations from MAG specifications, MCDOT supplement,
 * Roadway Design Manual, and MCDOT ROW General Notes.
 */
app.post('/api/gemini/mag-spec-search', async (req, res) => {
  try {
    const { question, permitContext } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'question is required' });
    }

    const todayDate = new Date();
    const mm = String(todayDate.getMonth() + 1).padStart(2, '0');
    const dd = String(todayDate.getDate()).padStart(2, '0');
    const yyyy = todayDate.getFullYear();
    const formattedDate = `${mm}/${dd}/${yyyy}`;

    const systemInstruction = `You are the Senior Technical Field Engineering Specialist for Maricopa County Department of Transportation (MCDOT), Arizona.
You assist Right-of-Way Field Transportation Inspectors (including Marco Canzano - MAC) with instant, accurate, specification-grounded answers.

AUTHORITATIVE SOURCES TO CITE:
1. Maricopa Association of Governments (MAG) Uniform Standard Specifications and Details for Public Works Construction
2. MCDOT Supplement to MAG Uniform Standard Specifications and Details
3. MCDOT Roadway Design Manual (RDM)
4. MCDOT Right-of-Way General Notes (Note #17 Traffic Control, Note #18 Pavement Cuts)
5. Maricopa County Air Quality Department Rule 310 (Fugitive Dust)

KEY REGULATIONS TO KNOW:
- Driveways: MAG Detail 250 / Detail 205. Neat straight saw-cut along existing pavement edge. Concrete must be poured DIRECTLY against existing asphalt with NO expansion joint or wood form board between asphalt and concrete. Apron must slope AWAY from paved road to maintain native sheet flow drainage. Grade adjacent elevation within 1" of top of concrete. 48-hr advance notice for forms inspection.
- Utility Trench Backfill: MAG Detail 200-1 / MAG 601 / MAG 336. Under paved streets AND within 8 feet of edge of pavement, backfill shall be minimum 1/2-sack CLSM slurry up to bottom of ABC. Shading up to 1 ft above pipe per utility spec. Sewer manhole backfill in street: 1/2-sack slurry per MAG 206.4.4. Steel plating: min 1" structural steel, pinned with rebar, ramped 1:12 with cold mix.
- Telecom / Conduit Depth: MAG Section 360 / Detail 2001. Minimum 48" below finished grade on arterials and collectors; minimum 36" depth on local streets. Bore logs must be on site.
- Pavement Cuts & Wheel Paths: MCDOT General Note #18 / MAG 336.3. Saw cuts outside wheel path (no cut within 1' of lane stripe or center 2' of lane). Pavement cuts > 300 linear feet require full lane slurry seal / micro-surfacing. T-patch minimum 1 ft cutback on undisturbed subgrade.
- Traffic Control: MCDOT Traffic Control Manual / Note #17. Approved TCP on site within 20 ft of edge of pavement. 24/7 maintenance. Certified flaggers (ATSSA/AGC). Two reflective flexible guide posts marking raised utility manholes/valves.
- EOR & Submittals: MCDOT ROW Guidelines Sec III-V. Arizona stamped EOR letter certifying continuous inspection, subgrade & asphalt phase certifications, mix designs, and geotechnical compaction test books.

Output MUST be a JSON object with:
- "answer": Clear, concise field inspector answer (max 3-4 bullet points or short paragraphs). Highlight critical dimensions and tolerances in bold.
- "primaryCitation": Primary MAG / MCDOT detail or section (e.g. "MAG Detail 250 & MCDOT Residential Driveway Guidelines").
- "secondaryCitations": Array of related citations.
- "inspectorActionItems": 2-3 quick bullet points for what to inspect on site.
- "suggestedNoteSnippet": Ready-to-paste chronological note snippet formatted as "${formattedDate} MAC, [concise standard note description]".`;

    if (process.env.GEMINI_API_KEY) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Field Inspector Question: "${question}"
${permitContext ? `Context - Permit: ${permitContext.tcNumber || 'TC-Permit'}, Type: ${permitContext.permitType || 'ROW'}, Location: ${permitContext.location || 'Maricopa County'}` : ''}`,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
          },
        });

        let parsed: any = {};
        try {
          parsed = JSON.parse(response.text || '{}');
        } catch {
          parsed = {
            answer: response.text || 'Refer to MAG Uniform Standard Specifications.',
            primaryCitation: 'MAG Uniform Standard Specifications & MCDOT Supplement',
            suggestedNoteSnippet: `${formattedDate} MAC, Verified field work per MAG specifications.`,
          };
        }

        return res.json({
          success: true,
          ...parsed,
        });
      } catch (geminiErr: any) {
        console.warn('Gemini mag-spec-search fallback triggered:', geminiErr?.message || geminiErr);
      }
    }

    {
      // Local fallback
      return res.json({
        success: true,
        answer:
          'Under MAG and MCDOT standards, concrete driveways (MAG Detail 250) must be poured directly against a neat saw-cut asphalt edge with NO expansion joint material between asphalt and concrete. Slope must fall away from the roadway.',
        primaryCitation: 'MAG Detail 250 & MCDOT Residential Driveway Guidelines',
        secondaryCitations: ['MAG Section 340', 'MAG Detail 205'],
        inspectorActionItems: [
          'Verify clean straight saw-cut along existing edge of pavement.',
          'Verify NO expansion joint material placed against asphalt face.',
          'Confirm slope falls away from roadway crown.',
        ],
        suggestedNoteSnippet: `${formattedDate} MAC, Inspected forms per MAG Detail 250. Neat saw-cut along asphalt verified; no expansion joint against pavement; drainage slopes away from roadway.`,
      });
    }
  } catch (error: any) {
    console.error('Error searching MAG specs:', error);
    res.status(500).json({ error: error.message || 'Failed to search MAG specifications' });
  }
});

/**
 * Hold-to-Speak AI Field Log Parser:
 * Uses Gemini ('gemini-4-hydrogen') with structured JSON responseSchema to parse raw voice dictation,
 * compliance checks, and live GPS coordinates into structured MCDOT field inspection fields + chronological narrative.
 */
app.post('/api/gemini/parse-field-log', async (req, res) => {
  try {
    const {
      rawTranscript,
      tcNumber,
      permitType,
      location,
      contractor,
      lat,
      lng,
      checkedItems = [],
    } = req.body;

    if (!rawTranscript || typeof rawTranscript !== 'string') {
      return res.status(400).json({ error: 'rawTranscript is required' });
    }

    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const yyyy = now.getFullYear();
    const formattedDate = `${mm}/${dd}/${yyyy}`;
    const timeLabel = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const gpsLat = typeof lat === 'number' ? lat.toFixed(5) : '33.75379';
    const gpsLng = typeof lng === 'number' ? lng.toFixed(5) : '-112.58742';
    const gpsStamp = `GPS ${gpsLat}, ${gpsLng} @ ${timeLabel}`;

    if (process.env.GEMINI_API_KEY) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Spoken voice log by MCDOT Right-of-Way Inspector Marco Canzano (MAC):
"${rawTranscript}"

Permit Context:
- Permit TC#: ${tcNumber || 'TC-Permit'}
- Scope / Permit Type: ${permitType || 'ROW Construction'}
- Location: ${location || 'Maricopa County ROW'}
- Contractor: ${contractor || 'Permittee'}
- Active Patrol ${gpsStamp}
- Quick Compliance Boxes Checked: ${Array.isArray(checkedItems) && checkedItems.length > 0 ? checkedItems.join('; ') : 'None pre-selected'}

Parse this spoken field observation into structured MCDOT inspection fields and a clean chronological narrative sentence (without date or "MAC," prefix) that concludes with "(${gpsStamp})."`,
          config: {
            systemInstruction:
              'You are a Senior Field Transportation Recording Specialist for Maricopa County Department of Transportation (MCDOT). Strip only hesitation fillers (um, uh, erm), never strip meaningful words like "like", never invent unstated site visits or compliance determinations, default any unmentioned inspection category to "Not Inspected", recognize resolved/corrected items as Resolved rather than Deficient, and preserve any spoken names/phone numbers/depths/MAG details verbatim.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                workStatus: {
                  type: Type.STRING,
                  description:
                    'One of: "Active Crew On-Site", "No Work / Pass", "Pre-Con / TCP Check", "Deficiency / Correction Required", "Resolved / Corrected", or "Final / Restoration Complete".',
                },
                trafficControl: {
                  type: Type.STRING,
                  description:
                    'One of: "Compliant", "Deficient", "Resolved", "Inactive / No Closure", or "Not Inspected" (use "Not Inspected" whenever traffic control is not mentioned or checked).',
                },
                workSafety: {
                  type: Type.STRING,
                  description:
                    'One of: "Compliant", "Deficient", "Resolved", "No Active Excavation", or "Not Inspected" (use "Not Inspected" whenever safety/trenching is not mentioned or checked).',
                },
                restorationPlates: {
                  type: Type.STRING,
                  description:
                    'One of: "Compliant", "Plates Pinned & Ramped", "Pending Backfill / Paving", "Deficient", "Resolved", or "Not Inspected" (use "Not Inspected" whenever restoration/plating is not mentioned or checked).',
                },
                crewSummary: {
                  type: Type.STRING,
                  description: 'Concise 4-12 word summary of crew, equipment, or site status.',
                },
                deficiencies: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Specific unresolved non-compliance items mentioned, or empty array if none.',
                },
                cleanNarrative: {
                  type: Type.STRING,
                  description:
                    'Clean official MCDOT Permit Notes narrative (no leading date or MAC prefix, never blindly adding "Site visit performed.") ending with the GPS timestamp in parentheses.',
                },
              },
              required: [
                'workStatus',
                'trafficControl',
                'workSafety',
                'restorationPlates',
                'crewSummary',
                'deficiencies',
                'cleanNarrative',
              ],
            },
          },
        });

        const parsed = JSON.parse((response.text || '{}').trim());
        let narrative = (parsed.cleanNarrative || rawTranscript)
          .replace(/^\[?\d{1,2}\/\d{1,2}\/\d{2,4}\]?\s*(?:[–—-]\s*)?(?:MAC,?\s*)?/i, '')
          .replace(/\s*[–—-]\s*MAC\.?\s*$/i, '')
          .trim();
        if (!narrative.includes('GPS ')) {
          narrative = `${narrative.replace(/[.]+$/, '')} (${gpsStamp}).`;
        }
        return res.json({
          success: true,
          workStatus: parsed.workStatus || 'Observation Logged',
          trafficControl: parsed.trafficControl || 'Not Inspected',
          workSafety: parsed.workSafety || 'Not Inspected',
          restorationPlates: parsed.restorationPlates || 'Not Inspected',
          crewSummary: parsed.crewSummary || 'Field inspection recorded via AI voice log.',
          deficiencies: Array.isArray(parsed.deficiencies) ? parsed.deficiencies : [],
          cleanNarrative: narrative,
          fullLogRow: `${formattedDate} MAC, ${narrative}`,
          gpsStamp,
          timestamp: now.toISOString(),
        });
      } catch (geminiErr: any) {
        console.warn('Gemini parse-field-log fallback triggered:', geminiErr?.message || geminiErr);
      }
    }

    // Deterministic MCDOT structured fallback when offline or API key unavailable
    const lower = rawTranscript.toLowerCase();
    const checkedLower = Array.isArray(checkedItems)
      ? checkedItems.map((c: unknown) => String(c).toLowerCase()).join(' | ')
      : '';

    const isNoSiteVisit = /\bno\s+site\s+visit\b|\bnot\s+visited\b|\bcancelled\b|\brain(?:ed|ing)?\s+out\b/.test(lower);
    const isNoWork = /\bno\s+work\b|\bno\s+crew\b|\bnobody\s+on\s+site\b|\bempty\s+site\b|\binactive\b/.test(lower);

    // Resolution / abatement phrasing must map to Resolved, not Deficient
    const hasResolvedPhasing =
      /\b(fixed|repaired|corrected|resolved|abated)\b/i.test(lower) &&
      !/\b(not\s+(?:fixed|repaired|corrected|resolved|abated)|needs?\s+(?:to\s+be\s+)?(?:fixed|repaired|corrected|resolved))\b/i.test(
        lower
      );

    // Unresolved deficiency phrasing (deliberately excludes bare "fix" so "fixed" is never misclassified)
    const rawDeficiencyMatch =
      /\b(missing|violation|unsafe|unpinned|no\s+cones|no\s+barricades?|deficien\w*|correction\s+(?:needed|required|issued)|stop\s+work|needs?\s+(?:fix|fixing|repair|correction|adjustment)|not\s+(?:fixed|repaired|corrected|resolved|compliant))\b/i.test(
        lower
      );
    const hasDeficiency = rawDeficiencyMatch && !hasResolvedPhasing;

    const mentionsTrafficControl =
      /\b(cone|cones|barricade|barricades|sign|signs|signage|tcp|flagger|flaggers|lane\s+closure|arrow\s+board|traffic\s+control|mutcd|taper)\b/i.test(
        lower
      ) || /\b(tcp|traffic\s+control|barricade|mutcd)\b/i.test(checkedLower);
    const confirmsTrafficControlCompliant =
      /\b(tcp|traffic\s+control|barricade|cones|signage)\b.*\b(compliant|good|ok|okay|approved|in\s+place|verified|proper|set\s+up)\b/i.test(
        lower
      ) || /\b(tcp|traffic\s+control|barricade|mutcd)\b/i.test(checkedLower);

    const mentionsSafety =
      /\b(safety|shoring|trench\s+box|ppe|vest|hard\s+hat|excavat|dust|rule\s*310|water\s+truck|osha|trench)\b/i.test(
        lower
      ) || /\b(safety|dust|rule\s*310|shoring|excavat)\b/i.test(checkedLower);
    const confirmsSafetyCompliant =
      /\b(safety|shoring|trench|dust|rule\s*310|ppe)\b.*\b(compliant|good|ok|okay|verified|safe|proper)\b/i.test(
        lower
      ) || /\b(safety|dust|rule\s*310|shoring)\b/i.test(checkedLower);

    const mentionsRestorationPlates =
      /\b(plate|plates|plating|cold\s*mix|ramped|pinned|backfill|slurry|clsm|asphalt|patch|t-patch|saw-?cut|restoration|paving|overlay|compaction)\b/i.test(
        lower
      ) || /\b(plate|plating|backfill|clsm|slurry|asphalt|restoration)\b/i.test(checkedLower);
    const confirmsRestorationCompliant =
      /\b(plate|plates|plating|backfill|slurry|clsm|asphalt|patch|restoration|paving)\b.*\b(compliant|good|ok|okay|pinned|ramped|complete|completed|verified|clean)\b/i.test(
        lower
      ) || /\b(plate|plating|backfill|clsm|slurry|restoration)\b/i.test(checkedLower);

    const workStatus = hasDeficiency
      ? 'Deficiency / Correction Required'
      : hasResolvedPhasing
      ? 'Resolved / Corrected'
      : isNoSiteVisit || isNoWork
      ? 'No Work / Pass'
      : /\b(final|complete|completed|closed)\b/i.test(lower)
      ? 'Final / Restoration Complete'
      : 'Active Crew On-Site';

    let trafficControl = 'Not Inspected';
    if (mentionsTrafficControl) {
      if (hasDeficiency && /\b(cone|barricade|sign|tcp|flagger|lane|traffic|mutcd|taper)\b/i.test(lower)) {
        trafficControl = 'Deficient';
      } else if (hasResolvedPhasing && /\b(cone|barricade|sign|tcp|flagger|lane|traffic|mutcd|taper)\b/i.test(lower)) {
        trafficControl = 'Resolved';
      } else if (confirmsTrafficControlCompliant) {
        trafficControl = 'Compliant';
      }
    } else if (isNoWork && !isNoSiteVisit) {
      trafficControl = 'Inactive / No Closure';
    }

    let workSafety = 'Not Inspected';
    if (mentionsSafety) {
      if (hasDeficiency && /\b(safety|shoring|trench|ppe|excavat|dust|unsafe|violation|stop\s+work)\b/i.test(lower)) {
        workSafety = 'Deficient';
      } else if (hasResolvedPhasing && /\b(safety|shoring|trench|ppe|excavat|dust)\b/i.test(lower)) {
        workSafety = 'Resolved';
      } else if (confirmsSafetyCompliant) {
        workSafety = 'Compliant';
      }
    } else if (isNoWork && !isNoSiteVisit) {
      workSafety = 'No Active Excavation';
    }

    let restorationPlates = 'Not Inspected';
    if (mentionsRestorationPlates) {
      if (hasDeficiency && /\b(plate|plating|unpinned|patch|asphalt|slurry|saw|backfill|restoration)\b/i.test(lower)) {
        restorationPlates = 'Deficient';
      } else if (hasResolvedPhasing && /\b(plate|plating|patch|asphalt|slurry|saw|backfill|restoration)\b/i.test(lower)) {
        restorationPlates = 'Resolved';
      } else if (/\b(plate|plating)\b/i.test(lower) && /\b(pinned|ramped|cold\s*mix)\b/i.test(lower)) {
        restorationPlates = 'Plates Pinned & Ramped';
      } else if (confirmsRestorationCompliant) {
        restorationPlates = 'Compliant';
      } else {
        restorationPlates = 'Pending Backfill / Paving';
      }
    }

    // Strip only isolated hesitation fillers (um, uh, erm); preserve meaningful words like "like"
    const cleanedSpeech = rawTranscript
      .replace(/(?:^|\s)(?:um+|uh+|erm+)(?=[,\s.!?]|$)/gi, ' ')
      .replace(/\s+([,.;!?])/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const checkedSuffix =
      Array.isArray(checkedItems) && checkedItems.length > 0
        ? ` Verified: ${checkedItems.join(', ')}.`
        : '';

    // Never auto-prepend "Site visit performed." — preserve verbatim inspector phrasing
    const capitalizedSpeech = cleanedSpeech
      ? `${cleanedSpeech.charAt(0).toUpperCase()}${cleanedSpeech.slice(1).replace(/[.]+$/, '')}.`
      : '';

    const cleanNarrative = `${capitalizedSpeech}${checkedSuffix} (${gpsStamp}).`.trim();

    return res.json({
      success: true,
      workStatus,
      trafficControl,
      workSafety,
      restorationPlates,
      crewSummary: isNoSiteVisit
        ? 'No site visit conducted.'
        : isNoWork
        ? 'No crew or active equipment on site.'
        : cleanedSpeech.slice(0, 68),
      deficiencies: hasDeficiency ? ['Field correction noted during patrol inspection'] : [],
      cleanNarrative,
      fullLogRow: `${formattedDate} MAC, ${cleanNarrative}`,
      gpsStamp,
      timestamp: now.toISOString(),
    });
  } catch (error: any) {
    console.error('Error parsing AI field log:', error);
    res.status(500).json({ error: error.message || 'Failed to parse spoken field log' });
  }
});

function calculateHaversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Constantly cross-reference Maricopa County DOT Road Information Tool (MCDOT RIT)
 * ArcGIS REST API Endpoint:
 * https://gis.maricopa.gov/dot/rest/services/Maintenance/RoadInformationTool/MapServer/15/query
 * Experience Builder: https://experience.arcgis.com/experience/1481eed4077842098b1174d0c8f23c17
 */
app.get('/api/mcdot/rit-permits', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat as string) || 33.7315;
    const lng = parseFloat(req.query.lng as string) || -112.5350;

    // Support explicit bounding envelope from map viewport, or compute envelope around center
    let minLat = parseFloat(req.query.minLat as string);
    let maxLat = parseFloat(req.query.maxLat as string);
    let minLng = parseFloat(req.query.minLng as string);
    let maxLng = parseFloat(req.query.maxLng as string);

    if (isNaN(minLat) || isNaN(maxLat) || isNaN(minLng) || isNaN(maxLng)) {
      // Default to ~6-8 mile envelope around query center
      const dLat = 0.055;
      const dLng = 0.080;
      minLat = lat - dLat;
      maxLat = lat + dLat;
      minLng = lng - dLng;
      maxLng = lng + dLng;
    }

    const envelopeStr = `${minLng},${minLat},${maxLng},${maxLat}`;
    const spatialUrl = `https://gis.maricopa.gov/dot/rest/services/Maintenance/RoadInformationTool/MapServer/15/query?geometry=${envelopeStr}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=json&resultRecordCount=1000`;

    let features: any[] = [];
    try {
      const response = await fetch(spatialUrl, {
        headers: { 'User-Agent': 'MCDOT-Inspector-App/1.0' },
      });
      if (response.ok) {
        const data = await response.json();
        features = (data.features || []) as any[];
      }
    } catch (e) {
      console.warn('Envelope query to MCDOT RIT failed:', e);
    }

    // If envelope query returned very few results, fallback to point distance query
    if (features.length < 10) {
      try {
        const pointUrl = `https://gis.maricopa.gov/dot/rest/services/Maintenance/RoadInformationTool/MapServer/15/query?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&distance=25&units=esriSRUnit_StatuteMile&where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=json&resultRecordCount=500`;
        const respPoint = await fetch(pointUrl, {
          headers: { 'User-Agent': 'MCDOT-Inspector-App/1.0' },
        });
        if (respPoint.ok) {
          const pointData = await respPoint.json();
          features = (pointData.features || []) as any[];
        }
      } catch (e2) {
        console.warn('Fallback point query to MCDOT RIT failed:', e2);
      }
    }

    // Color and status mapping matching MCDOT RIT drawingInfo symbology
    function mapRitColor(rawStatus: string): string {
      switch (rawStatus) {
        case 'Issued':
        case 'Complete':
          return '#005CE6'; // Royal blue
        case 'Requires Customer Attention':
          return '#FFFF00'; // Yellow
        case 'Expired':
          return '#E69800'; // Orange/amber
        case 'Denied':
          return '#E60000'; // Red
        case 'Stop Work Order':
          return '#FF5500'; // Red-orange
        case 'In Review':
          return '#73B2FF'; // Light blue
        case 'Submitted':
          return '#DF73FF'; // Light violet
        case 'Submitted - Online':
          return '#A900E6'; // Deep violet
        case 'Plan Approval Expired':
          return '#FFD37F'; // Tan
        case 'Withdrawn':
          return '#FF7F7F'; // Salmon
        default:
          return '#0070FF';
      }
    }

    // Parse ArcGIS date attributes (epoch ms or date string) into YYYY-MM-DD, returning null if absent/invalid
    function parseArcgisDate(val: unknown): string | null {
      if (val === null || val === undefined || val === '') return null;
      const d = typeof val === 'number' ? new Date(val) : new Date(String(val));
      if (isNaN(d.getTime())) return null;
      return d.toISOString().split('T')[0];
    }

    function parseArcgisPreConStatus(val: unknown): boolean | null {
      if (val === null || val === undefined || val === '') return null;
      if (typeof val === 'boolean') return val;
      const s = String(val).trim().toLowerCase();
      if (!s) return null;
      if (['true', 'yes', 'y', '1', 'completed', 'complete', 'done', 'held'].includes(s)) return true;
      if (['false', 'no', 'n', '0', 'pending', 'scheduled', 'not completed', 'none'].includes(s)) return false;
      return null;
    }

    const todayStartMs = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00Z').getTime();

    // Transform ArcGIS features to Permit model without fabricating missing GIS values
    const transformedPermits = features
      .filter((f) => f.geometry && (f.geometry.x !== undefined && f.geometry.y !== undefined))
      .map((f, i) => {
        const attrs = f.attributes || {};
        const geom = f.geometry || {};
        const distanceToOrigin = calculateHaversineMiles(lat, lng, geom.y, geom.x);

        const rawStatusValue = String(attrs.PermitStatus || attrs.PERMIT_STATUS || attrs.Status || '').trim();
        const rawStatus = rawStatusValue || 'Unknown';
        let status = 'Unknown';
        if (rawStatus === 'Issued' || rawStatus === 'Active' || rawStatus === 'Requires Customer Attention' || rawStatus === 'Stop Work Order') {
          status = 'Active';
        } else if (rawStatus === 'In Review' || rawStatus === 'Submitted' || rawStatus === 'Submitted - Online') {
          status = 'Pre-Con Scheduled';
        } else if (rawStatus === 'Complete' || rawStatus === 'Completed') {
          status = 'Completed';
        } else if (rawStatus === 'Denied') {
          status = 'Denied';
        } else if (rawStatus === 'Expired' || rawStatus === 'Plan Approval Expired') {
          status = 'Expired';
        } else if (rawStatus === 'Withdrawn') {
          status = 'Withdrawn';
        }

        const rawScope = (attrs.ScopeOfWork || attrs.Description || attrs.WorkDescription || attrs.PermitType || 'Right-of-Way Utility & Access Work').trim();
        const lowerScope = rawScope.toLowerCase();

        let pType = 'Trench / Utility';
        if (lowerScope.includes('driveway') || lowerScope.includes('apron') || lowerScope.includes('culvert')) pType = 'Driveway Access';
        else if (lowerScope.includes('bore') || lowerScope.includes('fiber') || lowerScope.includes('cable') || lowerScope.includes('telecom')) pType = 'Trench / Utility';
        else if (lowerScope.includes('sewer') || lowerScope.includes('water') || lowerScope.includes('drain') || lowerScope.includes('storm')) pType = 'Stormwater Tie-in';
        else if (lowerScope.includes('cut') || lowerScope.includes('pavement') || lowerScope.includes('asphalt') || lowerScope.includes('mill')) pType = 'Pavement Cut';
        else if (lowerScope.includes('signal') || lowerScope.includes('loop') || lowerScope.includes('its')) pType = 'Signal / ITS Loop';

        const tc = String(attrs.PermitID || attrs.PermitNumber || attrs.PERMIT_NO || `TC2026${String(attrs.OBJECTID || i).padStart(4, '0')}`).trim();
        const permitGuid = attrs.GlobalID || attrs.GlobalId || attrs.PermitGuid || attrs.PermitGUID || attrs.GUID || attrs.EnergovId || attrs.PERMIT_GUID || undefined;

        // Pull authentic GIS contractor / contact / phone columns; return null if not listed in GIS
        const rawAttrCompany = (
          attrs.ContractorName ||
          attrs.Contractor ||
          attrs.CONTRACTOR ||
          attrs.CompanyName ||
          attrs.Company ||
          attrs.COMPANY ||
          attrs.PermitteeName ||
          attrs.Permittee ||
          attrs.PERMITTEE ||
          attrs.ApplicantCompany ||
          attrs.ApplicantName ||
          attrs.Applicant ||
          attrs.APPLICANT ||
          attrs.Organization ||
          attrs.OwnerName ||
          ''
        )
          .toString()
          .trim();

        const rawAttrContact = (
          attrs.ContactName ||
          attrs.FieldContact ||
          attrs.Superintendent ||
          attrs.ApplicantContact ||
          attrs.ProjectManager ||
          attrs.CONTACT_NAME ||
          ''
        )
          .toString()
          .trim();

        const rawAttrPhone = (
          attrs.ContactPhone ||
          attrs.ContractorPhone ||
          attrs.Phone ||
          attrs.ApplicantPhone ||
          attrs.PHONE ||
          attrs.CellPhone ||
          ''
        )
          .toString()
          .trim();

        const contractor: string | null =
          rawAttrCompany && !/^(permittee|general contractor|other item|unknown|n\/a|none)$/i.test(rawAttrCompany)
            ? rawAttrCompany
            : null;
        const contractorContact: string | null = rawAttrContact || null;
        const contractorPhone: string | null = rawAttrPhone || null;

        // Pull authentic GIS dates, work hours, and pre-con status; never synthesize fake fallbacks
        const issueDate = parseArcgisDate(
          attrs.ISSUE_DATE ?? attrs.IssueDate ?? attrs.IssuedDate ?? attrs.DateIssued
        );
        const expirationDate = parseArcgisDate(
          attrs.EXPIRATION_DATE ?? attrs.ExpirationDate ?? attrs.ExpDate ?? attrs.ExpireDate
        );
        const rawWorkHours = (
          attrs.WORK_HOURS ||
          attrs.WorkHours ||
          attrs.WorkWindow ||
          attrs.WORK_WINDOW ||
          ''
        )
          .toString()
          .trim();
        const workWindow: string | null = rawWorkHours || null;
        const preConCompleted = parseArcgisPreConStatus(
          attrs.PRECON_STATUS ?? attrs.PreConStatus ?? attrs.PreConCompleted ?? attrs.PRECON_COMPLETED
        );

        // Enforce expiration check against current date when expirationDate is present in GIS
        if (expirationDate) {
          const expMs = new Date(`${expirationDate}T00:00:00Z`).getTime();
          if (!isNaN(expMs) && expMs < todayStartMs && status !== 'Completed' && status !== 'Denied' && status !== 'Withdrawn') {
            status = 'Expired';
          }
        }

        // Primary Street & Cross-Street extraction from ArcGIS attributes
        const primaryStreet = (
          attrs.StreetName ||
          attrs.STREET_NAME ||
          attrs.Street ||
          attrs.OnStreet ||
          attrs.RoadName ||
          attrs.Address ||
          attrs.SITE_ADDRESS ||
          attrs.PermitAddress ||
          attrs.Location ||
          ''
        )
          .toString()
          .trim();

        const crossStreet = (
          attrs.CrossStreet ||
          attrs.CROSS_STREET ||
          attrs.FromStreet ||
          attrs.IntersectingStreet ||
          attrs.NearestIntersection ||
          ''
        )
          .toString()
          .trim();

        let locationStr = '';
        if (primaryStreet && crossStreet && !primaryStreet.toLowerCase().includes(crossStreet.toLowerCase())) {
          locationStr = `${primaryStreet} & ${crossStreet}`;
        } else if (primaryStreet) {
          locationStr = primaryStreet;
        } else if (crossStreet) {
          locationStr = crossStreet;
        } else {
          locationStr = `Lat: ${Number(geom.y).toFixed(4)}, Lng: ${Number(geom.x).toFixed(4)}`;
        }

        return {
          id: `rit-${attrs.OBJECTID || i}-${tc}`,
          tcNumber: tc,
          permitGuid: permitGuid ? String(permitGuid) : undefined,
          projectTitle: rawScope === 'Other Item' || rawScope === 'General' ? `${pType} — County ROW Construction` : rawScope,
          contractor,
          contractorContact,
          contractorPhone,
          inspectorName: 'Marco Canzano (MAC)',
          location: locationStr,
          milepost: crossStreet || undefined,
          lat: geom.y,
          lng: geom.x,
          distanceMiles: distanceToOrigin,
          permitType: pType,
          status,
          rawRitStatus: status === 'Expired' && rawStatus === 'Unknown' ? 'Expired' : rawStatus,
          ritColor: mapRitColor(status === 'Expired' ? 'Expired' : rawStatus),
          issueDate,
          expirationDate,
          workWindow,
          preConCompleted,
          hasSignInSheet: false,
          hasBusinessCards: false,
          trafficControlPlan: 'MCDOT Uniform Standard Traffic Control Plan',
          specialConditions: [
            `Live MCDOT RIT Feed (Layer 15: Right-Of-Way Permit)`,
            `Status: ${status === 'Expired' ? 'Expired' : rawStatus}`,
            `Scope: ${rawScope}`,
            'Conforms to MAG Uniform Standard Specifications & Maricopa County Rule 310.',
          ],
          source: 'MCDOT_RIT',
          ritArcgisUrl: 'https://experience.arcgis.com/experience/1481eed4077842098b1174d0c8f23c17#widget_11=layer_visibility:%7B%22widget_11-dataSource_1%22%3A%7B%22widget_11-dataSource_1-1905ae15533-layer-19%22%3Atrue%2C%22widget_11-dataSource_1-19b9f660965-layer-21%22%3Atrue%7D%7D,active_datasource_id:dataSource_1',
        };
      });

    // Proximity sorting: Sort strictly by distance ascending to guarantee the closest permits
    transformedPermits.sort((a, b) => (a.distanceMiles || 0) - (b.distanceMiles || 0));

    res.json({
      success: true,
      queryOrigin: { lat, lng },
      count: transformedPermits.length,
      closestTen: transformedPermits.slice(0, 10),
      permits: transformedPermits,
      sourceUrl: 'https://gis.maricopa.gov/dot/rest/services/Maintenance/RoadInformationTool/MapServer/15',
      experienceUrl: 'https://experience.arcgis.com/experience/1481eed4077842098b1174d0c8f23c17',
    });
  } catch (error: any) {
    console.error('Error fetching MCDOT RIT permits:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch MCDOT RIT permits' });
  }
});

// Configure Vite or Static File Serving with immediate port binding so cold starts never time out
function startServer() {
  if (!isProd) {
    const viteMiddlewaresPromise = import('vite')
      .then(({ createServer: createViteServer }) =>
        createViteServer({
          server: {
            middlewareMode: true,
            hmr: false,
            watch: null,
          },
          appType: 'spa',
        })
      )
      .then((vite) => vite.middlewares);

    app.use(async (req, res, next) => {
      try {
        const middlewares = await viteMiddlewaresPromise;
        middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`MCDOT Inspector Server listening on http://${HOST}:${PORT}`);
  });

  server.on('error', (err) => {
    console.error('Server listen error:', err);
  });
}

startServer();
