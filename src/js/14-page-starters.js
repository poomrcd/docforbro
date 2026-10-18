/* ============================================================================
   14-page-starters.js — Starter page templates (Drop 10B, v2)
   Icons removed. Pure data — used by "+ New page" modal in 13-pages.js
   ============================================================================ */

function _starterBlock(type, opts) {
  var id = 'blk-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  return Object.assign({ id: id, type: type }, opts || {});
}

var PAGE_STARTERS = [

  /* ── 1. Blank ─────────────────────────────────────────────────── */
  {
    id: 'blank',
    name: 'Blank page',
    description: 'Start from scratch',
    build: function () {
      return {
        title: 'Untitled page',
        blocks: [
          _starterBlock('paragraph', { text: '' })
        ]
      };
    }
  },

  /* ── 2. Project kickoff plan ──────────────────────────────────── */
  {
    id: 'kickoff',
    name: 'Project kickoff plan',
    description: 'Goals, stakeholders, milestones, risks',
    build: function () {
      return {
        title: 'Project kickoff plan',
        blocks: [
          _starterBlock('h1', { text: 'Project kickoff plan' }),
          _starterBlock('paragraph', { text: 'A short overview of the project — what it is, why it matters, and what success looks like.' }),
          _starterBlock('h2', { text: 'Goals' }),
          _starterBlock('bullet', { items: ['', '', ''] }),
          _starterBlock('h2', { text: 'Stakeholders' }),
          _starterBlock('table', { rows: [['Name', 'Role'], ['', ''], ['', ''], ['', '']] }),
          _starterBlock('h2', { text: 'Milestones' }),
          _starterBlock('todo', { text: '', checked: false }),
          _starterBlock('todo', { text: '', checked: false }),
          _starterBlock('todo', { text: '', checked: false }),
          _starterBlock('h2', { text: 'Risks & Notes' }),
          _starterBlock('paragraph', { text: '' })
        ]
      };
    }
  },

  /* ── 3. Weekly client update ──────────────────────────────────── */
  {
    id: 'weekly',
    name: 'Weekly client update',
    description: 'Share progress with your client',
    build: function () {
      return {
        title: 'Weekly update',
        blocks: [
          _starterBlock('h1', { text: 'Weekly update' }),
          _starterBlock('callout', { icon: '📅', text: 'Week of ' }),
          _starterBlock('h2', { text: 'What happened this week' }),
          _starterBlock('bullet', { items: ['', '', ''] }),
          _starterBlock('h2', { text: "What's next" }),
          _starterBlock('bullet', { items: ['', ''] }),
          _starterBlock('h2', { text: 'Blockers' }),
          _starterBlock('paragraph', { text: 'None at the moment.' }),
          _starterBlock('divider', {}),
          _starterBlock('paragraph', { text: 'Questions? Just reply to this note.' })
        ]
      };
    }
  },

  /* ── 4. Meeting notes ─────────────────────────────────────────── */
  {
    id: 'meeting',
    name: 'Meeting notes',
    description: 'Attendees, agenda, decisions, actions',
    build: function () {
      return {
        title: 'Meeting notes',
        blocks: [
          _starterBlock('h1', { text: 'Meeting notes' }),
          _starterBlock('paragraph', { text: 'Date: ' }),
          _starterBlock('paragraph', { text: 'Attendees: ' }),
          _starterBlock('h2', { text: 'Agenda' }),
          _starterBlock('numbered', { items: ['', '', ''] }),
          _starterBlock('h2', { text: 'Decisions' }),
          _starterBlock('bullet', { items: ['', ''] }),
          _starterBlock('h2', { text: 'Action items' }),
          _starterBlock('todo', { text: '', checked: false }),
          _starterBlock('todo', { text: '', checked: false }),
          _starterBlock('todo', { text: '', checked: false })
        ]
      };
    }
  },

  /* ── 5. Project brief ─────────────────────────────────────────── */
  {
    id: 'brief',
    name: 'Project brief',
    description: 'Objectives, scope, deliverables, metrics',
    build: function () {
      return {
        title: 'Project brief',
        blocks: [
          _starterBlock('h1', { text: 'Project brief' }),
          _starterBlock('h2', { text: 'Overview' }),
          _starterBlock('paragraph', { text: '' }),
          _starterBlock('h2', { text: 'Objectives' }),
          _starterBlock('bullet', { items: ['', ''] }),
          _starterBlock('h2', { text: 'Scope' }),
          _starterBlock('table', { rows: [['Deliverable', 'Timeline', 'Owner'], ['', '', ''], ['', '', ''], ['', '', '']] }),
          _starterBlock('h2', { text: 'Success metrics' }),
          _starterBlock('bullet', { items: ['', ''] }),
          _starterBlock('h2', { text: 'Budget' }),
          _starterBlock('paragraph', { text: '' })
        ]
      };
    }
  }

];