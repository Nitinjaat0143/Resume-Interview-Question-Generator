// Curated, versioned domain knowledge used by the local coach. This is not
// resume data and it never overrides facts extracted from a candidate resume.
export const roleKnowledge = {
  'Full Stack Developer': {
    priorities: ['API design', 'data flow', 'authentication', 'performance', 'testing'],
    concepts: ['client-server contract', 'REST status codes', 'database indexing', 'input validation', 'deployment'],
    keywords: ['api', 'frontend', 'backend', 'database', 'authentication', 'test', 'deploy']
  },
  'React Developer': {
    priorities: ['component design', 'state management', 'rendering performance', 'accessibility', 'testing'],
    concepts: ['props and state', 'hooks', 'controlled inputs', 'memoization', 'semantic HTML'],
    keywords: ['react', 'component', 'state', 'hook', 'render', 'accessibility', 'test']
  },
  'Backend Developer': {
    priorities: ['API reliability', 'data modelling', 'security', 'observability', 'scalability'],
    concepts: ['HTTP semantics', 'validation', 'authentication', 'indexes', 'error handling'],
    keywords: ['api', 'server', 'database', 'mongodb', 'sql', 'express', 'node', 'auth']
  },
  'ML Engineer': {
    priorities: ['data quality', 'model evaluation', 'feature engineering', 'deployment', 'monitoring'],
    concepts: ['train-validation split', 'precision and recall', 'overfitting', 'data leakage', 'reproducibility'],
    keywords: ['python', 'machine learning', 'tensorflow', 'pandas', 'numpy', 'model', 'data']
  },
  'General Software Developer': {
    priorities: ['problem solving', 'clean design', 'testing', 'debugging', 'collaboration'],
    concepts: ['time complexity', 'modularity', 'version control', 'testing', 'error handling'],
    keywords: ['javascript', 'java', 'python', 'git', 'api', 'test', 'project']
  }
};

export const getRoleKnowledge = (role) => roleKnowledge[role] || roleKnowledge['General Software Developer'];
