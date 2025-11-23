require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const Papa = require('papaparse');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname);

app.use(express.static(PUBLIC));

// Simple in-memory cache to reduce Google fetches
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS) || 60 * 1000; // 1 minute default
let cached = { ts: 0, data: null };

function fetchText(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const getter = u.protocol === 'https:' ? https.get : http.get;
    const req = getter(u, { timeout }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // follow redirect
        resolve(fetchText(res.headers.location, timeout));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function listPublicDriveFolder(folderId) {
  // Access the public folder page and scrape file IDs and names.
  // The public folder page contains a JSON blob or data attributes — we'll use a regex fallback.
  const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
  const html = await fetchText(folderUrl);
  const results = [];

  // Try to find file IDs using a regex for "/file/d/<id>"
  const fileRegex = /\/file\/d\/([a-zA-Z0-9_-]{10,})\/[^"'<>]*/g;
  const seen = new Set();
  let m;
  while ((m = fileRegex.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    results.push({ id });
  }

  // Also look for "drive-item" entries that include name text
  const nameRegex = /\"title\":\s*\"([^\"]+)\",\s*\"id\":\s*\"([a-zA-Z0-9_-]{10,})\"/g;
  while ((m = nameRegex.exec(html)) !== null) {
    const name = m[1];
    const id = m[2];
    if (!seen.has(id)) {
      seen.add(id);
      results.push({ id, name });
    } else {
      // attach name if we already have the id
      const existing = results.find(r => r.id === id);
      if (existing && !existing.name) existing.name = name;
    }
  }

  return results;
}

async function fetchCsvExportForFileId(fileId) {
  // Try the spreadsheet CSV export URL for gid=0 first.
  // If the file is not a spreadsheet or gid=0 doesn't exist, attempt to fetch the file's "export?format=csv" as a fallback.
  const exportCsvUrl = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv&gid=0`;
  try {
    const csv = await fetchText(exportCsvUrl);
    return csv;
  } catch (err) {
    // fallback - attempt Drive file export URL pattern
    const alt = `https://drive.google.com/uc?export=download&id=${fileId}`;
    try {
      const data = await fetchText(alt);
      return data;
    } catch (e) {
      throw err;
    }
  }
}

async function buildExercisesFromDrive(folderId) {
  const entries = await listPublicDriveFolder(folderId);
  const exercises = [];
  for (const e of entries) {
    try {
      const csvText = await fetchCsvExportForFileId(e.id);
      const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
      const rows = parsed.data || [];
      let label = null, units = null;
      for (const r of rows) {
        if (r.label && r.label.trim()) label = label || r.label.trim();
        if (r.units && r.units.trim()) units = units || r.units.trim();
        if (label && units) break;
      }
      const key = e.name ? e.name.replace(/\s+/g, '_').toLowerCase() : e.id;
      exercises.push({ key, file: `${e.id}.csv`, url: `https://docs.google.com/spreadsheets/d/${e.id}/export?format=csv&gid=0`, label: label || null, units: units || null });
    } catch (err) {
      console.warn(`Skipping file ${e.id} - failed to fetch/parse:`, err.message || err);
    }
  }
  return exercises;
}

async function buildExercisesFromLocal() {
  const files = await fs.promises.readdir(PUBLIC);
  const csvFiles = files.filter(f => f.toLowerCase().endsWith('.csv'));
  const exercises = [];
  for (const file of csvFiles) {
    try {
      const key = path.basename(file, '.csv');
      const content = await fs.promises.readFile(path.join(PUBLIC, file), 'utf8');
      const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
      const rows = parsed.data || [];
      let label = null, units = null;
      for (const r of rows) {
        if (r.label && r.label.trim()) label = label || r.label.trim();
        if (r.units && r.units.trim()) units = units || r.units.trim();
        if (label && units) break;
      }
      exercises.push({ key, file, url: `/${file}`, label: label || null, units: units || null });
    } catch (err) {
      console.warn(`Skipping local file ${file}:`, err.message || err);
    }
  }
  return exercises;
}

app.get('/api/exercises', async (req, res) => {
  try {
    const now = Date.now();
    if (cached.data && (now - cached.ts) < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    const folderId = process.env.GDRIVE_FOLDER_ID;
    let exercises = [];
    if (folderId) {
      try {
        exercises = await buildExercisesFromDrive(folderId);
      } catch (err) {
        console.error('Drive folder scraping failed, falling back to local CSVs', err);
        exercises = await buildExercisesFromLocal();
      }
    } else {
      exercises = await buildExercisesFromLocal();
    }

    // update cache
    cached = { ts: now, data: exercises };
    res.json(exercises);
  } catch (err) {
    console.error('Failed to build exercises.json', err);
    res.status(500).json({ error: 'failed to list exercises' });
  }
});

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
