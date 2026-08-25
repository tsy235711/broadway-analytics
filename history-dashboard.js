"use strict";

const { createElement, formatCompact, formatPercent, populateDatalist, renderBars } = window.DashboardUtils;
const svgNamespace = "http://www.w3.org/2000/svg";
const historyYear = document.querySelector("#history-year");
const historyShow = document.querySelector("#history-show");
let historyRows = [];
let historyAwards = {};
let selectedHistoryShow = "";
let historySort = { key: "gross", direction: "desc" };

const historySortLabels = {
  show: "Production",
  gross: "Total Gross",
  seats: "Total Seats",
  capacity: "Average Capacity"
};

function historyBaseRows() {
  const query = historyShow.value.trim().toLocaleLowerCase();
  return historyRows.filter((row) => (
    (!historyYear.value || row.year === historyYear.value)
    && (!query || row.show.toLocaleLowerCase().includes(query))
  ));
}

function historyMetricRows(baseRows) {
  return selectedHistoryShow
    ? baseRows.filter((row) => row.show === selectedHistoryShow)
    : baseRows;
}

function historyTotals(rows) {
  return rows.reduce((totals, row) => {
    totals.gross += row.gross;
    totals.seats += row.seats;
    totals.available += row.available;
    totals.ticketSum += row.ticketSum;
    totals.ticketCount += row.ticketCount;
    totals.shows.add(row.show);
    return totals;
  }, { gross: 0, seats: 0, available: 0, ticketSum: 0, ticketCount: 0, shows: new Set() });
}

function historyAwardTotals(shows) {
  return [...shows].reduce((totals, show) => {
    const awards = historyAwards[show] || { wins: 0, nominations: 0 };
    totals.wins += awards.wins;
    totals.nominations += awards.nominations;
    return totals;
  }, { wins: 0, nominations: 0 });
}

function svgElement(tag, attributes, text) {
  const element = document.createElementNS(svgNamespace, tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderHistoryLine(rows) {
  const weekly = new Map();
  rows.forEach((row) => weekly.set(row.date, (weekly.get(row.date) || 0) + row.gross));
  const values = [...weekly].sort((a, b) => a[0].localeCompare(b[0]));
  const svg = document.querySelector("#history-line-chart");
  svg.replaceChildren();
  if (values.length === 0) return;

  const width = 700;
  const height = 245;
  const margin = { left: 62, right: 18, top: 18, bottom: 34 };
  const maximum = Math.max(...values.map(([, value]) => value), 1);
  const x = (index) => margin.left + (index / Math.max(values.length - 1, 1)) * (width - margin.left - margin.right);
  const y = (value) => margin.top + (1 - value / maximum) * (height - margin.top - margin.bottom);

  [0, .5, 1].forEach((position) => {
    const yPosition = margin.top + position * (height - margin.top - margin.bottom);
    svg.appendChild(svgElement("line", { x1: margin.left, x2: width - margin.right, y1: yPosition, y2: yPosition, class: "pbi-grid-line" }));
    svg.appendChild(svgElement("text", { x: margin.left - 8, y: yPosition + 4, "text-anchor": "end", class: "pbi-axis-text" }, formatCompact(maximum * (1 - position), true)));
  });

  const path = values.map(([, value], index) => `${index ? "L" : "M"} ${x(index)} ${y(value)}`).join(" ");
  svg.appendChild(svgElement("path", { d: path, class: "pbi-line" }));

  [0, Math.floor((values.length - 1) / 2), values.length - 1].forEach((index) => {
    const date = new Date(`${values[index][0]}T00:00:00`);
    svg.appendChild(svgElement("text", { x: x(index), y: height - 8, "text-anchor": index === 0 ? "start" : index === values.length - 1 ? "end" : "middle", class: "pbi-axis-text" }, date.getFullYear()));
  });
}

function aggregateHistoryShows(rows) {
  const shows = new Map();
  rows.forEach((row) => {
    const current = shows.get(row.show) || { show: row.show, gross: 0, seats: 0, available: 0 };
    current.gross += row.gross;
    current.seats += row.seats;
    current.available += row.available;
    shows.set(row.show, current);
  });
  return [...shows.values()].sort((a, b) => b.gross - a.gross || a.show.localeCompare(b.show));
}

function historySortValue(row, key) {
  if (key === "capacity") return row.available ? row.seats / row.available : Number.NEGATIVE_INFINITY;
  return row[key];
}

function sortHistoryShows(rows) {
  const direction = historySort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const first = historySortValue(a, historySort.key);
    const second = historySortValue(b, historySort.key);
    const comparison = typeof first === "string"
      ? first.localeCompare(second)
      : first - second;
    return comparison * direction || a.show.localeCompare(b.show);
  });
}

function updateHistorySortHeaders() {
  document.querySelectorAll("[data-history-sort-header]").forEach((header) => {
    const active = header.dataset.historySortHeader === historySort.key;
    header.setAttribute("aria-sort", active
      ? (historySort.direction === "asc" ? "ascending" : "descending")
      : "none");
    header.querySelector("span").textContent = active
      ? (historySort.direction === "asc" ? "\u25B2" : "\u25BC")
      : "";
  });
}

function renderHistoryTable(rows) {
  const body = document.querySelector("#history-table-body");
  body.replaceChildren(...sortHistoryShows(rows).map((row) => {
    const tr = document.createElement("tr");
    const selected = row.show === selectedHistoryShow;
    tr.className = selected ? "selected" : "";
    tr.tabIndex = 0;
    tr.setAttribute("aria-selected", String(selected));
    [row.show, formatCompact(row.gross, true), formatCompact(row.seats), formatPercent(row.available ? row.seats / row.available : Number.NaN)]
      .forEach((value) => tr.appendChild(createElement("td", value)));
    const select = () => {
      selectedHistoryShow = selected ? "" : row.show;
      renderHistoryDashboard();
    };
    tr.addEventListener("click", select);
    tr.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
    return tr;
  }));
  updateHistorySortHeaders();
  const sortDescription = historySort.key === "show"
    ? (historySort.direction === "asc" ? "A to Z" : "Z to A")
    : (historySort.direction === "asc" ? "lowest to highest" : "highest to lowest");
  document.querySelector("#history-table-status").textContent = selectedHistoryShow
    ? `Sorted by ${historySortLabels[historySort.key]}, ${sortDescription}. Filtering every visual by ${selectedHistoryShow}. Select the row again to clear.`
    : `Sorted by ${historySortLabels[historySort.key]}, ${sortDescription}. Select a row to filter every visual.`;
}

function renderHistoryDashboard() {
  const baseRows = historyBaseRows();
  const metricRows = historyMetricRows(baseRows);
  const totals = historyTotals(metricRows);
  const awards = historyAwardTotals(totals.shows);
  const showRows = aggregateHistoryShows(baseRows);

  document.querySelector("#history-total-gross").textContent = formatCompact(totals.gross, true);
  document.querySelector("#history-total-seats").textContent = formatCompact(totals.seats);
  document.querySelector("#history-win-rate").textContent = formatPercent(awards.nominations ? awards.wins / awards.nominations : Number.NaN);
  document.querySelector("#history-tony-wins").textContent = awards.wins.toLocaleString("en-US");
  document.querySelector("#history-nominations").textContent = awards.nominations.toLocaleString("en-US");
  document.querySelector("#history-ticket-price").textContent = totals.ticketCount
    ? (totals.ticketSum / totals.ticketCount).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "N/A";
  document.querySelector("#history-capacity").textContent = formatPercent(totals.available ? totals.seats / totals.available : Number.NaN);

  renderHistoryLine(metricRows);
  renderBars("history-production-bars", showRows.slice(0, 9).map((row) => ({
    label: row.show,
    value: row.gross,
    display: formatCompact(row.gross, true),
    selected: row.show === selectedHistoryShow,
    onSelect: () => {
      selectedHistoryShow = selectedHistoryShow === row.show ? "" : row.show;
      renderHistoryDashboard();
    }
  })));
  renderHistoryTable(showRows);
}

historyYear.addEventListener("change", () => {
  selectedHistoryShow = "";
  renderHistoryDashboard();
});
historyShow.addEventListener("input", () => {
  selectedHistoryShow = "";
  renderHistoryDashboard();
});
document.querySelectorAll("[data-history-sort]").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.historySort;
    historySort = historySort.key === key
      ? { key, direction: historySort.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "show" ? "asc" : "desc" };
    renderHistoryDashboard();
  });
});

fetch("history-dashboard-data.json")
  .then((response) => {
    if (!response.ok) throw new Error(`History data request failed: ${response.status}`);
    return response.json();
  })
  .then((data) => {
    historyRows = data.rows.map(([date, year, show, gross, seats, available, ticketSum, ticketCount]) => (
      { date, year, show, gross, seats, available, ticketSum, ticketCount }
    ));
    historyAwards = data.awards;
    [...new Set(historyRows.map((row) => row.year))]
      .sort((a, b) => b.localeCompare(a))
      .forEach((year) => historyYear.appendChild(createElement("option", year)));
    populateDatalist("history-shows", historyRows.map((row) => row.show));
    renderHistoryDashboard();
  })
  .catch((error) => console.error(error));
