import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import mammoth from 'mammoth';
import mongoose from 'mongoose';
import multer from 'multer';
import pdf from 'pdf-parse';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { getRoleKnowledge } from './roleKnowledge.js';
import { normalizeResumeText, parseResume } from './resumeParser.js';

const app = express();
const port = Number(process.env.PORT || 5000);
const memory = { resumes: new Map(), interviews: [] };
const interviewSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  resumeId: { type: String, required: true },
  role: { type: String, required: true },
  questions: { type: [mongoose.Schema.Types.Mixed], required: true },
  answers: { type: [mongoose.Schema.Types.Mixed], default: [] },
  profile: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now }
});
const Interview = mongoose.model('Interview', interviewSchema);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, done) => {
    const valid = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    done(valid.includes(file.mimetype) ? null : new Error('Only PDF and DOCX files are accepted.'), valid.includes(file.mimetype));
  }
});

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

const questionSchema = z.object({
  question: z.string().min(10),
  category: z.enum(['technical', 'project', 'conceptual', 'scenario', 'behavioral']),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  rationale: z.string().min(3),
  resumeEvidence: z.array(z.string()).default([])
});
const generatedSchema = z.object({ questions: z.array(questionSchema).min(1).max(15) });
const evaluationSchema = z.object({
  score: z.number().min(0).max(10),
  strengths: z.array(z.string()),
  missingConcepts: z.array(z.string()),
  feedback: z.string(),
  followUpTip: z.string(),
  nextFocus: z.string().optional()
});

const knownSkills = ['JavaScript', 'TypeScript', 'React', 'Redux', 'Node.js', 'Express', 'MongoDB', 'Mongoose', 'Python', 'Java', 'C++', 'C', 'C#', 'SQL', 'MySQL', 'PostgreSQL', 'HTML', 'CSS', 'Tailwind', 'Bootstrap', 'Git', 'GitHub', 'Docker', 'AWS', 'Firebase', 'TensorFlow', 'Pandas', 'NumPy', 'Machine Learning', 'REST API', 'Next.js', 'Vite', 'Figma', 'Linux', 'Jest', 'RESTful APIs'];
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const unique = (items) => [...new Set(items.filter(Boolean))];

function profileFromText(text) {
  const parsed = parseResume(text);
  const clean = parsed.clean;
  const skills = knownSkills.filter((skill) => new RegExp(`\\b${skill.replace(/[.+]/g, '\\$&')}\\b`, 'i').test(clean));
  const highlights = unique(parsed.lines.filter((line) => /built|developed|created|implemented|deployed|designed|intern|worked|improved|achieved/i.test(line))).slice(0, 12);
  const allEvidence = unique([...skills, ...parsed.projects, ...parsed.experience, ...highlights]);
  return { skills, projects: parsed.projects, projectDetails: parsed.projectDetails, education: parsed.education, experience: parsed.experience, certifications: parsed.certifications, highlights, evidenceCount: allEvidence.length, excerpt: clean.slice(0, 12000) };
}

function localQuestions(profile, config) {
  const categories = config.category === 'mixed'
    ? ['technical', 'project', 'conceptual', 'scenario', 'behavioral']
    : [config.category];
  const knowledge = getRoleKnowledge(config.role);
  const projectEvidence = (profile.projectDetails || []).flatMap(({ title, details }) => details.length
    ? details.slice(0, 2).map((detail) => `${title}: ${detail}`)
    : [title]);
  const evidence = unique([...profile.skills, ...projectEvidence, ...profile.experience, ...profile.highlights]);
  const anchors = evidence.length ? evidence : ['the experience described in your resume'];
  const verbs = {
    technical: (anchor) => `Explain ${anchor}. What problem does it solve, and how did you apply it?`,
    project: (anchor) => `Walk me through the design and your specific contribution to “${anchor}”. What trade-offs did you make?`,
    conceptual: (anchor) => `What core concepts should a ${config.role} know to work effectively with ${anchor}?`,
    scenario: (anchor) => `A production feature involving ${anchor} is slow or failing. How would you diagnose, prioritize, and fix it?`,
    behavioral: (anchor) => `Tell me about a time in your resume when ${anchor} required you to learn, collaborate, or resolve a challenge.`
  };
  return Array.from({ length: config.count }, (_, index) => {
    const category = categories[index % categories.length];
    const anchor = anchors[index % anchors.length];
    const roleConcept = knowledge.concepts[index % knowledge.concepts.length];
    return {
      question: category === 'scenario'
        ? `In a ${config.role} scenario, a feature related to “${anchor}” needs attention around ${roleConcept}. How would you diagnose, prioritize, and improve it?`
        : verbs[category](anchor), category, difficulty: config.difficulty,
      rationale: `Grounded in “${anchor}” and aligned to ${config.role} competency: ${roleConcept}.`,
      resumeEvidence: [anchor]
    };
  });
}

function safeJson(text) {
  const matched = text.match(/\{[\s\S]*\}/);
  if (!matched) throw new Error('The model did not return JSON.');
  return JSON.parse(matched[0]);
}

async function geminiQuestions(profile, config) {
  if (!process.env.GEMINI_API_KEY) return null;
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: 'gemini-2.0-flash' });
  const knowledge = getRoleKnowledge(config.role);
  const prompt = `You generate interview questions strictly grounded in a supplied candidate profile. Never mention a skill, project, employer or achievement that is not present. Every question must cite one or more exact strings from the profile in resumeEvidence. You may use role competencies only to frame a question, not to claim candidate experience. Target role: ${config.role}. Relevant competencies: ${knowledge.concepts.join(', ')}. Category: ${config.category}. Difficulty: ${config.difficulty}. Count: ${config.count}. Return JSON only: {"questions":[{"question":"...","category":"technical|project|conceptual|scenario|behavioral","difficulty":"beginner|intermediate|advanced","rationale":"...","resumeEvidence":["exact supporting term"]}]}. Candidate profile: ${JSON.stringify(profile)}`;
  const response = await model.generateContent(prompt);
  return generatedSchema.parse(safeJson(response.response.text())).questions.slice(0, config.count);
}

async function evaluateAnswer(question, answer, profile) {
  if (process.env.GEMINI_API_KEY) {
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: 'gemini-2.0-flash' });
    const prompt = `Act as a supportive interview coach, not a hiring decision maker. Evaluate the candidate answer against this question and their resume context. Return JSON only with score (0-10), strengths (array), missingConcepts (array), feedback, followUpTip, nextFocus. Do not claim correctness without evidence. Question: ${question.question}. Answer: ${answer}. Resume skills: ${profile.skills.join(', ')}.`;
    try { return evaluationSchema.parse(safeJson((await model.generateContent(prompt)).response.text())); } catch { /* use safe local feedback */ }
  }
  const words = answer.trim().split(/\s+/).filter(Boolean);
  const lowered = answer.toLowerCase();
  const matchedSkills = profile.skills.filter((skill) => lowered.includes(skill.toLowerCase()));
  const hasStructure = /\b(situation|context|problem|task|action|result|impact|learned)\b/i.test(answer);
  const hasEvidence = /\b(\d+%?|\d+ users?|measured|reduced|increased|improved|tested|deployed)\b/i.test(answer);
  const hasReasoning = /\b(because|trade.?off|instead|therefore|why)\b/i.test(answer);
  const score = Math.min(10, Math.round((words.length >= 100 ? 4 : words.length >= 55 ? 3 : words.length >= 25 ? 2 : 1) + Math.min(2, matchedSkills.length) + (hasStructure ? 2 : 0) + (hasEvidence ? 1 : 0) + (hasReasoning ? 1 : 0)));
  return {
    score, strengths: [words.length >= 55 ? 'You gave a substantive response.' : 'You started with a direct response.', matchedSkills.length ? `You connected your answer to ${matchedSkills.join(', ')}.` : 'Your response stays focused on the prompt.'].filter(Boolean),
    missingConcepts: [!hasStructure && 'A clear context, action, and result structure', !hasReasoning && 'Why you selected the approach and its trade-offs', !hasEvidence && 'A concrete outcome, measurement, or learning'].filter(Boolean),
    feedback: score >= 7 ? 'Well structured. Tighten the connection between your decision and its outcome.' : 'Make your answer easier to trust: describe the context, your specific action, technical reasoning, and the result.',
    followUpTip: 'Use STAR: situation, task, action, and result. Name the technical choice and why it fit.',
    nextFocus: !hasStructure ? 'Tell one complete example from context to outcome.' : !hasReasoning ? 'Explain the trade-off behind your technical choice.' : !hasEvidence ? 'Finish with an observable result or lesson.' : 'Practice a concise 60-90 second version.'
  };
}

function liveFeedback(answer, profile) {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  const lower = answer.toLowerCase();
  const matchedSkills = profile.skills.filter((skill) => lower.includes(skill.toLowerCase()));
  const signals = {
    context: /\b(context|situation|problem|task|when)\b/i.test(answer),
    action: /\b(i |my |implemented|built|designed|debugged|created|led)\b/i.test(answer),
    reasoning: /\b(because|trade.?off|instead|why|therefore)\b/i.test(answer),
    result: /\b(result|impact|improved|reduced|increased|learned|measured|%)\b/i.test(answer)
  };
  const missing = Object.entries(signals).filter(([, present]) => !present).map(([name]) => name);
  const suggestion = !words.length ? 'Start with the situation or problem you faced.'
    : words.length < 25 ? 'Add what you personally did, not only what the team did.'
    : !signals.reasoning ? 'Explain why you chose that approach or trade-off.'
    : !signals.result ? 'Close with a result, measurement, or what you learned.'
    : 'Strong structure. Check that the answer directly addresses the question.';
  return { wordCount: words.length, matchedSkills, coverage: Object.fromEntries(Object.entries(signals).map(([name, present]) => [name, present])), missing, suggestion };
}

async function connectDatabase() {
  if (!process.env.MONGODB_URI) return;
  try { await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000 }); console.log('MongoDB connected'); }
  catch (error) { console.warn(`MongoDB unavailable; using memory history. ${error.message}`); }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, mode: process.env.GEMINI_API_KEY ? 'gemini' : 'local-demo', persistence: mongoose.connection.readyState === 1 ? 'mongodb' : 'memory' }));

app.post('/api/resumes', upload.single('resume'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Attach a PDF or DOCX resume.' });
    const extracted = req.file.mimetype === 'application/pdf'
      ? (await pdf(req.file.buffer)).text
      : (await mammoth.extractRawText({ buffer: req.file.buffer })).value;
    const text = normalizeResumeText(extracted);
    if (text.length < 80) return res.status(422).json({ error: 'The file contains too little readable text. Try a text-based PDF or DOCX.' });
    const resume = { id: id(), fileName: req.file.originalname, text, profile: profileFromText(text), createdAt: new Date().toISOString() };
    memory.resumes.set(resume.id, resume);
    res.status(201).json({ id: resume.id, fileName: resume.fileName, profile: resume.profile });
  } catch (error) { next(error); }
});

app.post('/api/questions/generate', async (req, res, next) => {
  try {
    const config = z.object({ resumeId: z.string(), role: z.string().min(2), category: z.enum(['mixed', 'technical', 'project', 'conceptual', 'scenario', 'behavioral']), difficulty: z.enum(['beginner', 'intermediate', 'advanced']), count: z.number().int().min(1).max(15) }).parse(req.body);
    const resume = memory.resumes.get(config.resumeId);
    if (!resume) return res.status(404).json({ error: 'Resume session expired. Upload it again.' });
    let questions; let source = 'local grounded generator';
    try { questions = await geminiQuestions(resume.profile, config); if (questions) source = 'Gemini'; } catch (error) { console.warn('Gemini generation failed:', error.message); }
    if (!questions) questions = localQuestions(resume.profile, config);
    res.json({ questions, source });
  } catch (error) { next(error); }
});

app.post('/api/interviews', async (req, res, next) => {
  try {
    const body = z.object({ resumeId: z.string(), questions: z.array(questionSchema).min(1), role: z.string() }).parse(req.body);
    const resume = memory.resumes.get(body.resumeId);
    if (!resume) return res.status(404).json({ error: 'Resume session expired. Upload it again.' });
    const session = { id: id(), ...body, profile: resume.profile, answers: [], createdAt: new Date().toISOString() };
    memory.interviews.unshift(session);
    if (mongoose.connection.readyState === 1) await Interview.create({ ...session, sessionId: session.id });
    const { profile, ...publicSession } = session;
    res.status(201).json(publicSession);
  } catch (error) { next(error); }
});

app.post('/api/interviews/:id/answers', async (req, res, next) => {
  try {
    const input = z.object({ questionIndex: z.number().int().min(0), answer: z.string().min(10).max(5000) }).parse(req.body);
    const session = memory.interviews.find((item) => item.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Interview session not found.' });
    const resume = memory.resumes.get(session.resumeId) || { profile: session.profile };
    const question = session.questions[input.questionIndex];
    if (!question || !resume) return res.status(400).json({ error: 'Invalid question or missing resume context.' });
    const evaluation = await evaluateAnswer(question, input.answer, resume.profile);
    const result = { ...input, evaluation, answeredAt: new Date().toISOString() };
    session.answers[input.questionIndex] = result;
    if (mongoose.connection.readyState === 1) await Interview.updateOne({ sessionId: session.id }, { $set: { [`answers.${input.questionIndex}`]: result } });
    res.json(result);
  } catch (error) { next(error); }
});

app.post('/api/interviews/:id/live-feedback', (req, res, next) => {
  try {
    const body = z.object({ answer: z.string().max(5000) }).parse(req.body);
    const session = memory.interviews.find((item) => item.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Interview session not found.' });
    return res.json(liveFeedback(body.answer, session.profile));
  } catch (error) { next(error); }
});

app.get('/api/interviews', async (_req, res, next) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const sessions = await Interview.find().sort({ createdAt: -1 }).lean();
      return res.json(sessions.map(({ _id, __v, profile, resumeId, sessionId, ...session }) => ({ id: sessionId, ...session })));
    }
    res.json(memory.interviews.map(({ resumeId, profile, ...session }) => session));
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  const status = error instanceof z.ZodError ? 400 : error.message?.includes('Only PDF') ? 400 : 500;
  res.status(status).json({ error: status === 500 ? 'Something went wrong. Please try again.' : error.message || 'Invalid request.' });
});

connectDatabase().finally(() => app.listen(port, () => console.log(`API ready at http://localhost:${port}`)));
