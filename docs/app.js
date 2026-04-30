const MIN_SONG_MS_PLAYED = 10000;

const state = {
  zipFile: null,
  topN: 10,
  charts: {
    offline: null,
    monthly: null,
  },
};

const elements = {
  zipInput: document.getElementById("zipInput"),
  dropzone: document.getElementById("dropzone"),
  topN: document.getElementById("topN"),
  topNValue: document.getElementById("topNValue"),
  analyzeButton: document.getElementById("analyzeButton"),
  clearButton: document.getElementById("clearButton"),
  status: document.getElementById("status"),
  results: document.getElementById("results"),
  kpiGrid: document.getElementById("kpiGrid"),
  topArtistsTable: document.getElementById("topArtistsTable"),
  topTracksTable: document.getElementById("topTracksTable"),
  topAlbumsTable: document.getElementById("topAlbumsTable"),
  topDaysTable: document.getElementById("topDaysTable"),
  countriesTable: document.getElementById("countriesTable"),
  filterMode: document.getElementById("filterMode"),
  monthsSelect: document.getElementById("monthsSelect"),
  selectMonthsWrap: document.getElementById("selectMonthsWrap"),
  rangeWrap: document.getElementById("rangeWrap"),
  rangeStart: document.getElementById("rangeStart"),
  rangeEnd: document.getElementById("rangeEnd"),
  geoChart: document.getElementById("geoChart"),
};

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", Boolean(isError));
}

function formatNumber(num) {
  return new Intl.NumberFormat().format(num);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return date;
}

function asBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["true", "1", "yes"].includes(value.trim().toLowerCase());
  }
  return Boolean(value);
}

function topN(counterMap, n) {
  return [...counterMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

function increment(map, key, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + amount);
}

function longestConsecutiveStreak(dayStrings) {
  if (dayStrings.size === 0) {
    return { length_days: 0, start_date: null, end_date: null };
  }

  const days = [...dayStrings]
    .map((d) => new Date(`${d}T00:00:00`))
    .sort((a, b) => a - b);

  let bestStart = days[0];
  let bestEnd = days[0];
  let bestLen = 1;

  let currentStart = days[0];
  let currentEnd = days[0];
  let currentLen = 1;

  for (let i = 1; i < days.length; i += 1) {
    const prev = days[i - 1];
    const curr = days[i];
    const diffDays = Math.round((curr - prev) / 86400000);

    if (diffDays === 1) {
      currentEnd = curr;
      currentLen += 1;
    } else {
      if (currentLen > bestLen) {
        bestStart = currentStart;
        bestEnd = currentEnd;
        bestLen = currentLen;
      }
      currentStart = curr;
      currentEnd = curr;
      currentLen = 1;
    }
  }

  if (currentLen > bestLen) {
    bestStart = currentStart;
    bestEnd = currentEnd;
    bestLen = currentLen;
  }

  return {
    length_days: bestLen,
    start_date: bestStart.toISOString().slice(0, 10),
    end_date: bestEnd.toISOString().slice(0, 10),
  };
}

function createTable(container, columns, rows) {
  if (!rows.length) {
    container.innerHTML = '<p>No data available.</p>';
    return;
  }

  const header = columns.map((c) => `<th>${c}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell) => `<td>${escapeHtml(cell)}</td>`)
          .join("")}</tr>`
    )
    .join("");

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>${header}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function renderKpis(summary) {
  const playback = summary.playback;
  const counts = summary.counts;
  const entries = summary.entries;
  const streak = summary.insights.longest_consecutive_streak;
  const busiest = summary.insights.busiest_day;

  const kpis = [
    {
      label: "Total Streams",
      value: formatNumber(entries.qualified_song_streams),
      sub: `Threshold > ${entries.qualified_song_threshold_ms} ms`,
    },
    {
      label: "Hours Streamed",
      value: formatNumber(playback.total_hours_played),
      sub: `${formatNumber(playback.total_minutes_played)} minutes`,
    },
    {
      label: "Different Artists",
      value: formatNumber(counts.unique_artists),
      sub: `${formatNumber(counts.unique_albums)} albums`,
    },
    {
      label: "Days Streamed",
      value: formatNumber(counts.active_days_streamed),
      sub: `Busiest: ${busiest.date || "N/A"}`,
    },
    {
      label: "Offline Rate",
      value: `${playback.offline_rate_percent}%`,
      sub: `${playback.offline_vs_online_streams.offline_streams} streams`,
    },
    {
      label: "Longest Streak",
      value: `${streak.length_days} days`,
      sub: streak.start_date ? `${streak.start_date} to ${streak.end_date}` : "N/A",
    },
  ];

  elements.kpiGrid.innerHTML = kpis
    .map(
      (kpi) => `
      <article class="card kpi">
        <div class="label">${escapeHtml(kpi.label)}</div>
        <div class="value">${escapeHtml(kpi.value)}</div>
        <div class="sub">${escapeHtml(kpi.sub)}</div>
      </article>
    `
    )
    .join("");
}

function destroyCharts() {
  if (state.charts.offline) {
    state.charts.offline.destroy();
    state.charts.offline = null;
  }
  if (state.charts.monthly) {
    state.charts.monthly.destroy();
    state.charts.monthly = null;
  }
}

function renderCharts(summary) {
  destroyCharts();

  const offline = summary.playback.offline_vs_online_streams;
  const offlineCtx = document.getElementById("offlineChart").getContext("2d");
  state.charts.offline = new Chart(offlineCtx, {
    type: "doughnut",
    data: {
      labels: ["Offline", "Online"],
      datasets: [
        {
          data: [offline.offline_streams, offline.online_streams],
          backgroundColor: ["#136f63", "#78c4d4"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      plugins: {
        legend: { position: "bottom" },
      },
    },
  });

  const monthly = summary.breakdown.streams_by_month;
  const monthlyCtx = document.getElementById("monthlyChart").getContext("2d");
  state.charts.monthly = new Chart(monthlyCtx, {
    type: "bar",
    data: {
      labels: monthly.map((m) => m.name),
      datasets: [
        {
          label: "Streams",
          data: monthly.map((m) => m.count),
          backgroundColor: "#ff922b",
          borderRadius: 6,
        },
      ],
    },
    options: {
      scales: {
        y: { beginAtZero: true },
      },
      plugins: {
        legend: { display: false },
      },
    },
  });

  // render geo chart if available
  renderGeoChart(summary);
}

function renderGeoChart(summary) {
  if (!elements.geoChart) return;
  const countries = summary.breakdown.countries_full_ranking || [];

  // Ensure Google Charts loaded
  if (window.google && google.charts && google.visualization) {
    try {
      const dataArray = [["Country", "Streams"]];
      countries.forEach((r) => {
        // Prefer ISO alpha-2 codes if present, otherwise pass name
        dataArray.push([r.name, Number(r.count)]);
      });

      const dataTable = google.visualization.arrayToDataTable(dataArray);
      const options = {
        colorAxis: { colors: ["#e6f7ef", "#1db954"] },
        backgroundColor: { fill: "transparent" },
        datalessRegionColor: "#0f1720",
        defaultColor: "#0b3b2f",
      };

      const chart = new google.visualization.GeoChart(elements.geoChart);
      chart.draw(dataTable, options);
    } catch (err) {
      console.warn("GeoChart render failed:", err);
      elements.geoChart.textContent = "Map unavailable in this browser.";
    }
  } else {
    // Load Google Charts and render when ready
    if (window.google && google.charts) {
      google.charts.load("current", { packages: ["geochart"] });
      google.charts.setOnLoadCallback(() => renderGeoChart(summary));
    } else {
      elements.geoChart.textContent = "Map loader not available.";
    }
  }
}

function renderTables(summary) {
  const topArtistsRows = summary.top.artists_by_streams.map((row, idx) => [
    idx + 1,
    row.name,
    formatNumber(row.count),
  ]);
  createTable(elements.topArtistsTable, ["#", "Artist", "Streams"], topArtistsRows);

  const topTracksRows = summary.top.tracks_by_streams.map((row, idx) => [
    idx + 1,
    row.name,
    formatNumber(row.count),
  ]);
  createTable(elements.topTracksTable, ["#", "Track", "Streams"], topTracksRows);

  const topAlbumsRows = summary.top.albums_by_streams.map((row, idx) => [
    idx + 1,
    row.name,
    formatNumber(row.count),
  ]);
  createTable(elements.topAlbumsTable, ["#", "Album", "Streams"], topAlbumsRows);

  const topDaysRows = summary.insights.top_days_by_streams.map((row, idx) => [
    idx + 1,
    row.name,
    formatNumber(row.count),
  ]);
  createTable(elements.topDaysTable, ["#", "Day", "Streams"], topDaysRows);

  // Countries table
  const countriesRows = summary.breakdown.countries_full_ranking.map((row, idx) => [
    idx + 1,
    row.name,
    formatNumber(row.count),
  ]);
  createTable(elements.countriesTable, ["#", "Country", "Streams"], countriesRows);
}

function analyzeRows(rows, topCount, monthsFilter = null) {
  const files = {
    json_files_found: 0,
    files_processed: 0,
    files_failed: 0,
  };

  const entries = {
    entries_processed: 0,
    qualified_song_streams: 0,
    qualified_song_threshold_ms: MIN_SONG_MS_PLAYED,
    entries_unclassified: 0,
  };

  const counters = {
    tracks: new Map(),
    artists: new Map(),
    albums: new Map(),
    countries: new Map(),
    byMonth: new Map(),
    byDay: new Map(),
  };

  const daySet = new Set();
  const boolTallies = {
    skipped_true: 0,
    shuffle_true: 0,
    offline_true: 0,
    incognito_true: 0,
  };

  let firstTs = null;
  let lastTs = null;
  let totalMs = 0;
  let offlineStreams = 0;
  let onlineStreams = 0;

  rows.forEach((row) => {
    // If filtering by months, determine monthKey first and skip rows outside selection
    const ts = parseTimestamp(row.ts);
    const monthKey = ts ? ts.toISOString().slice(0, 7) : null;
    if (monthsFilter && monthsFilter.length) {
      if (!monthKey || !monthsFilter.includes(monthKey)) {
        return; // skip this row entirely when filtering
      }
    }

    entries.entries_processed += 1;

    const msPlayed = Number(row.ms_played || 0);
    const track = row.master_metadata_track_name;
    const artist = row.master_metadata_album_artist_name;
    const album = row.master_metadata_album_album_name;

    const isQualifiedSong = Boolean(track) && msPlayed > MIN_SONG_MS_PLAYED;
    if (!isQualifiedSong) {
      entries.entries_unclassified += 1;
      return;
    }

    entries.qualified_song_streams += 1;
    totalMs += msPlayed;

    if (ts) {
      if (!firstTs || ts < firstTs) firstTs = ts;
      if (!lastTs || ts > lastTs) lastTs = ts;

      const dayKey = ts.toISOString().slice(0, 10);
      const monthKey = ts.toISOString().slice(0, 7);
      daySet.add(dayKey);
      increment(counters.byDay, dayKey, 1);
      increment(counters.byMonth, monthKey, 1);
    }

    const country = row.conn_country;
    increment(counters.countries, country, 1);

    const offline = asBool(row.offline);
    const skipped = asBool(row.skipped);
    const shuffle = asBool(row.shuffle);
    const incognito = asBool(row.incognito_mode);

    boolTallies.skipped_true += Number(skipped);
    boolTallies.shuffle_true += Number(shuffle);
    boolTallies.offline_true += Number(offline);
    boolTallies.incognito_true += Number(incognito);

    offlineStreams += Number(offline);
    onlineStreams += Number(!offline);

    const trackKey = artist ? `${track} - ${artist}` : String(track);
    increment(counters.tracks, trackKey, 1);
    increment(counters.artists, artist, 1);
    increment(counters.albums, album, 1);
  });

  const totalEntries = entries.qualified_song_streams || 1;
  const busiest = topN(counters.byDay, 1)[0] || { name: null, count: 0 };

  return {
    files,
    entries,
    time_range: {
      first_ts_utc: firstTs ? firstTs.toISOString() : null,
      last_ts_utc: lastTs ? lastTs.toISOString() : null,
    },
    playback: {
      total_ms_played: totalMs,
      total_minutes_played: Number((totalMs / 60000).toFixed(2)),
      total_hours_played: Number((totalMs / 3600000).toFixed(2)),
      avg_ms_per_entry: Number((totalMs / totalEntries).toFixed(2)),
      skip_rate_percent: Number(((boolTallies.skipped_true * 100) / totalEntries).toFixed(2)),
      shuffle_rate_percent: Number(((boolTallies.shuffle_true * 100) / totalEntries).toFixed(2)),
      offline_rate_percent: Number(((boolTallies.offline_true * 100) / totalEntries).toFixed(2)),
      incognito_rate_percent: Number(((boolTallies.incognito_true * 100) / totalEntries).toFixed(2)),
      offline_vs_online_streams: {
        offline_streams: offlineStreams,
        online_streams: onlineStreams,
        offline_percent: Number(((offlineStreams * 100) / totalEntries).toFixed(2)),
        online_percent: Number(((onlineStreams * 100) / totalEntries).toFixed(2)),
      },
    },
    counts: {
      unique_tracks: counters.tracks.size,
      unique_artists: counters.artists.size,
      unique_albums: counters.albums.size,
      active_days_streamed: daySet.size,
    },
    top: {
      tracks_by_streams: topN(counters.tracks, topCount),
      artists_by_streams: topN(counters.artists, topCount),
      albums_by_streams: topN(counters.albums, topCount),
      countries_by_streams: topN(counters.countries, topCount),
    },
    breakdown: {
      streams_by_month: topN(counters.byMonth, counters.byMonth.size).sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
      countries_full_ranking: topN(counters.countries, counters.countries.size),
    },
    insights: {
      busiest_day: {
        date: busiest.name,
        streams: busiest.count,
      },
      top_days_by_streams: topN(counters.byDay, 10),
      longest_consecutive_streak: longestConsecutiveStreak(daySet),
    },
  };
}

async function extractRowsFromZip(zipFile) {
  const zip = await JSZip.loadAsync(zipFile);
  const allJsonEntries = [];

  const preferredFiles = [];
  const fallbackFiles = [];

  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir || !relativePath.toLowerCase().endsWith(".json")) {
      return;
    }

    const basename = relativePath.split("/").pop().toLowerCase();
    if (basename === "spotify_stats_summary.json") {
      return;
    }

    if (/streaming_history.*\.json$/i.test(basename)) {
      preferredFiles.push(zipEntry);
    } else {
      fallbackFiles.push(zipEntry);
    }
  });

  const candidateFiles = preferredFiles.length ? preferredFiles : fallbackFiles;
  if (!candidateFiles.length) {
    throw new Error("No JSON streaming history files were found in the ZIP.");
  }

  let filesProcessed = 0;
  let filesFailed = 0;

  for (const zipEntry of candidateFiles) {
    try {
      const text = await zipEntry.async("text");
      const parsed = JSON.parse(text);
      filesProcessed += 1;
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          if (item && typeof item === "object") {
            allJsonEntries.push(item);
          }
        });
      }
    } catch (error) {
      filesFailed += 1;
      // Skip malformed files and keep processing others.
      console.warn(`Skipping invalid JSON file: ${zipEntry.name}`, error);
    }
  }

  return {
    rows: allJsonEntries,
    fileCount: candidateFiles.length,
    filesProcessed,
    filesFailed,
  };
}

async function runAnalysis() {
  if (!state.zipFile) {
    setStatus("Choose a Spotify ZIP file first.", true);
    return;
  }

  try {
    setStatus("Reading ZIP and calculating stats...");
    const { rows, fileCount, filesProcessed, filesFailed } = await extractRowsFromZip(
      state.zipFile
    );

    // keep rows in state so the user can change filters without re-uploading
    state.currentRows = rows;

    // build month options
    const monthSet = new Set();
    rows.forEach((r) => {
      const ts = parseTimestamp(r.ts);
      if (ts) monthSet.add(ts.toISOString().slice(0, 7));
    });
    const months = [...monthSet].sort();
    elements.monthsSelect.innerHTML = months
      .map((m) => `<option value="${m}">${m}</option>`)
      .join("");
    // clear range inputs
    elements.rangeStart.value = "";
    elements.rangeEnd.value = "";

    if (!rows.length) {
      throw new Error("No stream entries could be read from JSON files in the ZIP.");
    }

    const summary = analyzeRows(rows, state.topN);
    summary.files.json_files_found = fileCount;
    summary.files.files_processed = filesProcessed;
    summary.files.files_failed = filesFailed;

    renderKpis(summary);
    renderTables(summary);
    renderCharts(summary);

    elements.results.classList.remove("hidden");
    setStatus(
      `Done. Processed ${formatNumber(summary.entries.entries_processed)} entries from ${filesProcessed}/${fileCount} JSON file(s).`
    );
  } catch (error) {
    setStatus(`Error: ${error.message}`, true);
  }
}

function buildMonthsBetween(start, end) {
  // start/end format: YYYY-MM
  const [sY, sM] = start.split("-").map(Number);
  const [eY, eM] = end.split("-").map(Number);
  const months = [];
  let y = sY;
  let m = sM;
  while (y < eY || (y === eY && m <= eM)) {
    months.push(`${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

function getMonthsFilterFromUI() {
  const mode = elements.filterMode ? elements.filterMode.value : "all";
  if (mode === "all") return null;
  if (mode === "select") {
    const selected = [...elements.monthsSelect.options]
      .filter((o) => o.selected)
      .map((o) => o.value);
    return selected.length ? selected : null;
  }
  if (mode === "range") {
    const start = elements.rangeStart.value;
    const end = elements.rangeEnd.value;
    if (!start || !end) return null;
    return buildMonthsBetween(start, end);
  }
  return null;
}

function performAnalysis() {
  if (!state.currentRows) return runAnalysis();
  const monthsFilter = getMonthsFilterFromUI();
  const summary = analyzeRows(state.currentRows, state.topN, monthsFilter);
  // fill files info heuristically
  summary.files.json_files_found = state.currentRows ? 1 : 0;
  summary.files.files_processed = 1;
  renderKpis(summary);
  renderTables(summary);
  renderCharts(summary);
  elements.results.classList.remove("hidden");
  setStatus(
    `Done. Processed ${formatNumber(summary.entries.entries_processed)} entries` +
      (monthsFilter ? ` (filtered ${monthsFilter.length} month(s))` : "")
  );
}

function clearResults() {
  destroyCharts();
  elements.results.classList.add("hidden");
  elements.kpiGrid.innerHTML = "";
  elements.topArtistsTable.innerHTML = "";
  elements.topTracksTable.innerHTML = "";
  elements.topAlbumsTable.innerHTML = "";
  elements.topDaysTable.innerHTML = "";
  setStatus("Results cleared.");
}

function bindEvents() {
  elements.topN.addEventListener("input", (event) => {
    state.topN = Number(event.target.value);
    elements.topNValue.textContent = String(state.topN);
  });

  elements.zipInput.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    state.zipFile = file || null;
    if (state.zipFile) {
      setStatus(`Selected: ${state.zipFile.name}`);
    }
  });

  elements.analyzeButton.addEventListener("click", () => {
    // If rows already loaded, perform analysis with current filters; otherwise run full extraction
    if (state.currentRows) performAnalysis();
    else runAnalysis();
  });
  // If rows already loaded, perform analysis with current filters
  // (analyzeButton will call runAnalysis which re-reads; to re-run quickly call performAnalysis)
  elements.clearButton.addEventListener("click", clearResults);

  ["dragenter", "dragover"].forEach((eventName) => {
    elements.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropzone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    elements.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropzone.classList.remove("drag-over");
    });
  });

  elements.dropzone.addEventListener("drop", (event) => {
    const [file] = event.dataTransfer.files || [];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setStatus("Please drop a .zip file.", true);
      return;
    }
    state.zipFile = file;
    setStatus(`Selected: ${state.zipFile.name}`);
  });

  // Filter UI handling
  elements.filterMode.addEventListener("change", (e) => {
    const mode = e.target.value;
    elements.selectMonthsWrap.classList.toggle("hidden", mode !== "select");
    elements.rangeWrap.classList.toggle("hidden", mode !== "range");
  });

  document.addEventListener("paste", (event) => {
    const files = event.clipboardData ? event.clipboardData.files : null;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.name.toLowerCase().endsWith(".zip")) return;

    state.zipFile = file;
    setStatus(`Pasted ZIP: ${state.zipFile.name}`);
  });
}

bindEvents();
setStatus("Upload your Spotify ZIP to begin.");
