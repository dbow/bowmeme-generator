'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const express = require('express');
const sharp = require('sharp');
const { createLogger, format, transports } = require('winston');

const DBOW_IMAGE = path.join(__dirname, 'dbow.png');
const LOG_FILE = path.join(__dirname, 'bowmeme.log');
const DEFAULT_IMAGE = 'https://upload.wikimedia.org/wikipedia/commons/3/3b/Windows_9X_BSOD.png';
const GIPHY_API_KEY = process.env.GIPHY_API_KEY;

const logger = createLogger({
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.File({ filename: LOG_FILE })],
});

const app = express();

function isValidUrl(str) {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

async function getBaseImageUrl(req, res, next) {
  const query = req.query.u;

  if (!query) {
    req.baseImageUrl = DEFAULT_IMAGE;
    return next();
  }

  if (isValidUrl(query)) {
    logger.info(query, { type: 'url' });
    req.baseImageUrl = query;
    return next();
  }

  logger.info(query, { type: 'query' });

  try {
    if (!GIPHY_API_KEY) throw new Error('GIPHY_API_KEY environment variable is not set');
    const apiUrl = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=1`;
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`Giphy API error: ${response.statusText}`);
    const data = await response.json();
    req.baseImageUrl = data.data?.[0]?.images?.original?.url ?? DEFAULT_IMAGE;
  } catch (err) {
    logger.error(err.message);
    req.baseImageUrl = DEFAULT_IMAGE;
  }

  next();
}

async function getImage(req, res, next) {
  try {
    const response = await fetch(req.baseImageUrl);
    if (!response.ok) throw new Error(`Image fetch failed: ${response.statusText}`);
    req.baseImageBuffer = Buffer.from(await response.arrayBuffer());
    next();
  } catch (err) {
    logger.error(err.message);
    res.status(500).send('Something went horribly wrong!: ' + err.message);
  }
}

async function composite(req, res, next) {
  try {
    const base = sharp(req.baseImageBuffer, { animated: true });
    const { width, format, pages, pageHeight } = await base.metadata();

    req.format = format;

    // pageHeight is the per-frame height for animated images; for static images
    // it's undefined so we fall back to the full image height.
    const frameHeight = pageHeight ?? (await base.metadata()).height;
    const numFrames = pages ?? 1;

    // Resize bowmeme to fit the bottom-right quadrant of a single frame.
    const overlayBuf = await sharp(DBOW_IMAGE)
      .resize(Math.round(width / 2), Math.round(frameHeight / 2), { fit: 'inside' })
      .toBuffer();

    const { width: oWidth, height: oHeight } = await sharp(overlayBuf).metadata();

    // Composite the overlay into the bottom-right corner of every frame.
    // Each frame is offset by (i * frameHeight) in the stacked canvas.
    const compositeInputs = Array.from({ length: numFrames }, (_, i) => ({
      input: overlayBuf,
      left: width - oWidth,
      top: i * frameHeight + (frameHeight - oHeight),
      blend: 'over',
    }));

    req.composite = await base
      .composite(compositeInputs)
      .toBuffer();

    next();
  } catch (err) {
    logger.error(err.message);
    res.status(500).send('Something went horribly wrong!: ' + err.message);
  }
}

app.get('/health', (req, res) => res.sendStatus(200));

app.get('/logs', async (req, res) => {
  try {
    const content = await fs.promises.readFile(LOG_FILE, 'utf8');
    const start = parseInt(req.query.start) || 0;
    const limit = parseInt(req.query.limit) || 50;
    const lines = content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    res.json(lines.reverse().slice(start, start + limit));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/', getBaseImageUrl, getImage, composite, (req, res) => {
  res.setHeader('content-type', `image/${(req.format || 'png').toLowerCase()}`);
  res.end(req.composite);
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  const { address, port } = server.address();
  console.log(`Bowmeme generator listening at http://${address}:${port}`);
});
