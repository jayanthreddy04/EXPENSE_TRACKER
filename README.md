# Expense Tracker

Full-stack expense tracker with email/password auth, manual expenses, receipt image upload, and OCR total extraction.

## Tech Stack

- React + Vite frontend
- Express API
- MongoDB + Mongoose
- Vercel serverless deployment
- Groq vision model for receipt OCR, with optional Gemini fallback

## Local Setup

1. Install dependencies:

   ```bash
   npm install --prefix client
   npm install --prefix server
   ```

2. Create local environment variables:

   ```bash
   cp server/.env.example server/.env
   ```

3. Fill `server/.env`:

   - `MONGODB_URI`
   - `JWT_SECRET`
   - `GROQ_API_KEY`
   - optional `GOOGLE_API_KEY`

4. Run the app locally in two terminals:

   ```bash
   npm run dev:server
   npm run dev:client
   ```

5. Open the Vite URL shown in the client terminal.

## Verify Before Push

```bash
npm run verify
git status --short
```

`server/.env`, `node_modules`, uploads, and `client/dist` are intentionally ignored.

## Vercel Deployment

Use these project settings:

- Install Command: `npm install --prefix client && npm install --prefix server`
- Build Command: `npm run build --prefix client`
- Output Directory: `client/dist`

Add these environment variables in Vercel for Production, Preview, and Development as needed:

- `MONGODB_URI`
- `JWT_SECRET`
- `GROQ_API_KEY`
- optional `GROQ_MODEL`
- optional `GOOGLE_API_KEY`
- optional `GEMINI_MODEL`

After changing environment variables, redeploy the latest commit.

## Notes

- Receipt OCR uses `GROQ_API_KEY` first.
- If Groq is not configured, the server tries `GOOGLE_API_KEY`.
- On Vercel, OCR returns a configuration error if neither OCR key is present.
