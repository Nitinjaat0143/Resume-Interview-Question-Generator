# Resume Interview Coach

A resume-grounded interview preparation web app based on the supplied synopsis. Upload a PDF or DOCX resume, choose a target role and question configuration, then receive structured questions. Use Interview Mode to answer questions and get feedback in real time.

## What is implemented

- PDF and DOCX upload with server-side file validation and text extraction
- Section-aware resume parsing that retains multiple projects, nested bullet points, wrapped project descriptions, education, experience, certifications and highlights
- Grounded question generation with selected role, category, difficulty and count
- Gemini structured JSON integration when `GEMINI_API_KEY` is configured
- Reliable offline fallback generator using extracted resume data (so the demo is always usable)
- One-at-a-time AI interview mode with answer evaluation and session history
- MongoDB persistence when `MONGODB_URI` is configured, with safe in-memory fallback otherwise
- Debounced real-time answer coaching while the candidate types: detects context, action, reasoning, result and resume-skill references
- Curated role competency data for Full Stack, React, Backend, ML and general software roles; it frames questions without inventing resume facts
- Session summary with per-question scores and the next practice focus

## Run locally

1. Install Node.js 20+.
2. Copy `.env.example` to `server/.env` and add `GEMINI_API_KEY` / `MONGODB_URI` if available.
3. Run `npm run install:all`.
4. Run `npm run dev`.
5. Open `http://localhost:5173`.

The application works without paid/cloud services in demo mode. Gemini enhances the quality of question generation and feedback; MongoDB makes history durable across restarts.

## API endpoints

- `POST /api/resumes` - upload a PDF/DOCX
- `POST /api/questions/generate` - generate grounded interview questions
- `POST /api/interviews` - create an interview session
- `POST /api/interviews/:id/live-feedback` - lightweight, real-time answer-structure feedback
- `POST /api/interviews/:id/answers` - submit and evaluate an answer
- `GET /api/interviews` - show prior sessions
