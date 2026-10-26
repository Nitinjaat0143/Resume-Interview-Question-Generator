import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API = 'http://localhost:5000/api';
const initialConfig = { role: 'Full Stack Developer', category: 'mixed', difficulty: 'intermediate', count: 6 };

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function App() {
  const [resume, setResume] = useState(null);
  const [config, setConfig] = useState(initialConfig);
  const [questions, setQuestions] = useState([]);
  const [source, setSource] = useState('');
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [evaluation, setEvaluation] = useState(null);
  const [liveFeedback, setLiveFeedback] = useState(null);
  const [sessionAnswers, setSessionAnswers] = useState([]);
  const feedbackTimer = useRef(null);

  const updateConfig = (event) => setConfig((old) => ({ ...old, [event.target.name]: event.target.name === 'count' ? Number(event.target.value) : event.target.value }));
  const answerWords = useMemo(() => answer.trim() ? answer.trim().split(/\s+/).length : 0, [answer]);
  const liveHint = answerWords === 0 ? 'Start by stating the context.' : answerWords < 35 ? 'Add your action and the technical reason behind it.' : answerWords < 80 ? 'Good start. Finish with the result or impact.' : 'Strong length. Check that every sentence answers the question.';

  useEffect(() => {
    if (!session || evaluation || answer.trim().length < 12) {
      setLiveFeedback(null);
      return undefined;
    }
    clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(async () => {
      try {
        const data = await request(`/interviews/${session.id}/live-feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer }) });
        setLiveFeedback(data);
      } catch { /* Live coaching is optional; do not interrupt a candidate typing. */ }
    }, 450);
    return () => clearTimeout(feedbackTimer.current);
  }, [answer, session, evaluation]);

  async function upload(file) {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const form = new FormData(); form.append('resume', file);
      const data = await request('/resumes', { method: 'POST', body: form });
      setResume(data); setQuestions([]); setSession(null); setSessionAnswers([]); setStep(2);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function generate() {
    if (!resume) return;
    setBusy(true); setError('');
    try {
      const data = await request('/questions/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...config, resumeId: resume.id }) });
      setQuestions(data.questions); setSource(data.source); setStep(3);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function beginInterview() {
    setBusy(true); setError('');
    try {
      const data = await request('/interviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resumeId: resume.id, questions, role: config.role }) });
      setSession(data); setSessionAnswers([]); setQuestionIndex(0); setAnswer(''); setEvaluation(null); setStep(4);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function submitAnswer() {
    if (answerWords < 3) return setError('Please write a little more before submitting.');
    setBusy(true); setError('');
    try {
      const data = await request(`/interviews/${session.id}/answers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionIndex, answer }) });
      setEvaluation(data.evaluation);
      setSessionAnswers((old) => { const updated = [...old]; updated[questionIndex] = data; return updated; });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  function nextQuestion() {
    if (questionIndex + 1 === questions.length) { setStep(5); return; }
    setQuestionIndex((value) => value + 1); setAnswer(''); setEvaluation(null); setLiveFeedback(null); setError('');
  }

  return <main>
    <header className="topbar"><div className="brand"><span className="brand-mark">↗</span><span>Interview<span>Coach</span></span></div><span className="status">Resume-grounded preparation</span></header>
    <section className="hero"><p className="eyebrow">PERSONALIZED INTERVIEW PRACTICE</p><h1>Practice the interview<br /><em>your resume deserves.</em></h1><p className="lede">Turn your projects, skills, and experience into focused questions - then answer them in a realistic, guided session.</p></section>
    <nav className="steps" aria-label="Progress"><span className={step >= 1 ? 'active' : ''}>01 <b>Upload</b></span><i /><span className={step >= 2 ? 'active' : ''}>02 <b>Configure</b></span><i /><span className={step >= 3 ? 'active' : ''}>03 <b>Questions</b></span><i /><span className={step >= 4 ? 'active' : ''}>04 <b>Interview</b></span></nav>
    {error && <div className="error" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}

    {step === 1 && <section className="panel upload-panel"><div><p className="section-label">YOUR STARTING POINT</p><h2>Bring your resume.</h2><p>We extract your skills, projects, education, and experience to keep every question tied to your own story.</p><ul><li>PDF and DOCX accepted</li><li>Maximum file size: 5 MB</li><li>Your file is processed for this session only</li></ul></div><label className={`dropzone ${busy ? 'busy' : ''}`}><input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => upload(e.target.files?.[0])} disabled={busy} /><span className="upload-icon">↑</span><strong>{busy ? 'Reading your resume...' : 'Upload your resume'}</strong><small>Drag and drop, or browse files</small></label></section>}

    {step === 2 && resume && <section className="panel"><div className="split-heading"><div><p className="section-label">PROFILE DETECTED</p><h2>{resume.fileName}</h2><p>We found {resume.profile.evidenceCount} pieces of resume evidence. Review the extracted context, then decide what you want to practice.</p></div><button className="text-button" onClick={() => { setResume(null); setStep(1); }}>Replace resume</button></div><div className="profile-grid"><InfoCard title="Skills" items={resume.profile.skills} /><ProjectCard projects={resume.profile.projectDetails || []} highlights={resume.profile.highlights} /><InfoCard title="Education" items={resume.profile.education} /></div><p className="knowledge-note"><b>Data-backed coaching:</b> questions combine your detected resume evidence with a curated competency rubric for the selected role. It does not claim skills that are missing from your resume.</p><div className="config"><label>Target role<select name="role" value={config.role} onChange={updateConfig}><option>Full Stack Developer</option><option>React Developer</option><option>Backend Developer</option><option>ML Engineer</option><option>General Software Developer</option></select></label><label>Focus<select name="category" value={config.category} onChange={updateConfig}><option value="mixed">Mixed interview</option><option value="technical">Technical</option><option value="project">Project-based</option><option value="conceptual">Conceptual</option><option value="scenario">Scenario-based</option><option value="behavioral">HR / Behavioral</option></select></label><label>Difficulty<select name="difficulty" value={config.difficulty} onChange={updateConfig}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label><label>Questions<select name="count" value={config.count} onChange={updateConfig}>{[3, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n} questions</option>)}</select></label></div><button className="primary" onClick={generate} disabled={busy}>{busy ? 'Building your question set...' : 'Generate my questions →'}</button></section>}

    {step === 3 && <section className="panel"><div className="split-heading"><div><p className="section-label">YOUR QUESTION SET</p><h2>Prepared for {config.role}</h2><p>Every question points back to resume evidence. Generated with {source}.</p></div><button className="text-button" onClick={() => setStep(2)}>Adjust settings</button></div><div className="question-list">{questions.map((q, index) => <article className="question-card" key={index}><div className="q-number">{String(index + 1).padStart(2, '0')}</div><div><div className="tags"><span>{q.category}</span><span>{q.difficulty}</span></div><h3>{q.question}</h3><p>Grounded in: {q.resumeEvidence.join(', ')}</p></div></article>)}</div><div className="actions"><button className="secondary" onClick={() => setStep(2)}>Back to configuration</button><button className="primary" onClick={beginInterview} disabled={busy}>Start interview mode →</button></div></section>}

    {step === 4 && session && <section className="interview-layout"><aside><p className="section-label">LIVE INTERVIEW</p><h2>Question {questionIndex + 1}<span> / {questions.length}</span></h2><div className="progress"><i style={{ width: `${((questionIndex + (evaluation ? 1 : 0)) / questions.length) * 100}%` }} /></div><ol>{questions.map((question, index) => <li className={index === questionIndex ? 'current' : index < questionIndex ? 'done' : ''} key={index}>{index + 1}<span>{question.category}</span></li>)}</ol></aside><section className="panel answer-panel"><div className="tags"><span>{questions[questionIndex].category}</span><span>{questions[questionIndex].difficulty}</span></div><h2>{questions[questionIndex].question}</h2><p className="evidence">Resume evidence: {questions[questionIndex].resumeEvidence.join(', ')}</p>{!evaluation ? <><textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Think aloud. Explain your approach, choices, and result..." aria-label="Your answer" /><div className="answer-meta"><span>{answerWords} words</span><span>{liveFeedback?.suggestion || liveHint}</span></div>{liveFeedback && <LiveCoach data={liveFeedback} />}<button className="primary" disabled={busy} onClick={submitAnswer}>{busy ? 'Reviewing your answer...' : 'Submit for feedback →'}</button></> : <Feedback data={evaluation} onNext={nextQuestion} final={questionIndex + 1 === questions.length} />}</section></section>}

    {step === 5 && <section className="panel complete"><p className="section-label">SESSION COMPLETE</p><h2>That was a meaningful rehearsal.</h2><p>You completed {questions.length} resume-grounded questions for a {config.role} interview. Your average coach score was <b>{sessionAnswers.length ? (sessionAnswers.reduce((sum, item) => sum + item.evaluation.score, 0) / sessionAnswers.length).toFixed(1) : '—'} / 10</b>.</p><div className="review-grid">{sessionAnswers.map((item, index) => <article key={index}><span>Q{index + 1}</span><strong>{item.evaluation.score}/10</strong><p>{item.evaluation.nextFocus || item.evaluation.followUpTip}</p></article>)}</div><div className="actions"><button className="secondary" onClick={() => setStep(2)}>Create another set</button><button className="primary" onClick={() => { setStep(4); setQuestionIndex(0); setAnswer(''); setEvaluation(null); }}>Review again</button></div></section>}
    <footer>AI feedback is preparation guidance, not a hiring decision.</footer>
  </main>;
}

function InfoCard({ title, items }) { return <article className="info-card"><h3>{title}</h3>{items.length ? <ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p>Not confidently detected - it will still remain available as resume context.</p>}</article>; }
function ProjectCard({ projects, highlights }) { return <article className="info-card project-card"><h3>Projects & highlights</h3>{projects.length ? <div className="project-list">{projects.map((project, index) => <details key={`${project.title}-${index}`} open={index === 0}><summary>{project.title}</summary>{project.details.length ? <ul>{project.details.map((detail, detailIndex) => <li key={detailIndex}>{detail}</li>)}</ul> : <p>Project title detected. The full resume remains available for question generation.</p>}</details>)}</div> : <InfoCardItems items={highlights} />}</article>; }
function InfoCardItems({ items }) { return items.length ? <ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p>Not confidently detected - it will still remain available as resume context.</p>; }
function LiveCoach({ data }) { const labels = { context: 'Context', action: 'Action', reasoning: 'Reasoning', result: 'Result' }; return <section className="live-coach" aria-live="polite"><div><span className="live-dot" /> Live answer coach <small>{data.matchedSkills.length ? `Detected: ${data.matchedSkills.join(', ')}` : 'Checking answer structure'}</small></div><ul>{Object.entries(data.coverage).map(([key, present]) => <li className={present ? 'covered' : ''} key={key}>{present ? '✓' : '○'} {labels[key]}</li>)}</ul></section>; }
function Feedback({ data, onNext, final }) { return <div className="feedback"><div className="score"><strong>{data.score}</strong><span>/10</span><p>Coach score</p></div><div><h3>What worked</h3><ul>{data.strengths.map((item, i) => <li key={i}>{item}</li>)}</ul><h3>Try next</h3><p>{data.feedback}</p><p className="tip">Tip: {data.followUpTip}</p><button className="primary" onClick={onNext}>{final ? 'Finish session →' : 'Next question →'}</button></div></div>; }

createRoot(document.getElementById('root')).render(<App />);
