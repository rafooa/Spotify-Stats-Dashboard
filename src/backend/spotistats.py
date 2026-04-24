#!/usr/bin/env python3
"""Aggregate Spotify Extended Streaming History JSON files.

Usage:
	python src/backend/spotistats.py
	python src/backend/spotistats.py --folder "./data/streaming_history" --top 15
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


MIN_SONG_MS_PLAYED = 10_000


def get_project_root() -> Path:
	return Path(__file__).resolve().parents[2]


def get_default_data_folder() -> Path:
	return get_project_root() / "data" / "streaming_history"


def get_default_output_path() -> Path:
	return get_project_root() / "data" / "outputs" / "spotify_stats_summary.json"


@dataclass
class AggregateState:
	files_processed: int = 0
	files_failed: int = 0
	entries_processed: int = 0
	entries_ignored: int = 0
	total_ms_played: int = 0
	first_timestamp: datetime | None = None
	last_timestamp: datetime | None = None


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(
		description="Analyze Spotify Extended Streaming History JSON files in a folder."
	)
	parser.add_argument(
		"--folder",
		type=Path,
		default=get_default_data_folder(),
		help="Folder containing Spotify JSON files (default: ./data/streaming_history).",
	)
	parser.add_argument(
		"--output",
		type=Path,
		default=None,
		help="Output JSON summary path (default: ./data/outputs/spotify_stats_summary.json).",
	)
	parser.add_argument(
		"--top",
		type=int,
		default=10,
		help="How many top items to include for tracks/artists/albums (default: 10).",
	)
	return parser.parse_args()


def parse_timestamp(value: str | None) -> datetime | None:
	if not value:
		return None
	try:
		return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
	except (ValueError, TypeError):
		return None


def as_bool(value: Any) -> bool:
	# Handles bool values and string variants just in case some files differ.
	if isinstance(value, bool):
		return value
	if isinstance(value, str):
		return value.strip().lower() in {"true", "1", "yes"}
	return bool(value)


def top_n(counter: Counter, n: int) -> list[dict[str, Any]]:
	return [{"name": name, "count": count} for name, count in counter.most_common(n)]


def top_n_ms(counter: Counter, n: int) -> list[dict[str, Any]]:
	ranked = sorted(counter.items(), key=lambda item: item[1], reverse=True)[:n]
	return [
		{
			"name": name,
			"ms_played": ms,
			"hours_played": round(ms / 3_600_000, 2),
		}
		for name, ms in ranked
	]


def safe_read_json(file_path: Path) -> list[dict[str, Any]]:
	with file_path.open("r", encoding="utf-8") as handle:
		payload = json.load(handle)
	if isinstance(payload, list):
		return [row for row in payload if isinstance(row, dict)]
	return []


def find_history_json_files(folder: Path) -> list[Path]:
	# Prefer Spotify export files and avoid reading generated summary files.
	history_files = sorted(folder.glob("Streaming_History*.json"))
	if history_files:
		return history_files

	return sorted(
		path
		for path in folder.glob("*.json")
		if path.name.lower() != "spotify_stats_summary.json"
	)


def longest_consecutive_streak(day_strings: set[str]) -> dict[str, Any]:
	if not day_strings:
		return {
			"length_days": 0,
			"start_date": None,
			"end_date": None,
		}

	days = sorted(datetime.strptime(day, "%Y-%m-%d").date() for day in day_strings)

	best_start = days[0]
	best_end = days[0]
	best_len = 1

	current_start = days[0]
	current_end = days[0]
	current_len = 1

	for idx in range(1, len(days)):
		if (days[idx] - days[idx - 1]).days == 1:
			current_end = days[idx]
			current_len += 1
		else:
			if current_len > best_len:
				best_start = current_start
				best_end = current_end
				best_len = current_len
			current_start = days[idx]
			current_end = days[idx]
			current_len = 1

	if current_len > best_len:
		best_start = current_start
		best_end = current_end
		best_len = current_len

	return {
		"length_days": best_len,
		"start_date": best_start.isoformat(),
		"end_date": best_end.isoformat(),
	}


def analyze(folder: Path, top: int, min_song_ms_played: int = MIN_SONG_MS_PLAYED) -> dict[str, Any]:
	files = find_history_json_files(folder)

	state = AggregateState()
	platforms = Counter()
	countries = Counter()
	reason_start = Counter()
	reason_end = Counter()
	by_year = Counter()
	by_month = Counter()
	by_day = Counter()

	track_streams = Counter()
	artist_streams = Counter()
	album_streams = Counter()
	episode_streams = Counter()
	audiobook_streams = Counter()

	track_ms = Counter()
	artist_ms = Counter()
	album_ms = Counter()
	episode_ms = Counter()
	audiobook_ms = Counter()

	bool_tallies = defaultdict(int)
	active_days = set()
	qualified_song_streams = 0
	qualified_song_ms = 0
	offline_song_streams = 0
	online_song_streams = 0

	for file_path in files:
		try:
			rows = safe_read_json(file_path)
		except (json.JSONDecodeError, OSError):
			state.files_failed += 1
			continue

		state.files_processed += 1

		for row in rows:
			state.entries_processed += 1

			ms_played = int(row.get("ms_played") or 0)
			state.total_ms_played += ms_played

			track = row.get("master_metadata_track_name")
			artist = row.get("master_metadata_album_artist_name")
			album = row.get("master_metadata_album_album_name")
			episode_name = row.get("episode_name")
			audiobook_title = row.get("audiobook_title")

			is_qualified_song = bool(track) and ms_played > min_song_ms_played

			ts = parse_timestamp(row.get("ts"))
			if ts:
				if state.first_timestamp is None or ts < state.first_timestamp:
					state.first_timestamp = ts
				if state.last_timestamp is None or ts > state.last_timestamp:
					state.last_timestamp = ts
				if is_qualified_song:
					by_year[str(ts.year)] += 1
					by_month[ts.strftime("%Y-%m")] += 1
					day_key = ts.strftime("%Y-%m-%d")
					active_days.add(day_key)
					by_day[day_key] += 1

			country = row.get("conn_country")

			if is_qualified_song:
				platform = row.get("platform")
				if platform:
					platforms[str(platform)] += 1
				if country:
					countries[str(country)] += 1

			start_reason = row.get("reason_start")
			end_reason = row.get("reason_end")
			if is_qualified_song:
				if start_reason:
					reason_start[str(start_reason)] += 1
				if end_reason:
					reason_end[str(end_reason)] += 1

			shuffle = as_bool(row.get("shuffle"))
			skipped = as_bool(row.get("skipped"))
			offline = as_bool(row.get("offline"))
			incognito = as_bool(row.get("incognito_mode"))

			if is_qualified_song:
				qualified_song_streams += 1
				qualified_song_ms += ms_played
				bool_tallies["shuffle_true"] += int(shuffle)
				bool_tallies["shuffle_false"] += int(not shuffle)
				bool_tallies["skipped_true"] += int(skipped)
				bool_tallies["skipped_false"] += int(not skipped)
				bool_tallies["offline_true"] += int(offline)
				bool_tallies["offline_false"] += int(not offline)
				bool_tallies["incognito_true"] += int(incognito)
				bool_tallies["incognito_false"] += int(not incognito)
				offline_song_streams += int(offline)
				online_song_streams += int(not offline)

				key = f"{track} — {artist}" if artist else str(track)
				track_streams[key] += 1
				track_ms[key] += ms_played
				if artist:
					artist_streams[str(artist)] += 1
					artist_ms[str(artist)] += ms_played
				if album:
					album_streams[str(album)] += 1
					album_ms[str(album)] += ms_played
			elif episode_name:
				episode_streams[str(episode_name)] += 1
				episode_ms[str(episode_name)] += ms_played
			elif audiobook_title:
				audiobook_streams[str(audiobook_title)] += 1
				audiobook_ms[str(audiobook_title)] += ms_played
			else:
				state.entries_ignored += 1

	total_entries = qualified_song_streams or 1
	busiest_day = by_day.most_common(1)
	streak = longest_consecutive_streak(active_days)
	top_days_by_streams = top_n(by_day, 10)

	summary: dict[str, Any] = {
		"files": {
			"json_files_found": len(files),
			"files_processed": state.files_processed,
			"files_failed": state.files_failed,
		},
		"entries": {
			"entries_processed": state.entries_processed,
			"qualified_song_streams": qualified_song_streams,
			"qualified_song_threshold_ms": min_song_ms_played,
			"entries_unclassified": state.entries_ignored,
		},
		"time_range": {
			"first_ts_utc": state.first_timestamp.strftime("%Y-%m-%dT%H:%M:%SZ")
			if state.first_timestamp
			else None,
			"last_ts_utc": state.last_timestamp.strftime("%Y-%m-%dT%H:%M:%SZ")
			if state.last_timestamp
			else None,
		},
		"playback": {
			"total_ms_played": qualified_song_ms,
			"total_minutes_played": round(qualified_song_ms / 60_000, 2),
			"total_hours_played": round(qualified_song_ms / 3_600_000, 2),
			"avg_ms_per_entry": round(qualified_song_ms / total_entries, 2),
			"skip_rate_percent": round(
				bool_tallies["skipped_true"] * 100 / total_entries, 2
			),
			"shuffle_rate_percent": round(
				bool_tallies["shuffle_true"] * 100 / total_entries, 2
			),
			"offline_rate_percent": round(
				bool_tallies["offline_true"] * 100 / total_entries, 2
			),
			"incognito_rate_percent": round(
				bool_tallies["incognito_true"] * 100 / total_entries, 2
			),
			"offline_vs_online_streams": {
				"offline_streams": offline_song_streams,
				"online_streams": online_song_streams,
				"offline_percent": round(offline_song_streams * 100 / total_entries, 2),
				"online_percent": round(online_song_streams * 100 / total_entries, 2),
			},
		},
		"counts": {
			"unique_tracks": len(track_streams),
			"unique_artists": len(artist_streams),
			"unique_albums": len(album_streams),
			"active_days_streamed": len(active_days),
			"unique_episodes": len(episode_streams),
			"unique_audiobooks": len(audiobook_streams),
		},
		"top": {
			"tracks_by_streams": top_n(track_streams, top),
			"tracks_by_listen_time": top_n_ms(track_ms, top),
			"artists_by_streams": top_n(artist_streams, top),
			"artists_by_listen_time": top_n_ms(artist_ms, top),
			"albums_by_streams": top_n(album_streams, top),
			"albums_by_listen_time": top_n_ms(album_ms, top),
			"episodes_by_streams": top_n(episode_streams, top),
			"episodes_by_listen_time": top_n_ms(episode_ms, top),
			"audiobooks_by_streams": top_n(audiobook_streams, top),
			"audiobooks_by_listen_time": top_n_ms(audiobook_ms, top),
		},
		"breakdown": {
			"platforms": top_n(platforms, top),
			"countries": top_n(countries, top),
			"countries_full_ranking": top_n(countries, len(countries)),
			"reason_start": top_n(reason_start, top),
			"reason_end": top_n(reason_end, top),
			"streams_by_year": top_n(by_year, 100),
			"streams_by_month": top_n(by_month, 1000),
		},
		"insights": {
			"busiest_day": {
				"date": busiest_day[0][0] if busiest_day else None,
				"streams": busiest_day[0][1] if busiest_day else 0,
			},
			"top_days_by_streams": top_days_by_streams,
			"longest_consecutive_streak": streak,
		},
	}

	return summary


def print_human_summary(summary: dict[str, Any]) -> None:
	print("=" * 72)
	print("Spotify Streaming History Summary")
	print("=" * 72)
	files = summary["files"]
	entries = summary["entries"]
	playback = summary["playback"]
	time_range = summary["time_range"]
	insights = summary["insights"]

	print(f"JSON files found      : {files['json_files_found']}")
	print(f"Files processed       : {files['files_processed']}")
	print(f"Files failed          : {files['files_failed']}")
	print(f"Entries processed     : {entries['entries_processed']} (all entries)")
	print(
		f"Streams counted       : {entries['qualified_song_streams']} "
		f"(songs > {entries['qualified_song_threshold_ms']} ms)"
	)
	print(f"Entries unclassified  : {entries['entries_unclassified']}")
	print(f"Days streamed         : {summary['counts']['active_days_streamed']}")
	print(f"Total play time (min) : {playback['total_minutes_played']}")
	print(f"Total play time (hrs) : {playback['total_hours_played']}")
	print(f"Average ms / entry    : {playback['avg_ms_per_entry']}")
	print(f"Skip rate             : {playback['skip_rate_percent']}%")
	print(f"Shuffle rate          : {playback['shuffle_rate_percent']}%")
	print(f"Offline rate          : {playback['offline_rate_percent']}%")
	print(f"Incognito rate        : {playback['incognito_rate_percent']}%")
	print(
		f"Busiest day           : {insights['busiest_day']['date']} "
		f"({insights['busiest_day']['streams']} streams)"
	)
	print(
		"Longest streak        : "
		f"{insights['longest_consecutive_streak']['length_days']} days "
		f"({insights['longest_consecutive_streak']['start_date']} to "
		f"{insights['longest_consecutive_streak']['end_date']})"
	)
	print(f"First timestamp (UTC) : {time_range['first_ts_utc']}")
	print(f"Last timestamp  (UTC) : {time_range['last_ts_utc']}")
	print(
		"Offline vs Online     : "
		f"{playback['offline_vs_online_streams']['offline_streams']} offline "
		f"({playback['offline_vs_online_streams']['offline_percent']}%) vs "
		f"{playback['offline_vs_online_streams']['online_streams']} online "
		f"({playback['offline_vs_online_streams']['online_percent']}%)"
	)

	top_tracks = summary["top"]["tracks_by_streams"]
	top_artists = summary["top"]["artists_by_streams"]

	if top_tracks:
		print("\nTop tracks by streams:")
		for idx, row in enumerate(top_tracks[:10], start=1):
			print(f"  {idx:2d}. {row['name']} ({row['count']})")

	if top_artists:
		print("\nTop artists by streams:")
		for idx, row in enumerate(top_artists[:10], start=1):
			print(f"  {idx:2d}. {row['name']} ({row['count']})")

	top_countries = summary["breakdown"]["countries"]
	if top_countries:
		print("\nTop countries by counted streams:")
		for idx, row in enumerate(top_countries[:10], start=1):
			print(f"  {idx:2d}. {row['name']} ({row['count']})")

	top_days = summary["insights"].get("top_days_by_streams", [])
	if top_days:
		print("\nTop 10 days by counted streams:")
		for idx, row in enumerate(top_days, start=1):
			print(f"  {idx:2d}. {row['name']} ({row['count']})")


def main() -> None:
	args = parse_args()
	folder = args.folder.resolve()

	if not folder.exists() or not folder.is_dir():
		raise SystemExit(f"Folder does not exist or is not a directory: {folder}")

	output_path = (
		args.output.resolve()
		if args.output is not None
		else get_default_output_path()
	)
	output_path.parent.mkdir(parents=True, exist_ok=True)

	summary = analyze(folder=folder, top=max(1, args.top))

	with output_path.open("w", encoding="utf-8") as handle:
		json.dump(summary, handle, indent=2, ensure_ascii=False)

	print_human_summary(summary)
	print(f"\nSaved summary JSON to: {output_path}")


if __name__ == "__main__":
	main()
