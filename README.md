# DocForBro

> **Need a business template? I got you, bro.**

DocForBro is a free, open-source SaaS application designed for freelancers, contractors, and independent studios. It pairs a comprehensive financial toolkit (rate calculator and margin tracker) with 19 client-ready business templates (proposals, invoices, NDAs, contracts) and a suite of productivity tools.

Built with **Vanilla JavaScript**, **HTML**, and **CSS**, compiled into a single-file architecture via a custom Node.js bundler, and powered by **Supabase**.

**Live Project:** [https://docforbro.vercel.app](https://docforbro.vercel.app)

---

## ✨ Features

### 📄 Studio & Templates
*   **19 Business Templates**: Ready-to-use proposals, invoices, NDAs, SOWs, welcome guides, and handovers.
*   **Document Editor**: Customize fonts, spacing, accents, and upload your company logo.
*   **A4 PDF Export**: Generate crisp, paginated A4 PDFs locally in the browser using `html2canvas` and `jsPDF`.
*   **Digital Signatures**: Draw or upload a signature directly into the document.
*   **Save as Template**: Turn any customized document into a reusable personal template.

### 🧮 Financial Tools
*   **Rate Calculator**: Calculate your true hourly rate, factoring in taxes, business expenses, unpaid admin time, and revision cycles.
*   **Margin Engine**: Track quoted vs. actual hours on projects. See exactly which projects are profitable after expenses and labor costs.

### 🗂️ Productivity & CRM
*   **Contacts Hub**: Manage clients and prospects. Upload avatars and link contacts to projects and documents.
*   **Notepad**: A fast, distraction-free markdown-adjacent text editor with auto-save.
*   **Pages (Block Editor)**: A Notion-style block editor for rich notes, tables, callouts, and checklists.
*   **Cross-Linking**: Link documents, notes, and projects to specific contacts. Navigate seamlessly using breadcrumbs and the Activity Hub.
*   **Global Search**: Press `⌘K` (or `Ctrl+K`) to instantly search across templates, documents, contacts, notes, and pages.

### 🛡️ Core Architecture
*   **100% Free & No Tracking**: No cookies, no Google Analytics, no hidden fees.
*   **Offline-First Data**: Working states (like the rate calculator) save to `localStorage`.
*   **Cloud Sync**: Secure authentication and database storage via Supabase.
*   **Dark Mode**: Fully responsive light/dark theme.

---

## 🛠️ Tech Stack

*   **Frontend**: Vanilla JavaScript (ES6 Modules), HTML5, CSS3 (Custom Design Tokens).
*   **Backend / Auth**: [Supabase](https://supabase.com/) (PostgreSQL, Auth, Storage).
*   **PDF Generation**: `html2canvas` and `jspdf` (loaded via CDN on demand).
*   **Build System**: Custom Node.js script (`build.js`).
*   **Hosting**: [Vercel](https://vercel.com/).

---

## 🏗️ Project Architecture

This project does **not** use React, Vue, or Webpack/Vite. It uses a custom, highly optimized build system that compiles everything into a single `index.html` file for maximum performance.

*   `build.js`: The build script. It reads all CSS and JS files from `src/`, injects them into `src/shell.html`, and outputs a final `index.html` to the root.
*   `src/shell.html`: The HTML skeleton.
*   `src/css/`: Modular CSS files (tokens, layout, components).
*   `src/js/`: Modular JavaScript files. The numeric prefixes (e.g., `01-config.js`, `99-boot.js`) dictate the load order.
*   `public/`: Static HTML files (Legal pages: Privacy, Terms, Cookies).

---

## 🚀 Getting Started (Local Development)

### Prerequisites
*   [Node.js](https://nodejs.org/) (v18 or higher)
*   A [Supabase](https://supabase.com/) account.

### 1. Clone the repository
```bash
git clone https://github.com/poomrcd/docforbro.git
cd docforbro
