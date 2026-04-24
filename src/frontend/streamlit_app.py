#!/usr/bin/env python3
"""Streamlit dashboard for Spotify Extended Streaming History analytics."""

from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

SRC_DIR = Path(__file__).resolve().parents[1]
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from backend.spotistats import analyze, get_default_data_folder


@st.cache_data(show_spinner=False)
def load_summary(folder_str: str, top_n: int) -> dict:
    return analyze(Path(folder_str), top=max(10, top_n))


def rows_for_table(items: list[dict], value_key: str) -> list[dict]:
    return [
        {"Rank": idx + 1, "Name": row.get("name", ""), "Streams": row.get(value_key, 0)}
        for idx, row in enumerate(items)
    ]


def main() -> None:
    st.set_page_config(
        page_title="Spotify Streaming Dashboard",
        page_icon="🎧",
        layout="wide",
    )

    st.title("🎧 Spotify Streaming Dashboard")
    st.caption("Simple analytics from Spotify Extended Streaming History JSON files.")

    default_folder = str(get_default_data_folder())

    with st.sidebar:
        st.header("Settings")
        folder_input = st.text_input("Data folder", value=default_folder)
        top_n = st.slider("Top list size", min_value=10, max_value=50, value=10, step=1)
        if st.button("Refresh analytics"):
            st.cache_data.clear()

    folder = Path(folder_input).expanduser().resolve()

    if not folder.exists() or not folder.is_dir():
        st.error(f"Folder does not exist or is not a directory: {folder}")
        return

    with st.spinner("Loading and analyzing streaming history..."):
        summary = load_summary(str(folder), top_n)

    playback = summary["playback"]
    counts = summary["counts"]
    top = summary["top"]
    breakdown = summary["breakdown"]
    entries = summary["entries"]
    insights = summary["insights"]

    c1, c2, c3 = st.columns(3)
    c1.metric("Total Streams", f"{entries['qualified_song_streams']:,}")
    c2.metric("Minutes Streamed", f"{playback['total_minutes_played']:,}")
    c3.metric("Different Artists", f"{counts['unique_artists']:,}")

    c4, c5, c6 = st.columns(3)
    c4.metric("Hours Streamed", f"{playback['total_hours_played']:,}")
    c5.metric("Different Albums", f"{counts['unique_albums']:,}")
    c6.metric("Days Streamed", f"{counts['active_days_streamed']:,}")

    c7, c8 = st.columns(2)
    c7.metric(
        "Busiest Day",
        insights["busiest_day"]["date"] or "N/A",
        f"{insights['busiest_day']['streams']} streams",
    )
    streak = insights["longest_consecutive_streak"]
    c8.metric(
        "Longest Streak",
        f"{streak['length_days']} days",
        f"{streak['start_date']} to {streak['end_date']}"
        if streak["start_date"] and streak["end_date"]
        else "N/A",
    )

    t1, t2, t3 = st.columns(3)

    with t1:
        st.subheader("Top 10 Artists")
        st.table(rows_for_table(top["artists_by_streams"][:10], "count"))

    with t2:
        st.subheader("Top 10 Songs")
        st.table(rows_for_table(top["tracks_by_streams"][:10], "count"))

    with t3:
        st.subheader("Top 10 Albums")
        st.table(rows_for_table(top["albums_by_streams"][:10], "count"))

    b1, b2 = st.columns(2)

    with b1:
        st.subheader("Country Ranking (Counted Streams)")
        st.table(rows_for_table(breakdown["countries_full_ranking"], "count"))

    with b2:
        st.subheader("Offline vs Online Streams")
        offline_data = playback["offline_vs_online_streams"]
        st.table(
            [
                {
                    "Mode": "Offline",
                    "Streams": offline_data["offline_streams"],
                    "Percent": f"{offline_data['offline_percent']}%",
                },
                {
                    "Mode": "Online",
                    "Streams": offline_data["online_streams"],
                    "Percent": f"{offline_data['online_percent']}%",
                },
            ]
        )

    st.subheader("Top 10 Days by Counted Streams")
    st.table(rows_for_table(insights.get("top_days_by_streams", []), "count"))

    st.caption(
        f"Processed {summary['files']['files_processed']} file(s), "
        f"failed {summary['files']['files_failed']} file(s). "
        f"Counted songs only if played > {entries['qualified_song_threshold_ms']} ms."
    )


if __name__ == "__main__":
    main()
