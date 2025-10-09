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

  let lastPayload = null;
  let lastPreview = null;

  function setStatus(message, variant = "info") {
    statusEl.textContent = message || "";
    const classes = ["status", variant].filter(Boolean).join(" ");
    statusEl.className = classes;
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
    if (!data.records || data.records.length === 0) {
      previewSection.classList.add('hidden');
      matchCount.textContent = 'No matches';
      return;
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
    let previousDate = null;
    const fragment = document.createDocumentFragment();
    sortedRecords.forEach((record) => {
      const recordDate = record.date || '';
      if (recordDate && recordDate !== previousDate) {
        const groupRow = document.createElement('tr');
        groupRow.className = 'day-row';
        const groupCell = document.createElement('th');
        groupCell.setAttribute('scope', 'colgroup');
        groupCell.colSpan = 4;
        groupCell.textContent = formatFullDate(recordDate);
        groupRow.appendChild(groupCell);
        fragment.appendChild(groupRow);
        previousDate = recordDate;
      }
      const tr = document.createElement('tr');
      const companyCell = document.createElement('td');
      companyCell.textContent = record.company || '';
      const tickerCell = document.createElement('td');
      tickerCell.textContent = record.symbol || '';
      const dateCell = document.createElement('td');
      dateCell.textContent = formatWeekday(record.date);
      const callCell = document.createElement('td');
      callCell.textContent = normalizeSessionLabel(record.bmo_amc);
      tr.append(companyCell, tickerCell, dateCell, callCell);
      fragment.appendChild(tr);
    });
    tableBody.appendChild(fragment);
    matchCount.textContent = `${data.records.length} companies`;
    previewSection.classList.remove('hidden');
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

  async function handlePreview() {
    const payload = {
      sector: sectorSelect.value,
      weekId: weekSelect.value,
    };
    const slug = toSectorSlug(payload.sector);
    const url = `api/preview/${payload.weekId}/${slug}.json`;
    setStatus('Fetching earnings...', 'loading');
    downloadBtn.disabled = true;
    try {
      const data = await fetchJSON(url);
      lastPayload = payload;
      lastPreview = data;
      renderPreview(data);
      renderMissing(data.missingPublic);
      if (data.count > 0) {
        setStatus(`Found ${data.count} companies for ${data.week.label}.`, 'success');
        downloadBtn.disabled = false;
      } else {
        setStatus(`No scheduled earnings for ${data.week.label}.`, 'info');
      }
    } catch (error) {
      setStatus(error.message, 'error');
      previewSection.classList.add('hidden');
      renderMissing([]);
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
})();


