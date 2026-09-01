# SobelScan 📄✨

AI-powered document summarizer, interactive flashcard generator, and practice quiz suite built with Next.js, Supabase, and Google Gemini API.

---

## 🚀 Quick Setup Instructions

Follow these steps to run SobelScan locally on your machine:

### 1. Clone the repository
```bash
git clone [https://github.com/](https://github.com/)<your-username>/sobelscan.git
cd sobelscan
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up Environment Variables
1. Copy the example file:
   ```bash
   cp .env.example .env.local
   ```
2. Open `.env.local` and add your own API credentials:
   - `GEMINI_API_KEY`: Get from [Google AI Studio](https://aistudio.google.com/)
   - `NEXT_PUBLIC_SUPABASE_URL`: Get from your Supabase Dashboard
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Get from your Supabase Project Settings

### 4. Supabase Database Setup
Run this SQL query in your **Supabase SQL Editor**:

```sql
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  summary TEXT NOT NULL,
  flashcards JSONB,
  quiz JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

### 5. Run the Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.