/* ============================================================================
   05-studio.js — Templates library, gallery, editor shell, preview
   v9 — Fixes template button by safely scoping the dirty flag.
   ============================================================================ */

/* ============================================================================
   1. Constants
   ============================================================================ */
const PAGE_MM   = 96 / 25.4;
const PAGE_W    = 210 * PAGE_MM;
const PAGE_H    = 297 * PAGE_MM;
const CONTENT_H = PAGE_H - (15 + 12) * PAGE_MM;
const SAFETY    = 8;

const FONTS = {
  modern:   { label: 'Modern (system)', stack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  sans:     { label: 'Clean Sans',      stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  serif:    { label: 'Classic Serif',   stack: 'Georgia, "Times New Roman", Times, serif' },
  elegant:  { label: 'Elegant Serif',   stack: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif' },
  friendly: { label: 'Friendly',        stack: '"Trebuchet MS", "Segoe UI", Tahoma, sans-serif' },
  mono:     { label: 'Technical Mono',  stack: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
};

const ACCENTS = [
  '#2A2A2E', '#475569', '#6B7280',
  '#4f46e5', '#1d4ed8', '#0f766e',
  '#15803d', '#b45309', '#be123c', '#7c3aed',
];

const DOC_CURRENCIES = ['USD','EUR','GBP','AUD','CAD','INR'];

/* ============================================================================
   2. Template schema helpers
   ============================================================================ */
const fld = (label, value, opts = {}) =>
  Object.assign({ label, value, type: 'text', required: false, width: 'half' }, opts);

const sec = (title, fields, opts = {}) =>
  Object.assign({ id: uid(), type: 'fields', title, columns: 2, fields }, opts);

const txt  = (title, value) => ({ id: uid(), type: 'text', title, value });
const note = value           => ({ id: uid(), type: 'notice', value });
const tbl  = (title, rows, totals) => ({ id: uid(), type: 'table', title, rows, totals });
const sig  = (title = 'Signatures') => ({
  id: uid(), type: 'signature', title,
  slots: [
    { role: 'client',     label: 'Client Signature',     name: 'John Smith' },
    { role: 'freelancer', label: 'Freelancer Signature', name: 'Your Studio' },
  ],
});

/* ============================================================================
   3. Built-in template library — 19 presets
   ============================================================================ */
const TEMPLATES = [
  {
    id: 'blank', name: 'Blank Document', category: 'Custom',
    desc: 'Start from scratch and build your own document structure.',
    accent: '#475569',
    defaults: { fontSize: 10.5, spacing: 'normal' },
    doc: { title: 'Untitled Document', subtitle: '' },
    meta: [],
    sections: [
      txt('Section Title', 'Start writing your content here.\n\nUse the + Add Section button at the bottom of the Content tab to add fields, text blocks, notice boxes, or a signature area.'),
    ],
  },
  {
    id: 'onboarding', name: 'Client Onboarding Form', category: 'Client Intake',
    desc: 'Collect essential client information before starting a project.',
    accent: '#4f46e5',
    defaults: { fontSize: 9.5, spacing: 'compact' },
    doc: { title: 'Client Onboarding Form', subtitle: 'Please complete the details below so we can get started.' },
    meta: [{ label: 'Date', value: '14 Feb 2026' }],
    sections: [
      sec('Client Information', [
        fld('Client Name', 'John Smith'),
        fld('Company', 'Smith & Co.'),
        fld('Email', 'john@smithco.com'),
        fld('Phone', '+1 (555) 987-6543'),
        fld('Address', '45 Oak Avenue, Austin, TX 78701', { width: 'full' }),
        fld('Preferred Contact', 'Email'),
        fld('Best Time to Reach', 'Weekdays, 9am–5pm CT'),
      ]),
      sec('Project Information', [
        fld('Project Title', 'Marketing Website Redesign'),
        fld('Project Type', 'Web Design & Development'),
        fld('Start Date', '02 Mar 2026'),
        fld('Target Completion', '24 Apr 2026'),
        fld('Project Summary', 'A complete redesign of the company website with a refreshed visual system, a clearer content structure, and a lightweight CMS.', { type: 'textarea', width: 'full' }),
      ]),
      sec('Services Required', [
        fld('Included Services', '- Discovery workshop and sitemap\n- UI design for up to 8 pages\n- Responsive front-end build\n- CMS setup and content migration\n- Analytics and basic SEO setup', { type: 'textarea', width: 'full' }),
      ]),
      sec('Goals & Budget', [
        fld('Primary Goals', '- Increase qualified demo requests by 30%\n- Communicate the new brand positioning clearly', { type: 'textarea', width: 'full' }),
        fld('Budget Range', '$12,000 – $18,000'),
        fld('Billing Preference', '50% deposit / 50% on delivery'),
      ]),
      sec('Communication', [
        fld('Preferred Channel', 'Email + weekly video call'),
        fld('Meeting Cadence', 'Weekly, Tuesdays 10:00 CT'),
        fld('Time Zone', 'America/Chicago (CST)'),
        fld('Response Expectation', 'Within 1 business day'),
      ]),
      txt('Additional Notes', 'Anything else we should know before we begin? Add it here.'),
      sig('Signature & Confirmation'),
    ],
  },
  {
    id: 'proposal', name: 'Proposal / Quote', category: 'Discovery',
    desc: 'Win the project with a clear, confident proposal and itemised pricing.',
    accent: '#0f766e',
    defaults: { fontSize: 9.5, spacing: 'compact' },
    doc: { title: 'Proposal', subtitle: 'Prepared for Smith & Co.' },
    meta: [
      { label: 'Date', value: '14 Feb 2026' },
      { label: 'Valid Until', value: '16 Mar 2026' },
      { label: 'Reference', value: 'PROP-2026-007' },
    ],
    sections: [
      txt('Overview', 'Thank you for the opportunity to propose on the Smith & Co. website redesign. This document outlines our understanding of the project, the approach we recommend, the timeline, and the investment required.'),
      sec('Prepared For', [
        fld('Client', 'John Smith'),
        fld('Company', 'Smith & Co.'),
        fld('Email', 'john@smithco.com'),
        fld('Phone', '+1 (555) 987-6543'),
      ]),
      txt('Objectives', '- Increase qualified demo requests by 30% within 6 months\n- Communicate the new brand positioning clearly\n- Reduce the effort required to publish new content'),
      txt('Scope of Work', 'Discovery and strategy — a kick-off workshop, sitemap, and low-fidelity wireframes for the core pages.\n\nDesign — high-fidelity responsive designs for up to eight pages, plus a small component library.\n\nBuild — a production front-end built on Next.js with a headless CMS, deployed to Vercel.\n\nLaunch support — content migration, analytics, and a 30-day bug-fix window.'),
      txt('Timeline', 'Eight weeks, from kick-off to launch. Timelines assume client feedback is returned within three business days at each review gate.'),
      tbl('Investment', [
        { description: 'Discovery & strategy', qty: 1, rate: 3200 },
        { description: 'UI design — 8 pages', qty: 1, rate: 6400 },
        { description: 'Front-end build',     qty: 1, rate: 8800 },
        { description: 'Launch support',      qty: 1, rate: 1800 },
      ], { discountValue: 0, discountType: 'percent', taxRate: 0 }),
      txt('Why Us', "We've built and shipped a dozen marketing sites for B2B SaaS teams and know how to balance polish with maintainability."),
      txt('Next Steps', "1. Review this proposal and reply with any questions.\n2. We'll schedule a 30-minute call to finalise scope.\n3. We'll send the agreement and deposit invoice.\n4. Work begins on receipt of the deposit."),
      sig('Acceptance'),
    ],
  },
  {
    id: 'agreement', name: 'Freelance Service Agreement', category: 'Legal',
    desc: 'Define scope, payment terms, responsibilities, and project conditions.',
    accent: '#1d4ed8',
    defaults: { fontSize: 8.5, spacing: 'compact' },
    doc: { title: 'Freelance Service Agreement', subtitle: '' },
    meta: [{ label: 'Effective Date', value: '02 Mar 2026' }],
    sections: [
      note('This is a general-purpose template provided for convenience only. It does not constitute legal advice. Consult a qualified professional before relying on it.'),
      sec('Parties', [
        fld('Freelancer', 'Your Studio LLC'),
        fld('Client', 'Smith & Co.'),
        fld('Client Contact', 'John Smith'),
        fld('Client Address', '45 Oak Avenue, Austin, TX 78701', { width: 'full' }),
      ]),
      txt('Project Description', 'Design and development of a responsive marketing website, including discovery, visual design, front-end build, CMS setup, and launch support.'),
      txt('Scope of Services', '- Discovery workshop, sitemap, and wireframes\n- Visual design for up to 8 responsive pages\n- Front-end development and CMS integration\n- Content migration and launch support'),
      txt('Deliverables', '- Figma design file\n- Production website\n- CMS training session (recorded)\n- 30 days of post-launch bug support'),
      txt('Timeline', 'Work begins on 2 March 2026 and is scheduled for completion by 24 April 2026.'),
      txt('Fees & Payment Schedule', 'Total project fee: $16,400.\n- 50% deposit ($8,200) due on signing\n- 25% ($4,100) due on design approval\n- 25% ($4,100) due on delivery'),
      txt('Revisions', 'Two rounds of revisions are included at each design milestone. Additional revisions are billed at $95 per hour.'),
      txt('Client Responsibilities', 'The client will provide brand assets, copy, imagery, system access, and timely feedback.'),
      txt('Cancellation & Termination', "Either party may terminate with 14 days' written notice. Work completed to date remains billable."),
      txt('Intellectual Property & Confidentiality', 'On receipt of full payment the client receives full ownership of the final deliverables.'),
      sig('Signatures'),
    ],
  },
  {
    id: 'sow', name: 'Statement of Work', category: 'Legal',
    desc: 'Attach a detailed SOW to an agreement when scope needs spelling out.',
    accent: '#7c3aed',
    defaults: { fontSize: 9, spacing: 'compact' },
    doc: { title: 'Statement of Work', subtitle: 'Attachment to the Freelance Service Agreement' },
    meta: [
      { label: 'Effective Date', value: '02 Mar 2026' },
      { label: 'Project Ref', value: 'SOW-2026-014' },
    ],
    sections: [
      sec('Parties', [
        fld('Freelancer', 'Your Studio LLC'),
        fld('Client', 'Smith & Co.'),
        fld('Project Manager', 'John Smith'),
        fld('Agreement Reference', 'Agreement dated 02 Mar 2026'),
      ]),
      txt('Project Description', 'A complete redesign of the Smith & Co. marketing website.'),
      txt('Deliverables', '- Sitemap and wireframes\n- High-fidelity designs for 8 pages\n- Component library\n- Production website\n- Content migration\n- Analytics and SEO setup\n- CMS training session'),
      txt('Milestones', 'M1 — Discovery complete (Week 2)\nM2 — Wireframes approved (Week 3)\nM3 — Visual designs approved (Week 5)\nM4 — Development complete (Week 7)\nM5 — Launch (Week 8)'),
      txt('Assumptions', 'Client provides brand assets within 5 business days of each request.'),
      txt('Out of Scope', 'Copywriting, photography, ongoing SEO campaigns, paid media.'),
      txt('Fees', 'Fixed-fee engagement of $16,400, invoiced in three instalments.'),
      txt('Acceptance', 'Deliverables are considered accepted when the client provides written approval, or after ten business days.'),
      sig('Approval'),
    ],
  },
  {
    id: 'nda', name: 'Mutual Non-Disclosure Agreement', category: 'Legal',
    desc: 'Protect confidential information before you start discussing a project.',
    accent: '#334155',
    defaults: { fontSize: 9, spacing: 'compact' },
    doc: { title: 'Mutual Non-Disclosure Agreement', subtitle: '' },
    meta: [{ label: 'Effective Date', value: '14 Feb 2026' }],
    sections: [
      note('A general-purpose mutual NDA. Not legal advice.'),
      txt('Parties', 'This Mutual Non-Disclosure Agreement is entered into as of the Effective Date above by and between Your Studio LLC and Smith & Co.'),
      txt('Purpose', 'The Parties wish to explore a potential business relationship (the "Purpose") and may disclose confidential information to one another.'),
      txt('Definition of Confidential Information', 'Confidential Information means any non-public information disclosed by one Party to the other.'),
      txt('Obligations', 'Each Party agrees to hold the other Party\'s Confidential Information in strict confidence, use it solely for the Purpose, and protect it with reasonable care.'),
      txt('Exclusions', 'Confidential Information does not include information that is publicly available, rightfully known, or independently developed.'),
      txt('Term', 'This Agreement remains in effect for two (2) years from the Effective Date.'),
      txt('Return of Materials', 'Upon written request, the receiving Party will promptly return or destroy all materials.'),
      txt('Governing Law', 'This Agreement is governed by the laws of the State of Texas.'),
      sig('Signatures'),
    ],
  },
  {
    id: 'invoice', name: 'Invoice', category: 'Billing',
    desc: 'Create a professional one-page invoice for your client.',
    accent: '#0f766e',
    defaults: { fontSize: 10.5, spacing: 'normal' },
    doc: { title: 'Invoice', subtitle: '' },
    meta: [
      { label: 'Invoice Number', value: 'INV-2026-014' },
      { label: 'Invoice Date', value: '14 Feb 2026' },
      { label: 'Due Date', value: '16 Mar 2026' },
    ],
    sections: [
      sec('Billed To', [
        fld('Client Name', 'John Smith'),
        fld('Company', 'Smith & Co.'),
        fld('Email', 'john@smithco.com'),
        fld('Address', '45 Oak Avenue, Austin, TX 78701', { width: 'full' }),
      ]),
      txt('Project', 'Marketing Website Redesign — Phase 2.'),
      tbl('Services', [
        { description: 'UI design — 8 responsive page layouts', qty: 8,  rate: 450 },
        { description: 'Front-end development',                 qty: 40, rate: 95 },
        { description: 'CMS setup & content migration',         qty: 1,  rate: 1200 },
        { description: 'SEO & analytics configuration',         qty: 1,  rate: 600 },
      ], { discountValue: 5, discountType: 'percent', taxRate: 8.25 }),
      txt('Payment Instructions', 'Bank transfer to:\nAccount name: Your Studio LLC\nIBAN: GB00 XXXX 0000 0000\nReference: INV-2026-014'),
      txt('Notes', 'Thank you for your business!'),
    ],
  },
  {
    id: 'estimate', name: 'Estimate', category: 'Billing',
    desc: 'A lighter, quicker quote for smaller pieces of work.',
    accent: '#b45309',
    defaults: { fontSize: 10, spacing: 'normal' },
    doc: { title: 'Estimate', subtitle: '' },
    meta: [
      { label: 'Estimate No', value: 'EST-2026-021' },
      { label: 'Date', value: '14 Feb 2026' },
      { label: 'Valid Until', value: '28 Feb 2026' },
    ],
    sections: [
      sec('Prepared For', [
        fld('Client', 'John Smith'),
        fld('Company', 'Smith & Co.'),
        fld('Email', 'john@smithco.com'),
        fld('Phone', '+1 (555) 987-6543'),
      ]),
      txt('Project Summary', 'Design and build of a single-page marketing site.'),
      tbl('Estimated Items', [
        { description: 'Landing page design', qty: 1, rate: 1800 },
        { description: 'Front-end build',     qty: 1, rate: 2400 },
        { description: 'Analytics & form setup', qty: 1, rate: 400 },
      ], { discountValue: 0, discountType: 'percent', taxRate: 0 }),
      txt('Notes & Assumptions', 'Estimate assumes all copy and imagery are provided by the client.'),
      txt('How to Accept', 'Reply to this estimate with written approval.'),
      sig('Acceptance'),
    ],
  },
  {
    id: 'receipt', name: 'Payment Receipt', category: 'Billing',
    desc: 'Confirm a payment was received.',
    accent: '#15803d',
    defaults: { fontSize: 10.5, spacing: 'normal' },
    doc: { title: 'Payment Receipt', subtitle: '' },
    meta: [
      { label: 'Receipt No', value: 'RCP-2026-008' },
      { label: 'Date Issued', value: '14 Feb 2026' },
    ],
    sections: [
      sec('Received From', [
        fld('Client', 'John Smith'),
        fld('Company', 'Smith & Co.'),
        fld('Email', 'john@smithco.com'),
        fld('Payment Method', 'Bank transfer'),
      ]),
      txt('Payment For', 'Marketing Website Redesign — milestone 2.'),
      tbl('Summary', [
        { description: 'Milestone 2 — 25% of project fee', qty: 1, rate: 4100 },
      ], { discountValue: 0, discountType: 'percent', taxRate: 0 }),
      txt('Notes', 'This receipt confirms payment has been received in full.'),
      sig('Issued By'),
    ],
  },
  {
    id: 'retainer', name: 'Retainer Agreement', category: 'Legal',
    desc: 'Lock in recurring revenue with a clear monthly retainer.',
    accent: '#7c3aed',
    defaults: { fontSize: 9, spacing: 'compact' },
    doc: { title: 'Retainer Agreement', subtitle: '' },
    meta: [{ label: 'Start Date', value: '01 Apr 2026' }],
    sections: [
      sec('Parties', [
        fld('Freelancer', 'Your Studio LLC'),
        fld('Client', 'Smith & Co.'),
        fld('Client Contact', 'John Smith'),
        fld('Term', '12 months, auto-renewing'),
      ]),
      txt('Services', 'Ongoing design and development support for the Smith & Co. marketing site.'),
      txt('Scope & Priorities', 'Work is prioritised in a shared backlog.'),
      sec('Monthly Fee', [
        fld('Monthly Fee', '$2,400'),
        fld('Included Hours', '24 hours per month'),
        fld('Overage Rate', '$115 per hour'),
        fld('Billing Cycle', 'Monthly in advance, on the 1st'),
      ]),
      txt('Hours & Rollover', 'Unused hours roll over for one calendar month only.'),
      txt('Response Times', 'Standard requests are acknowledged within one business day.'),
      txt('Termination', "Either party may terminate with 30 days' written notice."),
      sig('Signatures'),
    ],
  },
  {
    id: 'welcome', name: 'Welcome Guide', category: 'Client Experience',
    desc: 'Set expectations and start every project on the right foot.',
    accent: '#7c3aed',
    defaults: { fontSize: 9, spacing: 'compact' },
    doc: { title: 'Welcome Guide', subtitle: 'Everything you need to know about working together.' },
    meta: [{ label: 'Prepared For', value: 'John Smith, Smith & Co.' }],
    sections: [
      txt('Welcome', "Thank you for choosing to work with us — we're genuinely excited to get started."),
      txt('About Us', 'Your Studio is a small independent design and development practice.'),
      txt('What Happens Next', '- We confirm the project scope and schedule\n- We send the agreement and deposit invoice\n- We book the kick-off call\n- Design work begins within 3 business days'),
      sec('Communication', [
        fld('Primary Channel', 'Email — hello@yourstudio.com'),
        fld('Project Updates', 'Every Friday afternoon'),
        fld('Meetings', 'Weekly video call, Tuesdays 10:00 CT'),
        fld('Working Hours', 'Mon–Fri, 9:00–17:00 CT'),
      ]),
      txt('Our Process', 'Every project moves through four stages: Discovery, Design, Build, and Launch.'),
      txt('Response Times', 'We reply to emails within one business day.'),
      txt('Your Responsibilities', 'Timely feedback, content and assets, and a single nominated decision-maker.'),
      txt('Payment Information', 'Invoices are issued at each milestone and are payable within 14 days.'),
      txt('Frequently Asked Questions', '- What if I need changes after launch? We offer a 30-day support window.\n- Who owns the files? You do, once the final invoice is paid.\n- Can we add to the scope? Absolutely.'),
      sec('Contact', [
        fld('Email', 'hello@yourstudio.com'),
        fld('Phone', '+1 (555) 012-3456'),
        fld('Website', 'www.yourstudio.com'),
        fld('Address', '123 Market Street, San Francisco, CA', { width: 'full' }),
      ]),
    ],
  },
  {
    id: 'brief', name: 'Project Brief', category: 'Discovery',
    desc: 'Ask the right questions before you write a proposal.',
    accent: '#ea580c',
    defaults: { fontSize: 9.5, spacing: 'compact' },
    doc: { title: 'Project Brief', subtitle: 'A short questionnaire so we can plan accurately.' },
    meta: [
      { label: 'Completed By', value: 'John Smith' },
      { label: 'Date', value: '14 Feb 2026' },
    ],
    sections: [
      sec('About Your Business', [
        fld('Company', 'Smith & Co.'),
        fld('Industry', 'B2B SaaS'),
        fld('Website', 'www.smithco.com'),
        fld('What do you do?', 'We help operations teams automate their vendor onboarding.', { type: 'textarea', width: 'full' }),
      ]),
      sec('Project Overview', [
        fld('Project Name', 'Marketing Website Redesign'),
        fld('Ideal Start Date', '02 Mar 2026'),
        fld('Ideal Launch Date', '24 Apr 2026'),
        fld('What prompted this project?', 'Our current site is four years old and hard to update.', { type: 'textarea', width: 'full' }),
      ]),
      txt('Goals & Objectives', '- Increase qualified demo requests by 30%\n- Communicate the new positioning clearly\n- Make it easy for the team to publish updates'),
      txt('Target Audience', 'Operations and procurement leads at mid-market companies.'),
      txt('Scope & Deliverables', '- Discovery and sitemap\n- Visual design for 8 pages\n- Responsive build\n- CMS setup and training'),
      txt('Design Preferences', 'Clean, confident, and uncluttered.'),
      txt('Content & Assets', 'We have brand guidelines and roughly 60% of the copy ready.'),
      sec('Budget & Timeline', [
        fld('Budget Range', '$12,000 – $18,000'),
        fld('Decision Maker', 'John Smith, CEO'),
        fld('Approval Process', 'One review round per stage'),
        fld('Hard Deadlines', 'Conference launch on 30 Apr 2026'),
      ]),
      txt('Success Metrics', 'Demo requests, time on page, Lighthouse performance above 90.'),
      txt('Anything Else?', "We'd like the new site to be easy to extend with a blog later this year."),
    ],
  },
  {
    id: 'payment-terms', name: 'Payment Terms / Policy', category: 'Billing',
    desc: 'A clear, standalone summary of how you get paid.',
    accent: '#0891b2',
    defaults: { fontSize: 10, spacing: 'normal' },
    doc: { title: 'Payment Terms & Policy', subtitle: 'Effective from 02 March 2026' },
    meta: [{ label: 'Applies To', value: 'Smith & Co.' }],
    sections: [
      txt('Payment Schedule', 'Projects are invoiced in milestones: a 50% deposit, 25% on design approval, and 25% on delivery.'),
      txt('Accepted Methods', 'Bank transfer, all major credit and debit cards, and ACH in the United States.'),
      txt('Deposits', 'The deposit reserves your slot in the production calendar and is non-refundable once work has begun.'),
      txt('Late Payments', 'Invoices are due within 14 days. Balances unpaid after 30 days accrue 1.5% interest per month.'),
      txt('Refunds & Cancellation', 'If you cancel mid-project, you are billed for all work completed to date.'),
      txt('Expenses', 'Third-party costs are billed at cost with prior written approval.'),
      txt('Taxes', 'All fees are exclusive of applicable sales tax, VAT, and withholding.'),
      txt('Questions', "If anything here is unclear, please get in touch before work begins."),
    ],
  },
  {
    id: 'client-sheet', name: 'Client Information Sheet', category: 'Client Intake',
    desc: 'A single reference page for every client contact and detail.',
    accent: '#be123c',
    defaults: { fontSize: 10, spacing: 'normal' },
    doc: { title: 'Client Information Sheet', subtitle: '' },
    meta: [{ label: 'Last Updated', value: '14 Feb 2026' }],
    sections: [
      sec('Company Details', [
        fld('Company Name', 'Smith & Co.'),
        fld('Trading Name', 'Smith'),
        fld('Website', 'www.smithco.com'),
        fld('Industry', 'B2B SaaS'),
        fld('Registered Address', '45 Oak Avenue, Austin, TX 78701', { width: 'full' }),
        fld('Tax / VAT ID', 'US-88-1234567'),
      ]),
      sec('Primary Contact', [
        fld('Name', 'John Smith'),
        fld('Role', 'Chief Executive Officer'),
        fld('Email', 'john@smithco.com'),
        fld('Phone', '+1 (555) 987-6543'),
        fld('Preferred Channel', 'Email'),
        fld('Time Zone', 'America/Chicago (CST)'),
      ]),
      sec('Billing Contact', [
        fld('Name', 'Maria Lopez'),
        fld('Role', 'Finance Manager'),
        fld('Email', 'billing@smithco.com'),
        fld('Phone', '+1 (555) 987-6500'),
        fld('Billing Address', '45 Oak Avenue, Austin, TX 78701', { width: 'full' }),
        fld('Payment Terms', 'Net 30'),
      ]),
      sec('Project Contacts', [
        fld('Technical Contact', 'Dev Patel — dev@smithco.com'),
        fld('Marketing Contact', 'Ava Chen — ava@smithco.com'),
        fld('Approver', 'John Smith'),
        fld('Approval Turnaround', '3 business days'),
      ]),
      txt('Notes', 'Client prefers written summaries after every call.'),
    ],
  },
  {
    id: 'change-order', name: 'Change Order', category: 'Legal',
    desc: 'Protect yourself from scope creep with a signed change order.',
    accent: '#b45309',
    defaults: { fontSize: 9.5, spacing: 'compact' },
    doc: { title: 'Change Order', subtitle: '' },
    meta: [
      { label: 'Change Order No', value: 'CO-2026-003' },
      { label: 'Date', value: '14 Feb 2026' },
      { label: 'Original Agreement', value: 'Agreement dated 02 Mar 2026' },
    ],
    sections: [
      sec('Parties', [
        fld('Freelancer', 'Your Studio LLC'),
        fld('Client', 'Smith & Co.'),
        fld('Project', 'Marketing Website Redesign'),
        fld('Original Scope Ref', 'SOW-2026-014'),
      ]),
      txt('Summary of Change', 'Add a pricing comparison page and a customer stories index to the marketing site.'),
      txt('Reason for Change', 'The client has launched a new pricing tier since the original scope was agreed.'),
      txt('Detailed Description', '- Design a pricing comparison page\n- Design a customer stories index page\n- Build both pages\n- Update the navigation\n- QA across devices'),
      sec('Impact', [
        fld('Additional Fee', '$1,850'),
        fld('Timeline Impact', '+4 business days'),
        fld('New Target Launch', '30 Apr 2026'),
        fld('Payment Terms', 'Invoiced on approval, Net 14'),
      ]),
      txt('Approval', 'Signing this change order confirms the additional work, fee, and timeline.'),
      sig('Signatures'),
    ],
  },
  {
    id: 'handover', name: 'Project Handover / Completion', category: 'Delivery',
    desc: 'Confirm the work is finished, delivered, and signed off.',
    accent: '#15803d',
    defaults: { fontSize: 9.5, spacing: 'compact' },
    doc: { title: 'Project Completion & Handover', subtitle: '' },
    meta: [
      { label: 'Project', value: 'Marketing Website Redesign' },
      { label: 'Completion Date', value: '24 Apr 2026' },
    ],
    sections: [
      txt('Project Summary', 'Design and development of the Smith & Co. marketing website.'),
      txt('Deliverables Provided', '- Production website\n- Figma design file\n- Recorded CMS training session\n- Brand asset export pack'),
      sec('Access & Credentials', [
        fld('Hosting', 'Vercel — owner: john@smithco.com'),
        fld('CMS', 'Sanity — admin: john@smithco.com'),
        fld('Analytics', 'Plausible — shared access'),
        fld('Repository', 'github.com/smithco/website'),
      ]),
      txt('Files & Assets', "All source files and exported assets are in the shared Drive folder."),
      txt('Outstanding Items', 'Two blog post templates remain unpublished pending final copy.'),
      txt('Support & Warranty', '30 days of bug fixes are included from the completion date.'),
      sec('Final Payment', [
        fld('Final Invoice', 'INV-2026-019'),
        fld('Amount', '$4,100.00'),
        fld('Due Date', '08 May 2026'),
        fld('Status', 'Awaiting payment'),
      ]),
      sig('Sign-off'),
    ],
  },
  {
    id: 'timesheet', name: 'Timesheet / Work Log', category: 'Billing',
    desc: 'Back up hourly invoices with a clean work log.',
    accent: '#0891b2',
    defaults: { fontSize: 9.5, spacing: 'compact' },
    doc: { title: 'Timesheet', subtitle: '' },
    meta: [
      { label: 'Week Ending', value: '20 Feb 2026' },
      { label: 'Client', value: 'Smith & Co.' },
    ],
    sections: [
      sec('Details', [
        fld('Freelancer', 'Your Studio LLC'),
        fld('Client', 'Smith & Co.'),
        fld('Period', '14 – 20 Feb 2026'),
        fld('Total Hours', '18.5'),
      ]),
      tbl('Hours Logged', [
        { description: 'Design — homepage revisions',    qty: 4,   rate: 95 },
        { description: 'Design — pricing page',           qty: 6,   rate: 95 },
        { description: 'Development — CMS schema changes',qty: 4,   rate: 95 },
        { description: 'Client calls & async review',     qty: 1.5, rate: 95 },
        { description: 'QA — cross-browser testing',      qty: 3,   rate: 95 },
      ], { discountValue: 0, discountType: 'percent', taxRate: 0 }),
      txt('Notes', 'Includes 1.5 hours of client review calls.'),
      txt('Approval', 'Please confirm the hours above are accurate.'),
    ],
  },
  {
    id: 'testimonial', name: 'Testimonial Request', category: 'Client Experience',
    desc: 'Ask happy clients for a testimonial without sounding awkward.',
    accent: '#7c3aed',
    defaults: { fontSize: 10, spacing: 'normal' },
    doc: { title: 'A Quick Favour', subtitle: 'Would you write us a testimonial?' },
    meta: [{ label: 'Date', value: '24 Apr 2026' }],
    sections: [
      txt('Dear John', 'Thank you again for trusting us with the Smith & Co. website redesign.'),
      txt('The Ask', 'Would you be happy to share a short testimonial we can feature on our website?'),
      txt('Some Prompts That Might Help', '- What problem were you trying to solve?\n- What was it like working with us?\n- What result have you seen since launch?\n- Who would you recommend us to?'),
      sec('Where to Send It', [
        fld('Email', 'hello@yourstudio.com'),
        fld('Subject', 'Testimonial — Smith & Co.'),
        fld('Alternative', 'Reply to this document'),
        fld('Deadline', 'No rush — whenever suits'),
      ]),
      txt('Attribution', 'If you\'re happy for us to use your name, role, and company, that\'s ideal.'),
      txt('Thank You', "No pressure at all — thank you for a great project."),
    ],
  },
  {
    id: 'kickoff', name: 'Kickoff Agenda / Minutes', category: 'Delivery',
    desc: 'Run a tight kickoff and send the notes the same day.',
    accent: '#1d4ed8',
    defaults: { fontSize: 9.5, spacing: 'compact' },
    doc: { title: 'Kickoff — Agenda & Notes', subtitle: 'Marketing Website Redesign' },
    meta: [
      { label: 'Date', value: '02 Mar 2026' },
      { label: 'Time', value: '10:00 – 11:00 CT' },
    ],
    sections: [
      sec('Attendees', [
        fld('From Smith & Co.', 'John Smith (CEO), Ava Chen (Marketing)'),
        fld('From Your Studio', 'Lead designer, Lead developer'),
        fld('Facilitator', 'Your Studio'),
        fld('Note-taker', 'Your Studio'),
      ]),
      txt('Agenda', '1. Introductions and working styles (5 min)\n2. Recap of the project brief (10 min)\n3. Confirm scope and out-of-scope (10 min)\n4. Walk through the timeline and milestones (10 min)\n5. Communication plan and tools (10 min)\n6. Risks and blockers (5 min)\n7. Next steps and action items (10 min)'),
      txt('Key Decisions', '- Launch date confirmed for 30 April 2026.\n- Weekly video call on Tuesdays at 10:00 CT.\n- CMS: Sanity.\n- Copy: client will provide final copy.'),
      sec('Action Items', [
        fld('Your Studio', 'Send Figma links and CMS access invite by Wed 04 Mar', { width: 'full' }),
        fld('Smith & Co.', 'Share brand assets and existing copy by Fri 06 Mar', { width: 'full' }),
        fld('Smith & Co.', 'Confirm single approver for design review', { width: 'full' }),
        fld('Your Studio', 'Book discovery workshop for Tue 10 Mar', { width: 'full' }),
      ]),
      sec('Next Meeting', [
        fld('Date', 'Tue 10 Mar 2026'),
        fld('Time', '10:00 CT'),
        fld('Focus', 'Discovery workshop'),
        fld('Link', 'Sent with calendar invite'),
      ]),
      txt('Risks & Notes', "Hard launch deadline of 30 April means any delay compresses QA time."),
      txt('Distribution', 'Sent to John Smith and Ava Chen on 02 Mar 2026.'),
    ],
  },
];

/* ============================================================================
   4. Default brand
   ============================================================================ */
const DEFAULT_BRAND = {
  businessName: 'Your Studio',
  logo: null,
  email: 'hello@yourstudio.com',
  phone: '+1 (555) 012-3456',
  website: 'www.yourstudio.com',
  address: '123 Market Street, Suite 400, San Francisco, CA 94103',
  footer: 'Thank you for your business.',
  accent: '#2A2A2E',
  font: 'sans',
  fontSize: 10.5,
  headingStyle: 'bar',
  spacing: 'normal',
  logoPosition: 'left',
  currency: 'USD',
};

/* ============================================================================
   5. Studio state
   ============================================================================ */
let studio = null;
let studioZoom = 1;
let studioFit = true;
let studioFilter = 'all';

// Ensure isStudioDirty is defined even if 99-boot.js is cached or fails to load
var isStudioDirty = false;

function docMoney(n) { return money(n, studio?.brand?.currency || 'USD'); }

function buildStudioFromTemplate(t) {
  const brand = Object.assign(
    {},
    DEFAULT_BRAND,
    { accent: t.accent || DEFAULT_BRAND.accent },
    t.defaults || {},
  );
  
  isStudioDirty = false;

  return {
    templateId: t.id,
    editTemplateId: null,
    draftId: null,
    draftName: null,
    contactId: null,
    doc:    clone(t.doc || { title: 'Untitled', subtitle: '' }),
    brand,
    meta:   clone(t.meta || []),
    sections: clone(t.sections || []),
    signature: clone(t.signature || { mode: 'none', dataUrl: null, scale: 1, slot: 'freelancer' }),
  };
}

function allTemplatesCombined() {
  const builtins = TEMPLATES.map(t => ({ ...t, isUser: false }));
  const user = typeof getCachedUserTemplates === 'function' ? getCachedUserTemplates() : [];
  return [...builtins, ...user];
}

/* ============================================================================
   6. Gallery
   ============================================================================ */
function galleryCategories() {
  const cats = [];
  TEMPLATES.forEach(t => { if (!cats.includes(t.category)) cats.push(t.category); });
  const order = ['Custom','Client Intake','Discovery','Legal','Billing','Delivery','Client Experience'];
  return order.filter(c => cats.includes(c)).concat(cats.filter(c => !order.includes(c)));
}

function renderPills() {
  const pillsEl = $('#categoryPills');
  if (!pillsEl) return;

  const cats = galleryCategories();
  const counts = { all: TEMPLATES.length };
  cats.forEach(c => counts[c] = TEMPLATES.filter(t => t.category === c).length);
  const userCount = typeof getCachedUserTemplates === 'function' ? getCachedUserTemplates().length : 0;

  const pill = (cat, label, n) =>
    `<button class="pill ${cat === studioFilter ? 'active' : ''}" data-cat="${esc(cat)}">${esc(label)}${n !== null ? `<span class="cnt">${n}</span>` : ''}</button>`;

  let html = pill('all', 'All', counts.all);
  if (userCount > 0) html += pill('mine', 'My Templates', userCount);
  cats.forEach(c => html += pill(c, c, counts[c]));
  pillsEl.innerHTML = html;
}

function renderGallery() {
  const host = $('#view-gallery');
  if (!host) return;

  const userTpls = typeof getCachedUserTemplates === 'function' ? getCachedUserTemplates() : [];

  let filtered;
  if (studioFilter === 'all') {
    filtered = [
      ...TEMPLATES.map(t => ({ ...t, isUser: false })),
      ...userTpls,
    ];
  } else if (studioFilter === 'mine') {
    filtered = userTpls.slice();
  } else {
    filtered = [
      ...TEMPLATES.filter(t => t.category === studioFilter).map(t => ({ ...t, isUser: false })),
      ...userTpls.filter(t => t.category === studioFilter),
    ];
  }

  host.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div class="titleblock">
          <h1>Create a document</h1>
          <p>Pick a template to start from. Everything autosaves as you type — you can close the tab and come back later.</p>
        </div>
        <div class="actions">
          <button class="btn" id="btnImportTemplate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Import template
          </button>
        </div>
      </div>

      <div class="gallery-filters">
        <div class="pills" id="categoryPills"></div>
      </div>

      <div class="gallery-grid" id="templateGrid">
        ${filtered.length === 0 ? `
          <div class="tool-empty" style="grid-column:1/-1">
            ${studioFilter === 'mine'
              ? 'No personal templates yet. Open any document, customize it, then click "Save as template" in the editor footer.'
              : 'No templates match this filter.'}
          </div>
        ` : filtered.map(t => {
          const isUser = t.isUser === true;
          return `
            <div class="tcard" data-template="${esc(t.id)}">
              ${isUser ? `<span class="user-badge">Yours</span>` : ''}
              ${isUser ? `
                <button class="tcard-menu-btn" data-card-menu data-template-id="${esc(t.id)}" type="button" title="More options">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="5" r="1.5"/>
                    <circle cx="12" cy="12" r="1.5"/>
                    <circle cx="12" cy="19" r="1.5"/>
                  </svg>
                </button>
              ` : ''}
              <div class="thumb" style="--a:${esc(t.accent)}">
                <div class="tpage">
                  <div class="tbar"></div>
                  <div class="tl w60"></div><div class="tl w90"></div><div class="tl w80"></div>
                  <div class="tg"></div>
                  <div class="tl w40"></div><div class="tl w75"></div><div class="tl w90"></div>
                </div>
              </div>
              <div class="tcat">${esc(t.category)}</div>
              <h3 class="tname">${esc(t.name)}</h3>
              <p class="tdesc">${esc(t.desc || '')}</p>
              <button class="btn primary" data-template="${esc(t.id)}">Use template</button>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  renderPills();

  $('#categoryPills')?.addEventListener('click', e => {
    const p = e.target.closest('.pill');
    if (!p) return;
    studioFilter = p.dataset.cat;
    renderGallery();
  });

  $('#btnImportTemplate')?.addEventListener('click', () => {
    if (typeof importUserTemplateFromFile === 'function') importUserTemplateFromFile();
  });

  $('#templateGrid')?.addEventListener('click', e => {
    const menuBtn = e.target.closest('[data-card-menu]');
    if (menuBtn) {
      e.stopPropagation();
      if (typeof openTemplateCardMenu === 'function') {
        openTemplateCardMenu(menuBtn, menuBtn.dataset.templateId);
      }
      return;
    }
    const btn = e.target.closest('[data-template]');
    if (!btn) return;
    const id = btn.dataset.template;
    const userTpl = typeof getUserTemplateById === 'function' ? getUserTemplateById(id) : null;
    if (userTpl) { openTemplate(userTpl); return; }
    const t = TEMPLATES.find(x => x.id === id);
    if (t) openTemplate(t);
  });
}

/* ============================================================================
   7. Open template → editor
   ============================================================================ */
function openTemplate(t) {
  studio = buildStudioFromTemplate(t);
  renderWorkspace();
  showView('workspace');
  requestAnimationFrame(fitPreview);
  if (typeof updateEditModeUI === 'function') updateEditModeUI();
}

function renderWorkspace() {
  const host = $('#view-workspace');
  if (!host) return;

  host.innerHTML = `
    <div class="workspace" id="workspace">
      <aside class="editor-pane" id="editorPane">
        <div class="edit-banner" id="editModeBanner" hidden>
          <span class="badge">Editing template</span>
          <span>Changes will save to <span class="edit-name">template</span></span>
        </div>
        <div class="editor-tabs" id="editorTabs">
          <button class="editor-tab active" data-tab="content">Content</button>
          <button class="editor-tab" data-tab="brand">Branding</button>
          <button class="editor-tab" data-tab="design">Design</button>
          <button class="editor-tab" data-tab="sign">Signature</button>
        </div>
        
        <div id="linkedContactBar" style="display:none; padding:8px 14px; background:var(--brand-soft); border-bottom:1px solid var(--line); font-size:12.5px; align-items:center; justify-content:space-between;">
          <span style="color:var(--ink); font-weight:600;">Linked to: <span id="linkedContactName" style="font-weight:700;"></span></span>
          <button type="button" id="unlinkContactBtn" style="background:transparent; border:none; color:var(--muted); cursor:pointer; font-size:16px; display:grid; place-items:center; width:22px; height:22px; border-radius:4px;" onmouseover="this.style.background='var(--panel)'" onmouseout="this.style.background='transparent'">&times;</button>
        </div>

        <div class="pane-scroll">
          <div class="warn" id="overflowWarn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div>
              <b>Some content is taller than a single A4 page.</b><br>
              Sections move to the next page automatically.
            </div>
          </div>

          <div class="pane" id="pane-content"></div>
          <div class="pane" id="pane-brand" hidden></div>
          <div class="pane" id="pane-design" hidden></div>
          <div class="pane" id="pane-sign" hidden></div>
        </div>

        <div class="editor-foot">
          <button class="btn ghost sm" data-action="back-to-gallery">← Back</button>
          <span class="grow"></span>
          <button class="btn sm" data-action="save-as-template" id="btnSaveAsTemplate">Save as template</button>
          <button class="btn sm" data-action="save-draft" id="btnSaveDraftInline">Save Draft</button>
          <button class="btn primary sm" data-action="export-pdf">Export PDF</button>
        </div>
      </aside>

      <div class="resizer" id="resizer"></div>

      <section class="preview-pane">
        <div class="preview-bar">
          <button class="pv-btn" id="btnZoomOut" title="Zoom out">−</button>
          <span class="zoom-label" id="zoomLabel">100%</span>
          <button class="pv-btn" id="btnZoomIn" title="Zoom in">+</button>
          <button class="pv-btn wide" id="btnFit">Fit</button>
        </div>
        <div class="doc-scroll" id="docScroll">
          <div class="doc-scaler" id="docScaler">
            <div class="doc-stack" id="docStack"></div>
          </div>
        </div>
      </section>
    </div>
  `;

  renderContentPane();
  renderBrandPanel();
  renderDesignPanel();
  renderSignaturePane();
  bindEditorEvents();
  renderPreview();
  if (typeof updateEditModeUI === 'function') updateEditModeUI();
  updateEditorFooterLabels();
  updateLinkedContactBar();
}

function updateEditorFooterLabels() {
  const saveTpl = $('#btnSaveAsTemplate');
  const saveDraft = $('#btnSaveDraftInline');
  if (!studio) return;
  if (studio.editTemplateId) {
    if (saveTpl) saveTpl.textContent = 'Update template';
    if (saveDraft) saveDraft.style.display = 'none';
  } else {
    if (saveTpl) saveTpl.textContent = 'Save as template';
    if (saveDraft) saveDraft.style.display = '';
  }
}

/* ============================================================================
   8. Branding panel
   ============================================================================ */
function renderBrandPanel() {
  const pane = $('#pane-brand');
  if (!pane) return;

  pane.innerHTML = `
    <div class="card">
      <h3 class="card-title">Business details</h3>
      <div class="frow"><label>Business name</label><input data-path="brand.businessName"></div>
      <div class="frow"><label>Email</label><input type="email" data-path="brand.email"></div>
      <div class="frow"><label>Phone</label><input type="tel" data-path="brand.phone"></div>
      <div class="frow"><label>Website</label><input data-path="brand.website"></div>
      <div class="frow"><label>Address</label><textarea data-path="brand.address" rows="2"></textarea></div>
      <div class="frow"><label>Footer</label><input data-path="brand.footer"></div>
    </div>

    <div class="card">
      <h3 class="card-title">Linked Contact</h3>
      <div class="frow">
        <label>Client</label>
        <select id="editor_contactId" data-path="contactId">
          <option value="">— None —</option>
        </select>
      </div>
      <div class="hint" style="font-size:11.5px; color:var(--muted); margin-top:6px;">Link this document to a contact in your Contacts list.</div>
    </div>

    <div class="card">
      <h3 class="card-title">Logo</h3>
      <div class="sig-drop">
        <p>PNG with a transparent background works best.</p>
        <input type="file" id="logoInput" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
        <button class="btn sm" id="btnLogoPick">Upload logo</button>
        <button class="btn ghost sm" id="btnLogoRemove">Remove</button>
      </div>
      <div class="sig-preview" id="logoPreview">
        <img id="logoPreviewImg" alt="">
        <div class="meta"><strong>Logo uploaded</strong><span>Shown in the document header</span></div>
      </div>
    </div>
  `;

  syncBrandInputs();
  pane.querySelectorAll('[data-path]').forEach(el => {
    el.addEventListener('input', onEditorInput);
    el.addEventListener('change', onEditorInput);
  });

  if (typeof loadContacts === 'function') {
    loadContacts().then(() => {
      const sel = document.getElementById('editor_contactId');
      if (!sel || !studio) return;
      const contacts = typeof getCachedContacts === 'function' ? getCachedContacts() : [];
      sel.innerHTML = '<option value="">— None —</option>' + contacts.map(c => 
        `<option value="${c.id}" ${studio.contactId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`
      ).join('');
    });
  }

  $('#btnLogoPick')?.addEventListener('click', () => $('#logoInput').click());
  $('#logoInput')?.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      studio.brand.logo = ev.target.result;
      isStudioDirty = true;
      syncBrandInputs();
      renderPreview();
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  });
  $('#btnLogoRemove')?.addEventListener('click', () => {
    studio.brand.logo = null;
    isStudioDirty = true;
    syncBrandInputs();
    renderPreview();
  });
}

function syncBrandInputs() {
  $$('#pane-brand [data-path]').forEach(el => {
    const path = el.dataset.path.split('.');
    let v = studio;
    path.forEach(k => v = v?.[k]);
    el.value = v ?? '';
  });
  const pv = $('#logoPreview');
  if (pv) {
    if (studio.brand.logo) {
      $('#logoPreviewImg').src = studio.brand.logo;
      pv.classList.add('show');
    } else {
      pv.classList.remove('show');
    }
  }
}

function updateLinkedContactBar() {
  const bar = document.getElementById('linkedContactBar');
  const nameEl = document.getElementById('linkedContactName');
  if (!bar || !nameEl || !studio) return;

  if (studio.contactId) {
    const contacts = typeof getCachedContacts === 'function' ? getCachedContacts() : [];
    const contact = contacts.find(c => c.id === studio.contactId);
    nameEl.textContent = contact ? contact.name : 'Unknown';
    bar.style.display = 'flex';
  } else {
    bar.style.display = 'none';
  }
}

/* ============================================================================
   9. Design panel
   ============================================================================ */
function renderDesignPanel() {
  const pane = $('#pane-design');
  if (!pane) return;

  pane.innerHTML = `
    <div class="card">
      <h3 class="card-title">Accent colour</h3>
      <div class="swatches" id="swatches">
        ${ACCENTS.map(c => `<button class="sw" data-accent="${c}" style="--c:${c}" title="${c}"></button>`).join('')}
      </div>
      <div class="frow"><label>Custom</label><input type="color" data-path="brand.accent"></div>
    </div>

    <div class="card">
      <h3 class="card-title">Typography & layout</h3>
      <div class="frow"><label>Font</label>
        <select data-path="brand.font">
          ${Object.entries(FONTS).map(([k,v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}
        </select>
      </div>
      <div class="frow">
        <label>Font size <span id="fsVal" style="color:var(--ink)"></span></label>
        <input type="range" min="7" max="14" step="0.5" data-path="brand.fontSize">
      </div>
      <div class="frow"><label>Heading style</label>
        <select data-path="brand.headingStyle">
          <option value="bar">Accent bar</option>
          <option value="underline">Underline</option>
          <option value="caps">Accent caps</option>
          <option value="plain">Plain</option>
        </select>
      </div>
      <div class="frow"><label>Spacing</label>
        <select data-path="brand.spacing">
          <option value="compact">Compact</option>
          <option value="normal">Normal</option>
          <option value="relaxed">Relaxed</option>
        </select>
      </div>
      <div class="frow"><label>Logo position</label>
        <select data-path="brand.logoPosition">
          <option value="left">Left of name</option>
          <option value="top">Above name</option>
          <option value="right">Right of name</option>
        </select>
      </div>
      <div class="frow"><label>Currency</label>
        <select data-path="brand.currency">
          ${DOC_CURRENCIES.map(c => `<option value="${c}">${c} ${CURRENCY_SYMBOLS[c] || ''}</option>`).join('')}
        </select>
      </div>
    </div>
  `;

  syncDesignInputs();
  pane.querySelectorAll('[data-path]').forEach(el => {
    el.addEventListener('input', onEditorInput);
    el.addEventListener('change', onEditorInput);
  });

  $('#swatches')?.addEventListener('click', e => {
    const sw = e.target.closest('.sw');
    if (!sw) return;
    studio.brand.accent = sw.dataset.accent;
    isStudioDirty = true;
    syncDesignInputs();
    renderPreview();
  });
}

function syncDesignInputs() {
  $$('#pane-design [data-path]').forEach(el => {
    const path = el.dataset.path.split('.');
    let v = studio;
    path.forEach(k => v = v?.[k]);
    if (el.type === 'color') el.value = v || '#2A2A2E';
    else el.value = v ?? '';
  });
  const fs = $('#fsVal');
  if (fs) fs.textContent = studio.brand.fontSize + 'pt';
  $$('#swatches .sw').forEach(sw =>
    sw.classList.toggle('active',
      sw.dataset.accent.toLowerCase() === String(studio.brand.accent).toLowerCase()));
}

/* ============================================================================
   10. Editor events
   ============================================================================ */
function onEditorInput(e) {
  const el = e.target.closest('[data-path]');
  if (!el) return;
  if (el.closest('#pane-content')) return;

  isStudioDirty = true;

  const path = el.dataset.path.split('.');
  const last = path.pop();
  let obj = studio;
  path.forEach(k => obj = obj[k]);

  let value = el.value;
  if (el.type === 'range' || el.type === 'number') value = parseFloat(value) || 0;
  
  if (el.dataset.path === 'contactId') {
    studio.contactId = value || null;
    updateLinkedContactBar();
  } else {
    obj[last] = value;
  }

  if (el.dataset.path === 'brand.fontSize') {
    const fs = $('#fsVal'); if (fs) fs.textContent = value + 'pt';
  }
  if (el.dataset.path === 'brand.accent') {
    $$('#swatches .sw').forEach(sw =>
      sw.classList.toggle('active',
        sw.dataset.accent.toLowerCase() === String(value).toLowerCase()));
  }
  renderPreview();
}

function bindEditorEvents() {
  $('#editorTabs')?.addEventListener('click', e => {
    const tab = e.target.closest('.editor-tab');
    if (!tab) return;
    $$('.editor-tab').forEach(t => t.classList.toggle('active', t === tab));
    const name = tab.dataset.tab;
    ['content','brand','design','sign'].forEach(k => {
      const p = $('#pane-' + k);
      if (p) p.hidden = (k !== name);
    });
    if (name === 'sign' && studio.signature.mode === 'draw' && typeof setupSigCanvas === 'function') {
      requestAnimationFrame(setupSigCanvas);
    }
  });

  document.getElementById('unlinkContactBtn')?.addEventListener('click', () => {
    studio.contactId = null;
    isStudioDirty = true;
    const sel = document.getElementById('editor_contactId');
    if (sel) sel.value = '';
    updateLinkedContactBar();
  });

  const contentPane = $('#pane-content');
  if (contentPane) {
    contentPane.addEventListener('input',  onContentInput);
    contentPane.addEventListener('change', onContentInput);
    contentPane.addEventListener('click',  onContentClick);
  }

  const sigPane = $('#pane-sign');
  if (sigPane) sigPane.addEventListener('click', onSignatureClick);

  document.querySelector('[data-action="back-to-gallery"]')?.addEventListener('click', () => {
    if (typeof safeNavigate === 'function') {
      safeNavigate('gallery');
    } else {
      showView('gallery');
    }
  });

  document.querySelector('[data-action="save-as-template"]')?.addEventListener('click', () => {
    if (typeof promptSaveAsTemplate === 'function') promptSaveAsTemplate();
  });
  document.querySelector('[data-action="save-draft"]')?.addEventListener('click', () => {
    if (typeof promptSaveDraft === 'function') promptSaveDraft();
  });
  document.querySelector('[data-action="export-pdf"]')?.addEventListener('click', () => {
    if (typeof exportPDF === 'function') exportPDF();
  });

  $('#btnZoomIn')?.addEventListener('click', () => { studioFit = false; studioZoom = Math.min(3, studioZoom + 0.15); fitPreview(); });
  $('#btnZoomOut')?.addEventListener('click', () => { studioFit = false; studioZoom = Math.max(0.3, studioZoom - 0.15); fitPreview(); });
  $('#btnFit')?.addEventListener('click', () => { studioFit = true; studioZoom = 1; fitPreview(); });

  const resizer = $('#resizer');
  const workspace = $('#workspace');
  if (resizer && workspace) {
    resizer.addEventListener('pointerdown', e => {
      e.preventDefault();
      resizer.classList.add('dragging');
      resizer.setPointerCapture(e.pointerId);
      const rect = workspace.getBoundingClientRect();
      const move = ev => {
        let pct = ((ev.clientX - rect.left) / rect.width) * 100;
        pct = Math.max(24, Math.min(76, pct));
        const editor = document.querySelector('.editor-pane');
        if (editor) editor.style.flex = `0 0 ${pct}%`;
        fitPreview();
      };
      const up = () => {
        resizer.classList.remove('dragging');
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  }
}

/* ============================================================================
   11. Preview — building blocks (used by 05c)
   ============================================================================ */
function applyDocStyleVars(el) {
  const b = studio.brand;
  el.style.setProperty('--accent', b.accent);
  el.style.setProperty('--fs-doc', b.fontSize + 'pt');
  el.style.fontFamily = (FONTS[b.font] || FONTS.sans).stack;
  el.dataset.spacing = b.spacing;
  el.dataset.heading = b.headingStyle;
}

function splitParagraphs(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return [];

  // Split by double newlines for paragraphs
  const blocks = raw.split(/\n\s*\n/);

  return blocks.map(block => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return '';

    // Check for bullet list
    const isBulletList = lines.every(l => /^[-*•]\s+/.test(l));
    if (isBulletList) {
      return `<ul>${lines.map(x => `<li>${esc(x.replace(/^[-*•]\s+/, ''))}</li>`).join('')}</ul>`;
    }

    // Check for numbered list
    const isNumberList = lines.every(l => /^\d+\.\s+/.test(l));
    if (isNumberList) {
      return `<ol>${lines.map(x => `<li>${esc(x.replace(/^\d+\.\s+/, ''))}</li>`).join('')}</ol>`;
    }

    // Otherwise, treat single newlines as <br> within a <p>
    return `<p>${lines.map(l => esc(l)).join('<br>')}</p>`;
  }).join('');
}

function textHTML(value) {
  const parts = splitParagraphs(value);
  return parts.length ? parts.join('') : '';
}

function calcTotals(s) {
  const rows = s.rows || [];
  const subtotal = rows.reduce((sum, r) => sum + (Number(r.qty) || 0) * (Number(r.rate) || 0), 0);
  const t = s.totals || {};
  const discVal = Number(t.discountValue) || 0;
  const discount = t.discountType === 'flat' ? discVal : subtotal * (discVal / 100);
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * ((Number(t.taxRate) || 0) / 100);
  return { subtotal, discount, tax, total: taxable + tax };
}

function headerHTML() {
  const b = studio.brand;
  const contacts = [b.email, b.phone, b.website].filter(Boolean).join(' &nbsp;·&nbsp; ');
  return `<header class="doc-head">
    <div class="doc-brand" data-logo="${esc(b.logoPosition)}">
      ${b.logo ? `<img class="doc-logo" src="${b.logo}" alt="">` : ''}
      <div>
        <div class="doc-biz">${esc(b.businessName)}</div>
        ${contacts ? `<div class="doc-contact">${contacts}</div>` : ''}
        ${b.address ? `<div class="doc-contact">${esc(b.address)}</div>` : ''}
      </div>
    </div>
    <div class="doc-titlebox">
      <h1 class="doc-title">${esc(studio.doc.title)}</h1>
      ${studio.doc.subtitle ? `<div class="doc-subtitle">${esc(studio.doc.subtitle)}</div>` : ''}
    </div>
  </header>`;
}

function metaHTML() {
  if (!studio.meta.length) return '';
  return `<div class="meta-strip">${studio.meta.map(m =>
    `<div class="meta-item"><span class="ml">${esc(m.label)}</span>${esc(m.value)}</div>`
  ).join('')}</div>`;
}

function footerHTML() {
  const b = studio.brand;
  if (!b.footer) return '';
  return `<div class="doc-foot">${esc(b.footer)}</div>`;
}

function fieldItemHTML(f) {
  return `<div class="fitem ${f.width === 'full' ? 'full' : ''}">
    <div class="flab">${esc(f.label)}</div>
    <div class="fval">${textHTML(f.value)}</div>
  </div>`;
}

function invoiceTableHTML(s) {
  const rows = (s.rows || []).filter(r =>
    String(r.description || '').trim() || Number(r.qty) || Number(r.rate));
  const body = rows.map(r => {
    const amount = (Number(r.qty) || 0) * (Number(r.rate) || 0);
    return `<tr>
      <td>${esc(r.description)}</td>
      <td class="num">${esc(r.qty)}</td>
      <td class="num">${docMoney(r.rate)}</td>
      <td class="num">${docMoney(amount)}</td>
    </tr>`;
  }).join('');
  const t = calcTotals(s);
  const discLabel = s.totals && s.totals.discountType === 'flat'
    ? 'Discount'
    : `Discount (${Number(s.totals?.discountValue) || 0}%)`;
  return `
    <table class="items-table">
      <thead><tr>
        <th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
    <div class="totals">
      <div class="trow"><span>Subtotal</span><span>${docMoney(t.subtotal)}</span></div>
      ${t.discount > 0 ? `<div class="trow"><span>${discLabel}</span><span>−${docMoney(t.discount)}</span></div>` : ''}
      ${t.tax > 0 ? `<div class="trow"><span>Tax (${Number(s.totals?.taxRate) || 0}%)</span><span>${docMoney(t.tax)}</span></div>` : ''}
      <div class="trow grand"><span>Total</span><span>${docMoney(t.total)}</span></div>
    </div>`;
}

function signatureHTML(s) {
  const slots = s.slots || [];
  const sg = studio.signature;
  const showImg = sg.dataUrl && sg.mode !== 'none';

  const blocks = slots.map(slot => {
    const isTarget = slot.role === sg.slot;
    return `<div class="sig-box">
      <div class="sig-image">
        ${(showImg && isTarget)
          ? `<img src="${sg.dataUrl}" style="height:${Math.round(44 * (sg.scale || 1))}px" alt="">`
          : ''}
      </div>
      <div class="sig-line"></div>
      <div class="sig-meta">
        <strong>${esc(slot.name || '')}</strong>
        <span>${esc(slot.label)}</span>
      </div>
    </div>`;
  }).join('');

  return `<section class="doc-sec">
    ${s.title ? `<h2 class="sec-title">${esc(s.title)}</h2>` : ''}
    <div class="sig-grid">${blocks}</div>
  </section>`;
}

function sectionHTML(s) {
  if (s.type === 'notice')    return `<div class="doc-notice">${esc(s.value)}</div>`;
  if (s.type === 'signature') return signatureHTML(s);

  const title = s.title ? `<h2 class="sec-title">${esc(s.title)}</h2>` : '';
  if (s.type === 'text') {
    return `<section class="doc-sec">${title}<div class="doc-text">${textHTML(s.value)}</div></section>`;
  }
  if (s.type === 'table') {
    return `<section class="doc-sec">${title}${invoiceTableHTML(s)}</section>`;
  }
  const cols = s.columns || 2;
  const items = s.fields.map(fieldItemHTML).join('');
  return `<section class="doc-sec">${title}<div class="fgrid cols-${cols}">${items}</div></section>`;
}

function renderPreview() {
  if (typeof renderPreviewPaginated === 'function') renderPreviewPaginated();
}

function fitPreview() {
  const stack = $('#docStack');
  const viewport = $('#docScroll');
  const scaler = $('#docScaler');
  if (!stack || !viewport || !scaler) return;

  const w = stack.offsetWidth || PAGE_W;
  if (!w) return;
  const h = stack.offsetHeight;

  const avail = viewport.clientWidth - 40;
  const fitScale = Math.min(1, Math.max(0.15, avail / w));
  const k = studioFit ? fitScale : fitScale * studioZoom;

  stack.style.transform = `scale(${k})`;
  scaler.style.width  = Math.round(w * k) + 'px';
  scaler.style.height = Math.round(h * k) + 'px';

  const lbl = $('#zoomLabel');
  if (lbl) lbl.textContent = Math.round(k * 100) + '%';
}

window.addEventListener('resize', () => {
  if (studio) fitPreview();
});

/* ============================================================================
   12. Public API
   ============================================================================ */
function initStudio() {
  renderGallery();
}