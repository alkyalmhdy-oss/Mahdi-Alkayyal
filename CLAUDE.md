# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PMAC** (المركز الفلسطيني لإزالة الألغام — Palestinian Mine Clearance Center) is a React/Firebase web app for managing humanitarian mine-clearance field operations. It is scaffolded from a Google AI Studio template and deployed there.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Dev server on http://localhost:3000
npm run build        # Production build → dist/
npm run preview      # Preview production build
npm run lint         # TypeScript type-check only (no emit) — the only "test"
npm run clean        # Remove dist/
```

There is no test framework. `npm run lint` (`tsc --noEmit`) is the only automated correctness check.

## Environment Setup

Copy `.env.example` to `.env.local` and set:

```
GEMINI_API_KEY=your_key_here
```

Firebase credentials are committed in `firebase-applet-config.json` and loaded automatically — no additional Firebase env vars are needed.

## Architecture

### State and Navigation (`src/App.tsx`)

`App.tsx` is the root: it owns auth state (`User | null`), the full `groups` list, theme (`dark`/`light` persisted in localStorage), and which group is selected. Navigation is purely in-memory — there is no router. Switching between the `Dashboard` and `GroupView` views is done by setting `selectedGroupId`.

On login, `App.tsx` auto-creates a Firestore user profile if one doesn't exist, and **resets all of a user's groups 24 hours after account creation** (a demo-data cleanup designed for the AI Studio environment). A global `window.openCreateGroupModal` hook is exposed for external use.

### Component Responsibilities

| Component | Role |
|---|---|
| `src/components/Dashboard.tsx` | Summary view: all groups, recent incidents, alerts |
| `src/components/GroupView.tsx` | Primary workspace (~93 KB). Manages incidents, field notes, safety checklists, member invitations, Gemini AI analysis, and budget charts for a single sector |
| `src/components/CreateGroupModal.tsx` | New sector creation form |
| `src/components/ErrorBoundary.tsx` | React error boundary wrapper |

### Domain Model Mapping

The codebase reuses a generic shared-expense-tracker schema mapped onto mine-clearance concepts:

| Generic type | Mine-clearance meaning |
|---|---|
| `Group` | Operational sector |
| `Expense` | Logged incident / hazard |
| `Expense.amount` | Approximate infected area (m²) or object count |
| `Expense.paidBy` | Reporter's user ID |
| `GroupType` enum | Not semantically used; values are `personal \| household \| trip \| other` |

All incident categories are defined as Arabic strings in `src/types.ts` → `CATEGORIES`.

### Firebase (`src/firebase.ts`)

Exports `auth`, `db`, `signIn` (Google OAuth popup), and `logOut`. The Firestore instance uses a named database ID from `firebase-applet-config.json`, not the default. Firestore security rules are in `firestore.rules` and enforce role-based access (`admin` / `member`) with a default-deny policy.

**Firestore collections:**
- `/users/{uid}` — user profiles
- `/groups/{groupId}` — sectors (with `memberIds` array for query filtering)
- `/groups/{groupId}/expenses` — incidents
- `/groups/{groupId}/members` — team member subcollection

### AI Integration

Gemini API (`@google/genai`) is used inside `GroupView.tsx` for on-demand incident/situation analysis. The API key is injected at build time via `vite.config.ts` → `process.env.GEMINI_API_KEY`.

### Styling

Tailwind CSS v4 via `@tailwindcss/vite` — there is no `tailwind.config.js`. Dark mode uses the `dark` class on `<html>` (toggled by `App.tsx`). The app is bilingual (Arabic RTL + English) using the Cairo font.

### Path Alias

`@` resolves to the repository root (not `src/`). Import as `@/src/types` or `@/src/firebase`.

## Key Conventions

- All Firestore real-time listeners use `onSnapshot`; one-time reads use `getDoc`/`getDocs`.
- `GroupView.tsx` is intentionally large — all sector-level features live there rather than being split into sub-components.
- Arabic string constants (categories, UI labels) live in `src/types.ts` and component files directly — there is no i18n library.
- HMR is disabled when the `DISABLE_HMR=true` env var is set (AI Studio agent-edit mode).
