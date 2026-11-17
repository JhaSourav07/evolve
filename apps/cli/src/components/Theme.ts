export const Theme = {
  colors: {
    background: '#121212',
    text: '#EDEDED',          // Crisp white for primary reading
    silver: '#D1D5DB',        // Muted silver for subheaders and highlights
    dim: '#6B7280',           // Neutral grey for secondary info and line counts
    border: '#2E2E32',        // Charcoal border
    borderSubtle: '#222225',  // Very faint border guide
    accent: '#FFFFFF',        // Pure white accent (minimalist Pi/Claude style)
    user: '#FFFFFF',          // Clean white user prompt
    assistant: '#E5E7EB',     // Off-white assistant body
    tool: '#9CA3AF',          // Muted silver for tool names
    success: '#34D399',       // Restrained emerald green
    warning: '#FBBF24',       // Restrained amber
    error: '#F87171',         // Restrained red
    charcoal: '#1E1E22',      // Deep charcoal background for code/boxes
  },
  icons: {
    bullet: '●',
    bulletOpen: '○',
    check: '✓',
    cross: '✗',
    arrowRight: '→',
    prompt: '❯',
    bar: '│',
    sparkle: '✦',
    git: '⎇',
    database: '⛁',
    tool: '›',
    shield: '⛨',
    spinnerFrames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  },
} as const;
