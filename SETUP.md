# JVPLANNER v2 — Setup Guide
Estimated time: ~30 minutes.

---

## STEP 1 — Supabase (database + Google login)

1. Go to https://supabase.com → **Start for Free** → sign up with Google
2. **New Project** → name it `jvplanner` → pick a DB password → US region → Create
3. Wait ~2 min for it to provision

### Run the schema
4. Supabase sidebar → **SQL Editor** → **New Query**
5. Paste the entire contents of `supabase-schema.sql` → **Run**

### Enable Google OAuth
6. Supabase sidebar → **Authentication** → **Providers** → **Google** → toggle ON
7. Go to https://console.cloud.google.com → create a new project called `jvplanner`
8. **APIs & Services** → **OAuth consent screen** → External → fill in app name + your email → Save
9. **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID** → Web application
10. Under **Authorized redirect URIs** add:
    `https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback`
    (find your project ID in Supabase → Settings → General)
11. Copy the **Client ID** and **Client Secret** → paste into Supabase Google provider → Save

### Get your API keys
12. Supabase → **Settings** → **API**
13. Copy **Project URL** and **anon public** key — you'll need these next

---

## STEP 2 — Local setup

1. Install Node.js from https://nodejs.org (LTS version)
   - Check: open Terminal → `node --version` (should show v18+)

2. Open Terminal, navigate to this folder:
   ```bash
   cd path/to/jvplanner
   ```

3. Copy env file and fill in your Supabase values:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and set:
   ```
   VITE_SUPABASE_URL=https://yourproject.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

4. Install and run:
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:5173 — you should see the login screen.

---

## STEP 3 — Deploy to GitHub

1. Create a **private** repo at https://github.com/new named `jvplanner`
   (don't initialize with README)

2. Push the code:
   ```bash
   git init
   git add .
   git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/jvplanner.git
   git push -u origin main
   ```

3. Add secrets to GitHub:
   Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
   - `VITE_SUPABASE_URL` → your URL
   - `VITE_SUPABASE_ANON_KEY` → your key

4. Repo → **Settings** → **Pages** → Source: **gh-pages** branch → Save

5. Wait ~2 min → visit `https://YOUR_USERNAME.github.io/jvplanner`

### Add your site to Supabase redirect list
Supabase → **Authentication** → **URL Configuration**
- **Site URL**: `https://YOUR_USERNAME.github.io/jvplanner`
- **Redirect URLs**: add the same URL

---

## STEP 4 — Install on phone

**iPhone:** Safari → visit your URL → Share button → Add to Home Screen
**Android:** Chrome → 3-dot menu → Add to Home Screen

---

## STEP 5 — Canvas sync

1. In Canvas (browser) → **Calendar** → **Calendar Feed** (bottom right) → copy the URL
2. In JVPlanner → **School** tab → **Canvas Import** button → paste → Import
3. All assignments appear in the School calendar + show in Everything tab

---

## Making changes later

Each feature is its own file — just replace that file and push:
- Change home page → edit `src/pages/Home.jsx`
- Change calendar behavior → edit `src/pages/CalendarTab.jsx`
- Change colors/design → edit `src/index.css`
- Add college milestone data → edit the SEED array in `src/lib/db.js`
