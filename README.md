# Spotify Extended Streaming History Analyzer + Dashboard

This project analyzes Spotify Extended Streaming History JSON exports and provides:

- CLI stats summary (`src/backend/spotistats.py`)
- Streamlit dashboard (`src/frontend/streamlit_app.py`)

## Project structure

```text
Spotify Extended Streaming History/
├── data/
│   ├── outputs/
│   │   └── spotify_stats_summary.json
│   ├── reference/
│   │   └── ReadMeFirst_ExtendedStreamingHistory.pdf
│   └── streaming_history/
│       └── Streaming_History_*.json
├── src/
│   ├── backend/
│   │   └── spotistats.py
│   └── frontend/
│       └── streamlit_app.py
├── requirements.txt
└── README.md
```

## Metrics included

- Total streams (songs played longer than 10 seconds / 10,000 ms)
- Number of minutes streamed
- Hours streamed
- Different artists
- Different albums
- Days streamed
- Top 10 artists
- Top 10 songs
- Top 10 albums
- Country ranking by counted streams
- Offline vs online stream comparison
- Day with the most counted streams
- Top 10 days with the most counted streams (with stream counts)
- Longest streak of consecutive streaming days

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run CLI summary

```bash
python src/backend/spotistats.py
```

This writes `spotify_stats_summary.json` to `data/outputs/` by default.

## Run Streamlit dashboard

```bash
streamlit run src/frontend/streamlit_app.py
```

Then open the shown localhost URL (usually `http://localhost:8501`).

## Notes

- By default, the analyzer reads files from `data/streaming_history/`.
- By default, it writes summary output to `data/outputs/spotify_stats_summary.json`.
- It targets files matching `Streaming_History*.json`.
- If none are found, it falls back to all `.json` files except `spotify_stats_summary.json`.
