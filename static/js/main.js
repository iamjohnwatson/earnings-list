(function () {
  const weekSelect = document.getElementById('week-select');
  const sectorSelect = document.getElementById('sector-select');
  const previewBtn = document.getElementById('preview-btn');
  const downloadBtn = document.getElementById('download-btn');
  const statusEl = document.getElementById('status');
  const previewSection = document.getElementById('preview');
  const missingSection = document.getElementById('missing');
  const tableBody = document.querySelector('#preview-table tbody');
  const matchCount = document.getElementById('match-count');
  const timelineContainer = document.getElementById('day-timeline');
  const timelineList = document.getElementById('timeline-list');
  const previewSector = document.getElementById('preview-sector');
  const previewWeek = document.getElementById('preview-week');
  const previewUpdated = document.getElementById('preview-updated');
  const previewMissing = document.getElementById('preview-missing');
  const sectorHeader = document.getElementById('sector-column');
  const sourceSummary = document.getElementById('source-summary');
  const irSourceList = document.getElementById('ir-source-list');
  const fallbackSourceList = document.getElementById('fallback-source-list');
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  const searchClearBtn = document.getElementById('search-clear-btn');
  const searchStatus = document.getElementById('search-status');
  const searchResults = document.getElementById('search-results');
  const searchResultsList = document.getElementById('search-results-list');
  const searchResultsCount = document.getElementById('search-results-count');

  let lastPayload = null;
  let lastPreview = null;
  let searchIndexPromise = null;
  let searchIndex = null;

  function setStatus(message, variant = "info") {
    statusEl.textContent = message || "";
    const classes = ["status", variant].filter(Boolean).join(" ");
    statusEl.className = classes;
  }

  function setSearchStatus(message, variant = "info") {
    if (!searchStatus) {
      return;
    }
    if (!message) {
      searchStatus.textContent = "";
      searchStatus.className = "status";
      return;
    }
    searchStatus.textContent = message;
    searchStatus.className = `status ${variant}`.trim();
  }

  function formatWeekday(dateString) {
    if (!dateString) {
      return '';
    }
    const date = new Date(`${dateString}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      return dateString;
    }
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  function formatFullDate(dateString) {
    if (!dateString) {
      return '';
    }
    const date = new Date(`${dateString}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      return dateString;
    }
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function formatDayName(dateString) {
    if (!dateString) {
      return '';
    }
    const date = new Date(`${dateString}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      return dateString;
    }
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
    });
  }

  function formatShortDate(dateString) {
    if (!dateString) {
      return '';
    }
    const date = new Date(`${dateString}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      return dateString;
    }
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }

  function isWeekend(dateString) {
    if (!dateString) {
      return false;
    }
    const date = new Date(`${dateString}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      return false;
    }
    const day = date.getUTCDay();
    return day === 0 || day === 6;
  }

  function formatTimestamp(isoString) {
    if (!isoString) {
      return 'Updated just now';
    }
    const parsed = new Date(isoString);
    if (Number.isNaN(parsed.getTime())) {
      return `Updated ${isoString}`;
    }
    return `Updated ${parsed.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })}`;
  }

  function groupRecordsByDate(records) {
    const groups = [];
    const map = new Map();
    records.forEach((record) => {
      const key = record.date || 'Unscheduled';
      if (!map.has(key)) {
        const group = {
          key,
          fullLabel: formatFullDate(record.date || ''),
          shortLabel: formatDayName(record.date || ''),
          compactLabel: formatShortDate(record.date || ''),
          count: 0,
          isWeekend: isWeekend(record.date || ''),
        };
        map.set(key, group);
        groups.push(group);
      }
      map.get(key).count += 1;
    });
    return groups;
  }

  function normalizeSessionLabel(rawValue) {
    if (!rawValue) {
      return 'TBD';
    }
    const value = rawValue.trim();
    const normalized = value.toLowerCase().replace(/[_\s]+/g, '-');
    if (normalized === 'time-after-hours' || normalized === 'after-hours' || normalized === 'afterhours') {
      return 'AMC';
    }
    if (normalized === 'time-pre-market' || normalized === 'pre-market' || normalized === 'premarket') {
      return 'BMO';
    }
    if (normalized === 'bmo' || normalized === 'amc') {
      return value.toUpperCase();
    }
    return value;
  }

  function clearTimeline() {
    timelineList.innerHTML = '';
    timelineContainer.classList.add('hidden');
  }

  function clearSourceSummary() {
    if (!sourceSummary) {
      return;
    }
    sourceSummary.classList.add('hidden');
    if (irSourceList) {
      irSourceList.innerHTML = '';
    }
    if (fallbackSourceList) {
      fallbackSourceList.innerHTML = '';
    }
  }

  function renderSourceSummary(data) {
    if (!sourceSummary || !irSourceList || !fallbackSourceList) {
      return;
    }
    const irNames = Array.isArray(data?.irCompanies) ? data.irCompanies : [];
    const fallbackNames = Array.isArray(data?.fallbackCompanies) ? data.fallbackCompanies : [];

    const populate = (element, names) => {
      element.innerHTML = '';
      if (!names.length) {
        const emptyItem = document.createElement('li');
        emptyItem.textContent = 'No companies for this selection.';
        emptyItem.classList.add('is-empty');
        element.appendChild(emptyItem);
        return;
      }
      names.forEach((name) => {
        const item = document.createElement('li');
        item.textContent = name;
        element.appendChild(item);
      });
    };

    populate(irSourceList, irNames);
    populate(fallbackSourceList, fallbackNames);

    if (!irNames.length && !fallbackNames.length) {
      sourceSummary.classList.add('hidden');
    } else {
      sourceSummary.classList.remove('hidden');
    }
  }

  function renderTimeline(groups) {
    if (!groups || groups.length === 0) {
      clearTimeline();
      return;
    }
    const fragment = document.createDocumentFragment();
    groups.forEach((group) => {
      if (group.key === 'Unscheduled') {
        return;
      }
      const item = document.createElement('li');
      item.className = 'timeline-entry';
      if (group.isWeekend) {
        item.classList.add('timeline-entry--weekend');
      }
      const label = document.createElement('div');
      label.className = 'timeline-label';
      const primary = document.createElement('span');
      primary.textContent = group.shortLabel;
      const secondary = document.createElement('span');
      secondary.textContent = group.compactLabel;
      label.append(primary, secondary);
      const countBadge = document.createElement('span');
      countBadge.className = 'timeline-count';
      countBadge.textContent = group.count;
      item.append(label, countBadge);
      if (group.isWeekend) {
        const note = document.createElement('span');
        note.className = 'timeline-note';
        note.textContent = 'Weekend';
        item.append(note);
      }
      fragment.appendChild(item);
    });
    if (!fragment.hasChildNodes()) {
      clearTimeline();
      return;
    }
    timelineList.innerHTML = '';
    timelineList.appendChild(fragment);
    timelineContainer.classList.remove('hidden');
  }

  function resetMeta() {
    [previewSector, previewWeek, previewUpdated, previewMissing].forEach((el) => {
      el.textContent = '';
      el.className = 'meta-chip';
    });
    if (sectorHeader) {
      sectorHeader.classList.add('hidden');
    }
  }

  function updatePreviewMeta(data, groups) {
    if (!data) {
      resetMeta();
      return;
    }
    resetMeta();
    if (data.sector) {
      const sectorLabel = data.sector;
      const needsSuffix = !sectorLabel.toLowerCase().includes('sector');
      const label = `${sectorLabel}${needsSuffix ? ' sector' : ''}`.trim();
      previewSector.textContent = `${label} (${data.tickerCount ?? 0} tracked)`;
    }
    if (data.week && data.week.label) {
      previewWeek.textContent = data.week.label;
    }
    previewUpdated.textContent = formatTimestamp(data.generatedAt);
    const missingCount = (data.missingPublic || []).length;
    previewMissing.textContent = missingCount
      ? `${missingCount} missing tickers`
      : 'All tickers covered';
    previewMissing.classList.add(missingCount ? 'meta-chip--warn' : 'meta-chip--ok');
    const recordCount = Array.isArray(data.records) ? data.records.length : 0;
    if (recordCount > 0) {
      const dayCount = groups
        ? groups.filter((group) => group.key !== 'Unscheduled').length
        : 0;
      matchCount.textContent =
        dayCount > 0
          ? `${recordCount} companies • ${dayCount} day${dayCount === 1 ? '' : 's'}`
          : `${recordCount} companies`;
    }
  }

  function renderMissing(privateFirms) {
    if (!privateFirms || privateFirms.length === 0) {
      missingSection.classList.add('hidden');
      missingSection.innerHTML = '';
      return;
    }
    const listItems = privateFirms.map((name) => `<li>${name}</li>`).join('');
    missingSection.innerHTML = `
      <strong>Heads-up:</strong>
      <p>The following companies from this sector do not have a public ticker and are skipped:</p>
      <ul>${listItems}</ul>
    `;
    missingSection.classList.remove('hidden');
  }

  function renderPreview(data) {
    tableBody.innerHTML = '';
    clearTimeline();
    clearSourceSummary();
    if (!data.records || data.records.length === 0) {
      if (sectorHeader) {
        sectorHeader.classList.add('hidden');
      }
      previewSection.classList.add('hidden');
      matchCount.textContent = 'No matches';
      return [];
    }
    const showSector = data.sectorSlug === 'all';
    if (sectorHeader) {
      sectorHeader.classList.toggle('hidden', !showSector);
    }
    const sortedRecords = [...data.records].sort((a, b) => {
      const aDate = a.date || '';
      const bDate = b.date || '';
      if (aDate !== bDate) {
        return aDate.localeCompare(bDate);
      }
      const aCompany = (a.company || '').toLowerCase();
      const bCompany = (b.company || '').toLowerCase();
      return aCompany.localeCompare(bCompany);
    });
    const dayGroups = groupRecordsByDate(sortedRecords);
    let previousDate = null;
    const fragment = document.createDocumentFragment();
    sortedRecords.forEach((record) => {
      const recordDate = record.date || '';
      if (recordDate && recordDate !== previousDate) {
        const group = dayGroups.find((entry) => entry.key === recordDate);
        const groupRow = document.createElement('tr');
        groupRow.className = 'day-row';
        if (group?.isWeekend) {
          groupRow.classList.add('is-weekend');
        }
        const groupCell = document.createElement('th');
        groupCell.setAttribute('scope', 'colgroup');
        groupCell.colSpan = showSector ? 6 : 5;
        groupCell.textContent = group?.fullLabel || formatFullDate(recordDate);
        if (group?.isWeekend) {
          const badge = document.createElement('span');
          badge.className = 'day-note';
          badge.textContent = 'Weekend';
          groupCell.appendChild(document.createTextNode(' '));
          groupCell.appendChild(badge);
        }
        groupRow.appendChild(groupCell);
        fragment.appendChild(groupRow);
        previousDate = recordDate;
      }
      const tr = document.createElement('tr');
      const companyCell = document.createElement('td');
      companyCell.dataset.label = 'Company';
      companyCell.textContent = record.company || '';
      const tickerCell = document.createElement('td');
      tickerCell.dataset.label = 'Ticker';
      tickerCell.textContent = record.symbol || '';
      const irCell = document.createElement('td');
      irCell.dataset.label = 'IR Source';
      if (record.source === 'investor_relations' && record.ir_source_url) {
        const link = document.createElement('a');
        link.href = record.ir_source_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Investor relations';
        irCell.appendChild(link);
      } else {
        irCell.textContent = 'N/A';
      }
      const dateCell = document.createElement('td');
      dateCell.dataset.label = 'Weekday';
      dateCell.textContent = formatWeekday(record.date) || 'TBD';
      const callCell = document.createElement('td');
      callCell.dataset.label = 'BMO/AMC';
      callCell.classList.add('session-cell');
      const sessionValue = normalizeSessionLabel(record.bmo_amc);
      const pill = document.createElement('span');
      pill.className = 'session-pill';
      const sessionClass = sessionValue.toLowerCase();
      if (sessionClass === 'bmo' || sessionClass === 'amc') {
        pill.classList.add(`session-pill--${sessionClass}`);
      } else {
        pill.classList.add('session-pill--tbd');
      }
      pill.textContent = sessionValue;
      callCell.appendChild(pill);
      tr.appendChild(companyCell);
      tr.appendChild(tickerCell);
      if (showSector) {
        const sectorCell = document.createElement('td');
        sectorCell.dataset.label = 'Sector';
        sectorCell.textContent = record.sector || data.sector || '';
        tr.appendChild(sectorCell);
      }
      tr.appendChild(irCell);
      tr.append(dateCell, callCell);
      fragment.appendChild(tr);
    });
    tableBody.appendChild(fragment);
    previewSection.classList.remove('hidden');
    renderTimeline(dayGroups);
    return dayGroups;
  }

  function toSectorSlug(value) {
    return encodeURIComponent(value.trim().toLowerCase().replace(/\s+/g, '-'));
  }

  async function fetchJSON(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }
    return response.json();
  }

  function normaliseSearchValue(value) {
    return value ? value.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  }

  function describeSource(source) {
    if (!source) {
      return "Source unconfirmed";
    }
    if (source === "investor_relations") {
      return "Investor relations";
    }
    if (source === "aggregator") {
      return "Public aggregators";
    }
    return source.replace(/[_-]/g, " ");
  }

  async function loadSearchIndex() {
    if (searchIndex) {
      return searchIndex;
    }
    if (searchIndexPromise) {
      return searchIndexPromise;
    }
    const weeks = Array.isArray(window.APP_PRELOADED_WEEKS) ? window.APP_PRELOADED_WEEKS : [];
    searchIndexPromise = (async () => {
      const entries = [];
      await Promise.all(
        weeks.map(async (week) => {
          try {
            const data = await fetchJSON(`api/preview/${week.id}/all.json`);
            const weekLabel = week.label || (data.week && data.week.label) || "";
            const records = Array.isArray(data.records) ? data.records : [];
            records.forEach((record) => {
              entries.push({
                company: record.company || "",
                symbol: record.symbol || "",
                date: record.date || "",
                sector: record.sector || data.sector || "",
                source: record.source || "",
                session: record.bmo_amc || record.nasdaq_time_label || "",
                weekId: week.id,
                weekLabel,
              });
            });
          } catch (error) {
            console.warn(`Failed to load search data for ${week.id}:`, error);
          }
        }),
      );
      return entries;
    })();
    searchIndex = await searchIndexPromise;
    return searchIndex;
  }

  function clearSearchResults() {
    if (!searchResults || !searchResultsList || !searchResultsCount) {
      return;
    }
    searchResultsList.innerHTML = "";
    searchResultsCount.textContent = "";
    searchResults.classList.add("hidden");
  }

  function renderSearchResults(items) {
    if (!searchResults || !searchResultsList || !searchResultsCount) {
      return;
    }
    const MAX_RESULTS = 40;
    const limited = items.slice(0, MAX_RESULTS);
    searchResultsList.innerHTML = "";
    limited.forEach((entry) => {
      const listItem = document.createElement("li");
      listItem.className = "search-results__item";
      listItem.tabIndex = 0;

      const primary = document.createElement("div");
      primary.className = "search-results__primary";
      const company = document.createElement("span");
      company.className = "search-results__company";
      company.textContent = entry.company || "Unnamed company";
      primary.appendChild(company);

      if (entry.symbol) {
        const ticker = document.createElement("span");
        ticker.className = "search-results__ticker";
        ticker.textContent = entry.symbol.toUpperCase();
        primary.appendChild(ticker);
      }
      listItem.appendChild(primary);

      const dateLine = document.createElement("div");
      dateLine.className = "search-results__date";
      if (entry.date) {
        dateLine.textContent = `${formatFullDate(entry.date)} • ${entry.weekLabel}`;
      } else {
        dateLine.textContent = `${entry.weekLabel} • Date to be confirmed`;
      }
      listItem.appendChild(dateLine);

      const meta = document.createElement("div");
      meta.className = "search-results__meta";
      const sectorMeta = document.createElement("span");
      sectorMeta.textContent = entry.sector || "Sector unknown";
      meta.appendChild(sectorMeta);

      if (entry.session) {
        const sessionMeta = document.createElement("span");
        sessionMeta.textContent = `Session: ${entry.session}`;
        meta.appendChild(sessionMeta);
      }

      const sourceMeta = document.createElement("span");
      sourceMeta.textContent = describeSource(entry.source);
      meta.appendChild(sourceMeta);
      listItem.appendChild(meta);

      listItem.addEventListener("click", () => {
        if (!weekSelect || !sectorSelect) {
          return;
        }
        weekSelect.value = entry.weekId;
        const desiredSector = entry.sector && entry.sector !== "All sectors" ? entry.sector : "All";
        const availableValues = Array.from(sectorSelect.options).map((opt) => opt.value);
        sectorSelect.value = availableValues.includes(desiredSector) ? desiredSector : "All";
        downloadBtn.disabled = true;
        setStatus(`Loading ${entry.company} in the weekly preview...`, "loading");
        handlePreview();
        if (previewSection) {
          window.scrollTo({ top: previewSection.offsetTop - 24, behavior: "smooth" });
        }
      });

      listItem.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          listItem.click();
        }
      });

      searchResultsList.appendChild(listItem);
    });

    if (items.length > limited.length) {
      const moreNotice = document.createElement("li");
      moreNotice.className = "search-results__item search-results__item--more";
      moreNotice.textContent = `Showing ${limited.length} of ${items.length} matches. Refine your search to narrow results.`;
      searchResultsList.appendChild(moreNotice);
    }

    const matchLabel = items.length === 1 ? "match" : "matches";
    searchResultsCount.textContent = `${items.length} ${matchLabel}`;
    searchResults.classList.remove("hidden");
  }

  async function handleSearch(event) {
    event.preventDefault();
    const query = searchInput ? searchInput.value.trim() : "";
    if (!query) {
      setSearchStatus("Enter a company name or ticker to search.", "error");
      clearSearchResults();
      return;
    }
    setSearchStatus("Looking for earnings...", "loading");
    clearSearchResults();
    try {
      const index = await loadSearchIndex();
      if (!index.length) {
        setSearchStatus("No searchable earnings data is available yet.", "info");
        return;
      }
      const target = normaliseSearchValue(query);
      const matches = index.filter((entry) => {
        const companyKey = normaliseSearchValue(entry.company);
        const symbolKey = normaliseSearchValue(entry.symbol);
        return companyKey.includes(target) || symbolKey.includes(target);
      });
      if (!matches.length) {
        setSearchStatus(`No upcoming earnings found for "${query}".`, "info");
        return;
      }
      matches.sort((a, b) => {
        if (!a.date && !b.date) {
          return a.weekLabel.localeCompare(b.weekLabel);
        }
        if (!a.date) {
          return 1;
        }
        if (!b.date) {
          return -1;
        }
        return new Date(a.date) - new Date(b.date);
      });
      renderSearchResults(matches);
      setSearchStatus(`Showing ${matches.length} match${matches.length === 1 ? "" : "es"} for "${query}".`, "success");
    } catch (error) {
      console.error("Search failed", error);
      setSearchStatus("Unable to run the search right now. Please try again later.", "error");
    }
  }

  function handleSearchClear() {
    if (searchInput) {
      searchInput.value = "";
      searchInput.focus();
    }
    setSearchStatus("");
    clearSearchResults();
  }

  async function handlePreview() {
   const payload = {
     sector: sectorSelect.value,
     weekId: weekSelect.value,
   };
    if (!payload.sector || !payload.weekId) {
      setStatus('Pick a week and sector first.', 'error');
      previewSection.classList.add('hidden');
      clearTimeline();
      clearSourceSummary();
      resetMeta();
      matchCount.textContent = 'No matches';
      renderMissing([]);
      return;
    }
    const slug = toSectorSlug(payload.sector);
    const url = `api/preview/${payload.weekId}/${slug}.json`;
    setStatus('Fetching earnings...', 'loading');
    downloadBtn.disabled = true;
    try {
      const data = await fetchJSON(url);
      lastPayload = payload;
      lastPreview = data;
      const groups = renderPreview(data);
      updatePreviewMeta(data, groups);
      renderMissing(data.missingPublic);
      renderSourceSummary(data);
      if (data.count > 0) {
        setStatus(`Found ${data.count} companies for ${data.week.label}.`, 'success');
        downloadBtn.disabled = false;
      } else {
        setStatus(`No scheduled earnings for ${data.week.label}.`, 'info');
      }
    } catch (error) {
      setStatus(error.message, 'error');
      previewSection.classList.add('hidden');
      clearTimeline();
      resetMeta();
      matchCount.textContent = 'No matches';
      renderMissing([]);
      clearSourceSummary();
      lastPreview = null;
      lastPayload = null;
    }
  }

  async function handleDownload() {
    if (!lastPayload) {
      setStatus('Preview the week before downloading.', 'error');
      return;
    }
    if (!lastPreview || !lastPreview.downloadPath) {
      setStatus('Download is not available for this selection.', 'error');
      return;
    }

    downloadBtn.disabled = true;
    setStatus('Building spreadsheet...', 'loading');
    try {
      const downloadPath = lastPreview.downloadPath;
      const filename = downloadPath.split('/').pop() || `earnings_${toSectorSlug(lastPayload.sector)}_${lastPayload.weekId}.csv`;
      const response = await fetch(downloadPath, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Download failed (${response.status})`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus('Spreadsheet downloaded.', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      downloadBtn.disabled = false;
    }
  }

  previewBtn.addEventListener('click', handlePreview);
  downloadBtn.addEventListener('click', handleDownload);
  [weekSelect, sectorSelect].forEach((select) =>
    select.addEventListener('change', () => {
      downloadBtn.disabled = true;
      setStatus('Adjust selections and preview to refresh.', 'info');
    }),
  );
  if (searchForm) {
    searchForm.addEventListener("submit", handleSearch);
  }
  if (searchClearBtn) {
    searchClearBtn.addEventListener("click", handleSearchClear);
  }
})();
