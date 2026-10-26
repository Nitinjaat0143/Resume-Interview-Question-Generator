import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResume } from '../src/resumeParser.js';

test('retains every bullet project and its detail lines', () => {
  const profile = parseResume(`Nitin Singh\nPROJECTS\n• Resume Interview Coach\n  Built a React interface and Express API.\n  Technologies: React, Node.js, MongoDB\n• Expense Tracker\n  Implemented authentication and monthly reports.\nEDUCATION\nB.Tech Computer Science`);
  assert.deepEqual(profile.projects, ['Resume Interview Coach', 'Expense Tracker']);
  assert.deepEqual(profile.projectDetails[0].details, ['Built a React interface and Express API.', 'Technologies: React, Node.js, MongoDB']);
  assert.deepEqual(profile.projectDetails[1].details, ['Implemented authentication and monthly reports.']);
});

test('does not mistake a nested detail bullet for a new project', () => {
  const profile = parseResume(`PROJECTS\n• Campus Portal\n• Built a role-based student dashboard\n• Used React, Express and MongoDB\n• Placement Tracker\n• Added interview status analytics`);
  assert.deepEqual(profile.projects, ['Campus Portal', 'Placement Tracker']);
  assert.deepEqual(profile.projectDetails[0].details, ['Built a role-based student dashboard', 'Used React, Express and MongoDB']);
});

test('detects unbulleted project titles and preserves wrapped details', () => {
  const profile = parseResume(`PROJECTS\nSmart Attendance System\nFace-recognition attendance for classrooms\nPython, OpenCV, Flask\nPortfolio Website\nResponsive personal site with contact form\nHTML, CSS, JavaScript\nSKILLS\nPython, JavaScript`);
  assert.deepEqual(profile.projects, ['Smart Attendance System', 'Portfolio Website']);
  assert.equal(profile.projectDetails[1].details[0], 'Responsive personal site with contact form');
});
