# bowmeme-generator

Composites a bowmeme overlay onto any image. Pass a direct image URL or a search term (via Giphy) and get back a bowmeme'd version.

## Usage

```
GET /?u=<image-url-or-search-term>
```

Examples:
- `/?u=https://example.com/image.png` — composite onto a direct image URL
- `/?u=cats` — search Giphy and composite onto the top result

Supports static images (PNG, JPEG, etc.) and animated GIFs.

## Setup

### Dependencies

```
npm install
```

### Environment variables

| Variable | Description |
|---|---|
| `GIPHY_API_KEY` | Required for Giphy search. Get a free key at [developers.giphy.com](https://developers.giphy.com). |
| `PORT` | Port to listen on. Defaults to `3001`. |

Copy `.env.example` to `.env` and fill in your key for local development:

```
cp .env.example .env
```

### Run

```
npm start
```

## Endpoints

| Endpoint | Description |
|---|---|
| `GET /` | Returns the composited image |
| `GET /logs` | Returns recent log entries as JSON. Supports `?start=0&limit=50`. |

## Deployment

Configured for [Render](https://render.com) via `render.yaml`. Set the `GIPHY_API_KEY` environment variable in the Render dashboard before deploying.

## Requirements

- Node.js >= 18
