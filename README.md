# Spotify Privacy-First Stats Web App

This project is now a static web app designed for GitHub Pages.

Your Spotify data is processed only in the browser. No backend is required, no upload API exists, and no streaming history is sent to this repository or any server.

You can:

1. Use the hosted app from your GitHub Pages domain.
2. Clone this repo and run it locally.
3. Request your data from Spotify and drop the zip directly into the app.

Spotify privacy export link:
https://www.spotify.com/us/account/privacy/

## Main app

- Static client app: `docs/index.html`
- App logic: `docs/app.js`
- Styling: `docs/styles.css`

The app accepts a Spotify export zip, extracts JSON files in-browser, and computes analytics on the client side.

## Features

- Drag-and-drop zip upload
- File picker zip upload
- Clipboard paste support for zip files
- Fully client-side parsing of `Streaming_History*.json`
- Key metrics, top artists/tracks/albums, top days, monthly activity, and offline vs online chart
- Mobile-friendly responsive layout

## Deploy on GitHub Pages (simplest)

1. Push this repository to GitHub.
2. Open repository Settings, then Pages.
3. Under Build and deployment, set Source to Deploy from a branch.
4. Choose branch `main` and folder `/docs`.
5. Save.

GitHub will publish the app at your Pages URL (typically `https://<username>.github.io/<repo>/`).

## Run locally (no backend)

From the project root:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/docs/
```

## How users can use their own data

1. Request Spotify account data from: https://www.spotify.com/us/account/privacy/
2. Download the zip when Spotify emails it.
3. Open the web app.
4. Drag the zip onto the drop area (or click to select it).
5. View stats instantly in-browser.

## Privacy model

- Processing is done in JavaScript on the client side.
- No custom API, database, or server is used by this app.
- Input files are not persisted by the app after page refresh.

## Legacy Python tools (still included)

If someone wants local Python-based analysis, these remain available:

- CLI analyzer: `src/backend/spotistats.py`
- Streamlit dashboard: `src/frontend/streamlit_app.py`

Install dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Run CLI summary:

```bash
python src/backend/spotistats.py
```

Run Streamlit dashboard:

```bash
streamlit run src/frontend/streamlit_app.py
```
