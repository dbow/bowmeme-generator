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

const MAX_FRAMES = 50;
const MAX_DIMENSION = 480;

const logger = createLogger({
  format: format.combine(format.timestamp(), format.json()),
  transports: [
    new transports.File({ filename: LOG_FILE }),
    new transports.Console({ format: format.combine(format.colorize(), format.simple()) }),
  ],
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
  req.startTime = Date.now();

  if (!query) {
    req.baseImageUrl = DEFAULT_IMAGE;
    return next();
  }

  if (isValidUrl(query)) {
    logger.info(`[getBaseImageUrl] direct URL: ${query}`);
    req.baseImageUrl = query;
    return next();
  }

  logger.info(`[getBaseImageUrl] Giphy search: "${query}"`);
  const t = Date.now();

  try {
    if (!GIPHY_API_KEY) throw new Error('GIPHY_API_KEY environment variable is not set');
    const apiUrl = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=1`;
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`Giphy API error: ${response.statusText}`);
    const data = await response.json();
    req.baseImageUrl = data.data?.[0]?.images?.original?.url ?? DEFAULT_IMAGE;
    logger.info(`[getBaseImageUrl] Giphy search done in ${Date.now() - t}ms → ${req.baseImageUrl}`);
  } catch (err) {
    logger.error(`[getBaseImageUrl] Giphy search failed after ${Date.now() - t}ms: ${err.message}`);
    req.baseImageUrl = DEFAULT_IMAGE;
  }

  next();
}

async function getImage(req, res, next) {
  logger.info(`[getImage] fetching: ${req.baseImageUrl}`);
  const t = Date.now();
  try {
    const response = await fetch(req.baseImageUrl);
    if (!response.ok) throw new Error(`Image fetch failed: ${response.statusText}`);
    req.baseImageBuffer = Buffer.from(await response.arrayBuffer());
    logger.info(`[getImage] done in ${Date.now() - t}ms (${req.baseImageBuffer.length} bytes)`);
    next();
  } catch (err) {
    logger.error(`[getImage] failed after ${Date.now() - t}ms: ${err.message}`);
    res.status(500).send('Something went horribly wrong!: ' + err.message);
  }
}

async function composite(req, res, next) {
  const t = Date.now();
  try {
    // Cap frames: sharp's `pages` option limits how many frames are decoded.
    const base = sharp(req.baseImageBuffer, { pages: MAX_FRAMES });
    const { width, height, format, pages, pageHeight } = await base.metadata();

    req.format = format;
    const frameHeight = pageHeight ?? height;
    const numFrames = pages ?? 1;

    // Scale down if either dimension exceeds MAX_DIMENSION.
    const scale = Math.min(1, MAX_DIMENSION / width, MAX_DIMENSION / frameHeight);
    const scaledWidth = Math.round(width * scale);
    const scaledFrameHeight = Math.round(frameHeight * scale);

    const pipeline = scale < 1
      ? base.resize(scaledWidth, scaledFrameHeight, { fit: 'inside' })
      : base;

    // Resize overlay to fit the bottom-right quadrant of a single frame.
    const overlayBuf = await sharp(DBOW_IMAGE)
      .resize(Math.round(scaledWidth / 2), Math.round(scaledFrameHeight / 2), { fit: 'inside' })
      .toBuffer();

    const { width: oWidth, height: oHeight } = await sharp(overlayBuf).metadata();

    // Composite the overlay into the bottom-right corner of every frame.
    // Each frame is offset by (i * scaledFrameHeight) in the stacked canvas.
    const compositeInputs = Array.from({ length: numFrames }, (_, i) => ({
      input: overlayBuf,
      left: scaledWidth - oWidth,
      top: i * scaledFrameHeight + (scaledFrameHeight - oHeight),
      blend: 'over',
    }));

    req.composite = await pipeline
      .composite(compositeInputs)
      .toBuffer();

    logger.info(`[composite] done in ${Date.now() - t}ms (${numFrames} frame(s), ${scaledWidth}x${scaledFrameHeight}px, format: ${format})`);
    next();
  } catch (err) {
    logger.error(`[composite] failed after ${Date.now() - t}ms: ${err.message}`);
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
  logger.info(`[request] total time: ${Date.now() - req.startTime}ms`);
  res.setHeader('content-type', `image/${(req.format || 'png').toLowerCase()}`);
  res.end(req.composite);
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  const { address, port } = server.address();
  console.log(`Bowmeme generator listening at http://${address}:${port}`);
});
