# WorkflowAI - AI Debugger & Optimizer

## Product Overview
A modern, premium SaaS-style web app that analyzes workflow descriptions using AI and returns structured insights across 6 categories. Features multi-model AI support, workflow history, PDF export, email reports, and shareable analysis links.

## Core Requirements
- Premium dark mode UI (#0F172A background, #1E293B cards)
- Swiss & High-Contrast design archetype (Outfit/IBM Plex Sans typography)
- JWT-based authentication (register, login, forgot/reset password)
- Multi-line workflow description input
- AI analysis using 3 models: Claude Sonnet 4.5, GPT-5.2, Gemini 3 Flash
- 6 output sections with color-coded accents
- Workflow history with share/delete/public-toggle
- PDF export via html2pdf.js
- Email reports via Resend API
- Public shareable analysis links

## Tech Stack
- Frontend: React 19, Tailwind CSS, Lucide React, react-router-dom v7, html2pdf.js
- Backend: FastAPI, Python, bcrypt, PyJWT, resend
- Database: MongoDB (Motor async)
- AI: emergentintegrations (Claude, GPT-5.2, Gemini 3 Flash)

## Architecture
```
/app/backend/server.py - All backend routes (auth, analysis, history, sharing, email)
/app/frontend/src/
  App.js - Router with protected/public routes
  contexts/AuthContext.js - Auth state management
  pages/LoginPage.js - Split-screen login
  pages/RegisterPage.js - Split-screen register
  pages/ForgotPasswordPage.js - Forgot password
  pages/ResetPasswordPage.js - Reset password
  pages/DashboardPage.js - Main dashboard (analysis, history, PDF, email)
  pages/SharedPage.js - Public shared analysis view
```

## API Endpoints
- POST /api/auth/register, /login, /logout, /refresh, /forgot-password, /reset-password
- GET /api/auth/me
- GET /api/models - Available AI models
- POST /api/analyze-workflow - AI analysis (requires auth)
- GET /api/workflow-history - User's analysis history
- GET /api/workflow-history/{id} - Single analysis
- POST /api/workflow-history/{id}/toggle-public - Toggle sharing
- DELETE /api/workflow-history/{id} - Delete analysis
- GET /api/shared/{token} - Public shared analysis
- POST /api/send-report - Email report (requires Resend API key)

## What's Implemented (March 31, 2026)
- [x] Phase 1: JWT Authentication + Workflow History
- [x] Phase 2: UI/UX Redesign (Swiss high-contrast dark theme)
- [x] Phase 3: PDF Export + Shareable Links
- [x] Phase 4: Multi-AI Model Support (Claude, GPT-5.2, Gemini)
- [x] Phase 5: Email Reports endpoint (requires Resend API key)
- [x] Phase 6: Deployment health check passed 100%
- [x] Compare Models: Side-by-side comparison of all 3 AI models on same workflow

## Requires User Configuration
- **Resend API key** (RESEND_API_KEY in backend/.env) for email reports
  - Sign up at https://resend.com
  - Create API key from Dashboard > API Keys
  - Add to .env: RESEND_API_KEY=re_your_key

## Deployment
- Free tier deployment ready
- All health checks passed
- CORS configured for production
