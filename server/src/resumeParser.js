const sectionDefinitions = [
  ['skills', /^(technical\s+)?skills?(\s*(and|&)\s*tools?)?$/i],
  ['projects', /^(academic\s+|personal\s+|key\s+|major\s+)?projects?(\s*(and|&)\s*(achievements|work))?$/i],
  ['experience', /^(work\s+)?experience$|^professional\s+experience$|^internships?$/i],
  ['education', /^education(\s*(and|&)\s*qualifications?)?$/i],
  ['certifications', /^certifications?(\s*(and|&)\s*(achievements|courses?))?$/i]
];

export const normalizeResumeText = (text) => text
  .replace(/\u0000/g, '')
  .replace(/\r/g, '')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const cleanLine = (line) => line
  .replace(/^\s*(?:[•▪◦‣*]|[-–—]|\d+[.)])\s*/, '')
  .replace(/\s+/g, ' ')
  .trim();

const sectionFor = (line) => {
  const compact = cleanLine(line).replace(/[:|]+$/, '').trim();
  return sectionDefinitions.find(([, pattern]) => pattern.test(compact))?.[0] || null;
};

const isBullet = (line) => /^\s*(?:[•▪◦‣*]|[-–—]|\d+[.)])\s+/.test(line);
const looksLikeTitle = (line) => {
  const value = cleanLine(line);
  if (value.length < 3 || value.length > 100 || /[.!?]$/.test(value)) return false;
  if ((value.match(/,/g) || []).length >= 2) return false;
  if (/^(built|developed|implemented|designed|created|used|worked|responsible|technologies|tech\s*stack|features?|added|improved|integrated|deployed|managed|led)\b/i.test(value)) return false;
  if (/\b(app|application|system|platform|portal|website|dashboard|management|generator|predictor|tracker|analyzer|model)\b/i.test(value)) return true;
  return /^[A-Z][A-Za-z0-9 .,&()/+:#-]+(?:\s*[|:-]\s*[A-Za-z0-9 .,&()/+:#-]+)?$/.test(value) && value.split(' ').length <= 10;
};

function projectEntries(lines) {
  const entries = [];
  let current = null;
  const start = (raw) => {
    const value = cleanLine(raw);
    if (!value) return;
    current = { title: value, details: [] };
    entries.push(current);
  };

  for (const raw of lines) {
    const value = cleanLine(raw);
    if (!value) continue;
    const explicitStart = /^project\s*[:#-]/i.test(value);
    const startsNewProject = explicitStart || (isBullet(raw) && looksLikeTitle(value)) || (looksLikeTitle(value) && current?.details.length > 0);
    if (!current || startsNewProject) {
      start(value.replace(/^project\s*[:#-]\s*/i, ''));
    } else {
      current.details.push(value);
    }
  }

  return entries.map((entry) => ({
    ...entry,
    details: [...new Set(entry.details)].slice(0, 8)
  })).filter((entry) => entry.title.length > 2);
}

/**
 * Extracts resume sections without assuming a fixed number of lines. It keeps
 * every detected project and its wrapped detail lines for the UI and LLM.
 */
export function parseResume(text) {
  const clean = normalizeResumeText(text);
  const sections = { skills: [], projects: [], experience: [], education: [], certifications: [] };
  let activeSection = null;

  for (const raw of clean.split('\n')) {
    const heading = sectionFor(raw);
    if (heading) {
      activeSection = heading;
      continue;
    }
    const value = cleanLine(raw);
    if (activeSection && value) sections[activeSection].push({ raw, value });
  }

  const projectDetails = projectEntries(sections.projects.map((item) => item.raw));
  const toValues = (section) => [...new Set(sections[section].map((item) => item.value))].slice(0, 16);
  return {
    clean,
    skillsText: toValues('skills'),
    projects: projectDetails.map((project) => project.title),
    projectDetails,
    education: toValues('education'),
    experience: toValues('experience'),
    certifications: toValues('certifications'),
    lines: clean.split('\n').map(cleanLine).filter(Boolean)
  };
}
