(function () {
  const startWeekSelect = document.getElementById('start-week-select');
  const endWeekSelect = document.getElementById('end-week-select');
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
  const searchSuggestions = document.getElementById('search-suggestions');
  const searchPanel = document.querySelector('.search-panel');

  let lastPayload = null;
  let lastPreview = null;
  let searchIndexPromise = null;
  let searchIndex = null;
  let suggestionItems = [];
  let activeSuggestionIndex = -1;

  const MAX_SEARCH_RESULTS = 40;
  const MAX_SUGGESTIONS = 8;

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

  function handleSuggestionListKeyDown(event) {
    if (!suggestionItems.length) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = Math.min(activeSuggestionIndex + 1, suggestionItems.length - 1);
      setActiveSuggestion(nextIndex);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const nextIndex = activeSuggestionIndex <= 0 ? -1 : activeSuggestionIndex - 1;
      if (nextIndex === -1) {
        setActiveSuggestion(-1);
        if (searchInput) {
          searchInput.focus();
        }
      } else {
        setActiveSuggestion(nextIndex);
      }
    }
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
          anchorId: key === 'Unscheduled' ? 'day-unscheduled' : `day-${key}`,
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

  function showPreviewSection() {
    if (previewSection) {
      previewSection.classList.remove('hidden');
    }
  }

  function hidePreviewSection() {
    if (previewSection) {
      previewSection.classList.add('hidden');
    }
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

  function focusDay(anchorId) {
    if (!anchorId) {
      return;
    }
    const targetRow = document.getElementById(anchorId);
    if (!targetRow) {
      return;
    }
    targetRow.classList.add('day-row--highlight');
    targetRow.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    window.setTimeout(() => {
      targetRow.classList.remove('day-row--highlight');
    }, 2000);
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
      item.dataset.targetId = group.anchorId;
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
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
      item.addEventListener('click', () => focusDay(group.anchorId));
      item.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          focusDay(group.anchorId);
        }
      });
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
          ? `${recordCount} companies - ${dayCount} day${dayCount === 1 ? '' : 's'}`
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
      // sectorHeader logic removed
      hidePreviewSection();
      matchCount.textContent = 'No matches';
      return [];
    }
    const showSector = data.sectorSlug === 'all';
    // Removed sectorHeader toggle - using badges instead
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
        if (group?.anchorId) {
          groupRow.id = group.anchorId;
        } else if (recordDate) {
          groupRow.id = `day-${recordDate}`;
        }
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

      if (showSector) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.style.marginRight = '0.6rem';
        badge.style.fontSize = '0.75rem';
        badge.style.fontWeight = '600';
        badge.textContent = record.sector || data.sector || '';
        companyCell.appendChild(badge);
      }
      companyCell.appendChild(document.createTextNode(record.company || ''));

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
      // Removed separate sector column
      tr.appendChild(irCell);
      tr.append(dateCell, callCell);
      fragment.appendChild(tr);
    });
    tableBody.appendChild(fragment);
    showPreviewSection();
    renderTimeline(dayGroups);
    return dayGroups;
  }

  function toSectorSlug(value) {
    return encodeURIComponent(value.trim().toLowerCase().replace(/\s+/g, '-'));
  }

  async function fetchJSON(path, options = {}) {
    const response = await fetch(path, { cache: 'no-store', ...options });
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
    const limited = items.slice(0, MAX_SEARCH_RESULTS);
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
        dateLine.textContent = `${formatFullDate(entry.date)} - ${entry.weekLabel}`;
      } else {
        dateLine.textContent = `${entry.weekLabel} - Date to be confirmed`;
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
        if (!startWeekSelect || !endWeekSelect || !sectorSelect) {
          return;
        }
        startWeekSelect.value = entry.weekId;
        endWeekSelect.value = entry.weekId;
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

  function clearSuggestions() {
    suggestionItems = [];
    activeSuggestionIndex = -1;
    if (searchSuggestions) {
      searchSuggestions.innerHTML = "";
      searchSuggestions.classList.add("hidden");
    }
    if (searchInput) {
      searchInput.setAttribute("aria-expanded", "false");
    }
  }

  function setActiveSuggestion(index, focusItem = true) {
    if (!searchSuggestions) {
      activeSuggestionIndex = -1;
      return;
    }
    const items = Array.from(searchSuggestions.querySelectorAll("li"));
    items.forEach((item, idx) => {
      const isActive = idx === index && idx >= 0;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-selected", String(isActive));
      if (isActive && focusItem) {
        item.focus();
      }
    });
    activeSuggestionIndex = index;
  }

  function selectSuggestion(entry) {
    if (!searchInput || !entry) {
      return;
    }
    const value = entry.symbol || entry.company || "";
    if (value) {
      searchInput.value = value;
    }
    clearSuggestions();
    runSearch(value);
    searchInput.focus();
  }

  function renderSuggestions(items) {
    if (!searchSuggestions) {
      return;
    }
    if (!items.length) {
      clearSuggestions();
      return;
    }
    suggestionItems = items.slice(0, MAX_SUGGESTIONS);
    searchSuggestions.innerHTML = "";
    const fragment = document.createDocumentFragment();
    suggestionItems.forEach((entry, index) => {
      const listItem = document.createElement("li");
      listItem.setAttribute("role", "option");
      listItem.tabIndex = -1;
      const name = document.createElement("span");
      name.textContent = entry.company || entry.symbol || "";
      listItem.appendChild(name);
      if (entry.symbol) {
        const ticker = document.createElement("span");
        ticker.className = "search-suggestions__ticker";
        ticker.textContent = entry.symbol.toUpperCase();
        listItem.appendChild(ticker);
      }
      listItem.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      listItem.addEventListener("click", () => selectSuggestion(entry));
      listItem.addEventListener("mouseenter", () => setActiveSuggestion(index, false));
      listItem.addEventListener("mouseleave", () => setActiveSuggestion(-1, false));
      listItem.addEventListener("focus", () => setActiveSuggestion(index, false));
      listItem.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectSuggestion(entry);
          return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          handleSuggestionListKeyDown(event);
        }
      });
      fragment.appendChild(listItem);
    });
    searchSuggestions.appendChild(fragment);
    searchSuggestions.classList.remove("hidden");
    if (searchInput) {
      searchInput.setAttribute("aria-expanded", "true");
    }
  }

  async function handleSearchInputEvent() {
    if (!searchInput) {
      return;
    }
    const query = searchInput.value.trim();
    if (!query) {
      clearSuggestions();
      return;
    }
    const target = normaliseSearchValue(query);
    if (!target) {
      clearSuggestions();
      return;
    }
    try {
      const index = await loadSearchIndex();
      if (!index.length) {
        clearSuggestions();
        return;
      }
      const matches = [];
      const seen = new Set();
      index.forEach((entry) => {
        const companyKey = normaliseSearchValue(entry.company);
        const symbolKey = normaliseSearchValue(entry.symbol);
        const symbolIndex = symbolKey.indexOf(target);
        const companyIndex = companyKey.indexOf(target);
        if (symbolIndex === -1 && companyIndex === -1) {
          return;
        }
        const uniqueKey = `${entry.company || ""}|${entry.symbol || ""}`;
        if (seen.has(uniqueKey)) {
          return;
        }
        seen.add(uniqueKey);
        let matchRank = 3;
        let rankIndex = companyIndex;
        if (symbolIndex === 0) {
          matchRank = 0;
          rankIndex = symbolIndex;
        } else if (symbolIndex > 0) {
          matchRank = 1;
          rankIndex = symbolIndex;
        } else if (companyIndex === 0) {
          matchRank = 2;
          rankIndex = companyIndex;
        }
        const timestamp = entry.date ? Date.parse(entry.date) || Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
        matches.push({ entry, matchRank, rankIndex: rankIndex ?? Number.MAX_SAFE_INTEGER, timestamp });
      });
      if (!matches.length) {
        clearSuggestions();
        return;
      }
      matches.sort((a, b) => {
        if (a.matchRank !== b.matchRank) {
          return a.matchRank - b.matchRank;
        }
        if (a.rankIndex !== b.rankIndex) {
          return a.rankIndex - b.rankIndex;
        }
        return a.timestamp - b.timestamp;
      });
      renderSuggestions(matches.map((item) => item.entry));
    } catch (error) {
      console.error("Failed to build suggestions", error);
      clearSuggestions();
    }
  }

  function handleSearchKeyDown(event) {
    if (!suggestionItems.length) {
      if (event.key === "ArrowDown") {
        handleSearchInputEvent();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = Math.min(activeSuggestionIndex + 1, suggestionItems.length - 1);
      setActiveSuggestion(nextIndex);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const nextIndex = activeSuggestionIndex <= 0 ? -1 : activeSuggestionIndex - 1;
      if (nextIndex === -1) {
        setActiveSuggestion(-1);
        if (searchInput) {
          searchInput.focus();
        }
      } else {
        setActiveSuggestion(nextIndex);
      }
    } else if (event.key === "Enter") {
      if (activeSuggestionIndex >= 0 && activeSuggestionIndex < suggestionItems.length) {
        event.preventDefault();
        selectSuggestion(suggestionItems[activeSuggestionIndex]);
      }
    } else if (event.key === "Escape") {
      clearSuggestions();
    }
  }

  async function runSearch(query) {
    const value = (query || "").trim();
    if (!value) {
      setSearchStatus("Enter a company name or ticker to search.", "error");
      clearSearchResults();
      clearSuggestions();
      return;
    }
    setSearchStatus("Looking for earnings...", "loading");
    clearSearchResults();
    clearSuggestions();
    try {
      const index = await loadSearchIndex();
      if (!index.length) {
        setSearchStatus("No searchable earnings data is available yet.", "info");
        return;
      }
      const target = normaliseSearchValue(value);
      const matches = index.filter((entry) => {
        const companyKey = normaliseSearchValue(entry.company);
        const symbolKey = normaliseSearchValue(entry.symbol);
        return companyKey.includes(target) || symbolKey.includes(target);
      });
      if (!matches.length) {
        setSearchStatus(`No upcoming earnings found for "${value}".`, "info");
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
      setSearchStatus(`Showing ${matches.length} match${matches.length === 1 ? "" : "es"} for "${value}".`, "success");
    } catch (error) {
      console.error("Search failed", error);
      setSearchStatus("Unable to run the search right now. Please try again later.", "error");
    }
  }

  async function handleSearch(event) {
    event.preventDefault();
    const inputValue = searchInput ? searchInput.value : "";
    await runSearch(inputValue);
  }

  function handleSearchClear() {
    if (searchInput) {
      searchInput.value = "";
      searchInput.focus();
    }
    setSearchStatus("");
    clearSearchResults();
    clearSuggestions();
  }

  function getWeekRange(startId, endId) {
    const weeks = window.APP_PRELOADED_WEEKS || [];
    const startIndex = weeks.findIndex(w => w.id === startId);
    const endIndex = weeks.findIndex(w => w.id === endId);

    if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
      return [];
    }
    return weeks.slice(startIndex, endIndex + 1);
  }

  function jsonToCSV(records) {
    if (!records || !records.length) return '';
    const headers = ['Date', 'Time', 'Ticker', 'Company', 'Sector', 'Source'];
    const rows = records.map(r => [
      r.date,
      r.time,
      r.ticker,
      // Escape quotes in company name
      `"${(r.company || '').replace(/"/g, '""')}"`,
      r.sector || '',
      r.source
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  // Helper for date formatting in label
  function _formatLabel(isoDate) {
    if (!isoDate) return '';
    const parts = isoDate.split('-');
    // YYYY-MM-DD
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  async function handlePreview() {
    const startWeek = startWeekSelect.value;
    const endWeek = endWeekSelect.value;
    const sector = sectorSelect.value;

    const payload = {
      sector: sector,
      startWeekId: startWeek,
      endWeekId: endWeek,
    };

    if (!payload.sector || !payload.startWeekId || !payload.endWeekId) {
      setStatus('Pick a week range and sector first.', 'error');
      hidePreviewSection();
      clearTimeline();
      clearSourceSummary();
      resetMeta();
      matchCount.textContent = 'No matches';
      renderMissing([]);
      return;
    }

    // Ensure start <= end
    if (payload.startWeekId > payload.endWeekId) {
      setStatus('Start week must be before end week.', 'error');
      return;
    }

    const isSingleWeek = payload.startWeekId === payload.endWeekId;
    const slug = toSectorSlug(payload.sector);

    setStatus('Fetching earnings...', 'loading');
    downloadBtn.disabled = true;

    try {
      let data;
      if (isSingleWeek) {
        // Use static file directly
        const url = `api/preview/${payload.startWeekId}/${slug}.json`;
        data = await fetchJSON(url);
        // Ensure sectorSlug is set for badges
        data.sectorSlug = slug;
      } else {
        // Client-side aggregation
        const weekRange = getWeekRange(payload.startWeekId, payload.endWeekId);
        if (!weekRange.length) {
          throw new Error('Invalid week selection.');
        }

        const requests = weekRange.map(week => `api/preview/${week.id}/${slug}.json`);
        // Fetch all, ignoring 404s/errors gracefully
        const responses = await Promise.all(requests.map(url => fetchJSON(url).catch(e => null)));

        const successful = responses.filter(r => r);
        if (successful.length === 0) {
          throw new Error("No data found for selected range.");
        }

        // Aggregate
        let allRecords = [];
        let missingPublic = new Set();
        let irCompanies = new Set();
        let fallbackCompanies = new Set();
        let totalCount = 0;

        successful.forEach(d => {
          if (d.records) {
            // Ensure sector name is available on the record for badge display
            if (d.sector && d.sector !== 'All') {
              d.records.forEach(r => {
                if (!r.sector) r.sector = d.sector;
              });
            }
            allRecords.push(...d.records);
          }
          if (d.missingPublic) d.missingPublic.forEach(m => missingPublic.add(m));
          if (d.irCompanies) d.irCompanies.forEach(c => irCompanies.add(c));
          if (d.fallbackCompanies) d.fallbackCompanies.forEach(c => fallbackCompanies.add(c));
          totalCount += (d.count || 0);
        });

        // Sort records by date then ticker
        allRecords.sort((a, b) => {
          const dateA = a.date || '';
          const dateB = b.date || '';
          if (dateA !== dateB) return dateA.localeCompare(dateB);

          const symA = a.symbol || '';
          const symB = b.symbol || '';
          return symA.localeCompare(symB);
        });

        data = {
          records: allRecords,
          count: allRecords.length,
          missingPublic: Array.from(missingPublic).sort(),
          tickerCount: successful[0].tickerCount || 0, // Approx
          generatedAt: successful[0].generatedAt,
          irCompanies: Array.from(irCompanies).sort(),
          fallbackCompanies: Array.from(fallbackCompanies).sort(),
          week: {
            label: `Weeks of ${_formatLabel(weekRange[0].start_date)} to ${_formatLabel(weekRange[weekRange.length - 1].end_date)}`,
            id: `${payload.startWeekId}...${payload.endWeekId}`
          },
          sector: payload.sector,
          sectorSlug: slug
        };
      }

      lastPayload = payload;
      lastPreview = data;
      const groups = renderPreview(data);
      updatePreviewMeta(data, groups);
      renderMissing(data.missingPublic);
      renderSourceSummary(data);
      if (data.count > 0) {
        const weekLabel = data.week ? data.week.label : 'selected weeks';
        setStatus(`Found ${data.count} companies for ${weekLabel}.`, 'success');
        downloadBtn.disabled = false;
      } else {
        const weekLabel = data.week ? data.week.label : 'selected weeks';
        setStatus(`No scheduled earnings for ${weekLabel}.`, 'info');
      }
    } catch (error) {
      setStatus(error.message, 'error');
      hidePreviewSection();
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
    if (!lastPayload || !lastPreview) {
      setStatus('Preview first.', 'error');
      return;
    }

    downloadBtn.disabled = true;
    setStatus('Building spreadsheet...', 'loading');

    try {
      let url;
      let filename;

      if (lastPreview.downloadPath) {
        // Single week static file
        const downloadPath = lastPreview.downloadPath;
        filename = downloadPath.split('/').pop();
        const response = await fetch(downloadPath, { cache: 'no-store' });
        if (!response.ok) throw new Error("Download failed");
        const blob = await response.blob();
        url = URL.createObjectURL(blob);
      } else {
        // Generated client-side
        const csvContent = jsonToCSV(lastPreview.records);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        url = URL.createObjectURL(blob);
        filename = `earnings_${toSectorSlug(lastPayload.sector)}_range.csv`;
      }

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

  if (searchInput) {
    searchInput.setAttribute('role', 'combobox');
    searchInput.setAttribute('aria-autocomplete', 'list');
    searchInput.setAttribute('aria-controls', 'search-suggestions');
    searchInput.setAttribute('aria-expanded', 'false');
    searchInput.setAttribute('aria-haspopup', 'listbox');
    searchInput.addEventListener('input', () => {
      handleSearchInputEvent();
    });
    searchInput.addEventListener('focus', () => {
      handleSearchInputEvent();
    });
    searchInput.addEventListener('keydown', handleSearchKeyDown);
    searchInput.addEventListener('blur', () => {
      window.setTimeout(() => {
        const active = document.activeElement;
        if (!searchPanel || !active || !searchPanel.contains(active)) {
          clearSuggestions();
        }
      }, 120);
    });
  }

  if (searchPanel) {
    document.addEventListener('click', (event) => {
      if (!searchPanel.contains(event.target)) {
        clearSuggestions();
      }
    });
  }

  previewBtn.addEventListener('click', handlePreview);
  downloadBtn.addEventListener('click', handleDownload);

  function syncWeekSelectors() {
    if (startWeekSelect.value > endWeekSelect.value) {
      endWeekSelect.value = startWeekSelect.value;
    }
  }

  startWeekSelect.addEventListener('change', () => {
    syncWeekSelectors();
    downloadBtn.disabled = true;
    setStatus('Adjust selections and preview to refresh.', 'info');
  });

  [endWeekSelect, sectorSelect].forEach((select) =>
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



