"use strict";

const { createElement, formatCompact, formatPercent, populateDatalist, renderBars } = window.DashboardUtils;
const theatreYear = document.querySelector("#theatre-year");
const theatreName = document.querySelector("#theatre-name");
const theatreShow = document.querySelector("#theatre-show");
const theatreMapLayer = document.querySelector("#theatre-map-layer");
const mapZoomIn = document.querySelector("#map-zoom-in");
const mapZoomOut = document.querySelector("#map-zoom-out");
const mapZoomStatus = document.querySelector("#map-zoom-status");
let theatreRows = [];
let theatreMetadata = new Map();
let selectedTheatreName = "";
let theatreMapZoom = 1;
const theatreMapZoomMinimum = 1;
const theatreMapZoomMaximum = 2.5;
const theatreMapZoomStep = .25;

function setTheatreMapZoom(value) {
  theatreMapZoom = Math.min(theatreMapZoomMaximum, Math.max(theatreMapZoomMinimum, value));
  theatreMapLayer.style.transform = `scale(${theatreMapZoom})`;
  mapZoomStatus.value = `${Math.round(theatreMapZoom * 100)}%`;
  mapZoomIn.disabled = theatreMapZoom >= theatreMapZoomMaximum;
  mapZoomOut.disabled = theatreMapZoom <= theatreMapZoomMinimum;
}

function theatreBaseRows() {
  const showQuery = theatreShow.value.trim().toLocaleLowerCase();
  return theatreRows.filter((row) => (
    (!theatreYear.value || row.year === theatreYear.value)
    && (!showQuery || row.show.toLocaleLowerCase().includes(showQuery))
  ));
}

function theatreMetricRows(baseRows) {
  const theatreQuery = theatreName.value.trim().toLocaleLowerCase();
  return baseRows.filter((row) => (
    (!theatreQuery || row.theatre.toLocaleLowerCase().includes(theatreQuery))
    && (!selectedTheatreName || row.theatre === selectedTheatreName)
  ));
}

function aggregateTheatres(rows) {
  const theatres = new Map();
  rows.forEach((row) => {
    const current = theatres.get(row.theatre) || {
      theatre: row.theatre,
      gross: 0,
      seats: 0,
      available: 0,
      shows: new Set()
    };
    current.gross += row.gross;
    current.seats += row.seats;
    current.available += row.available;
    current.shows.add(row.show);
    theatres.set(row.theatre, current);
  });
  return [...theatres.values()].sort((a, b) => b.gross - a.gross || a.theatre.localeCompare(b.theatre));
}

function aggregateProductions(rows) {
  const productions = new Map();
  rows.forEach((row) => {
    const current = productions.get(row.show) || { show: row.show, gross: 0, seats: 0, available: 0 };
    current.gross += row.gross;
    current.seats += row.seats;
    current.available += row.available;
    productions.set(row.show, current);
  });
  return [...productions.values()].sort((a, b) => b.gross - a.gross || a.show.localeCompare(b.show));
}

function selectTheatre(name) {
  selectedTheatreName = selectedTheatreName === name ? "" : name;
  renderTheatreDashboard();
}

function renderTheatreMap(rows) {
  theatreMapLayer.querySelectorAll(".map-point, .map-point-label").forEach((element) => element.remove());
  const maximum = Math.max(...rows.map((row) => row.gross), 1);

  rows.filter((row) => theatreMetadata.has(row.theatre)).forEach((row) => {
    const metadata = theatreMetadata.get(row.theatre);
    const point = createElement("button", undefined, "map-point");
    point.type = "button";
    point.classList.toggle("selected", row.theatre === selectedTheatreName);
    point.setAttribute("aria-pressed", String(row.theatre === selectedTheatreName));
    point.setAttribute("aria-label", `${row.theatre}, ${formatCompact(row.gross, true)}`);
    point.title = `${row.theatre}\n${metadata.address}\n${formatCompact(row.gross, true)}`;
    const size = 10 + Math.sqrt(row.gross / maximum) * 24;
    point.style.width = `${size}px`;
    point.style.height = `${size}px`;
    point.style.left = `${12 + metadata.x * 76}%`;
    point.style.top = `${10 + metadata.y * 76}%`;
    point.addEventListener("click", () => selectTheatre(row.theatre));
    theatreMapLayer.appendChild(point);
    if (row.theatre === selectedTheatreName) {
      const label = createElement("span", row.theatre, "map-point-label");
      label.id = "selected-theatre-map-label";
      label.setAttribute("role", "status");
      label.style.left = point.style.left;
      label.style.top = point.style.top;
      if (metadata.y < .2) label.classList.add("label-below");
      point.setAttribute("aria-describedby", label.id);
      theatreMapLayer.appendChild(label);
    }
  });
}

function renderTheatreSummary(rows) {
  const body = document.querySelector("#theatre-summary-body");
  body.replaceChildren(...rows.map((row) => {
    const tr = document.createElement("tr");
    const selected = row.theatre === selectedTheatreName;
    tr.className = selected ? "selected" : "";
    tr.tabIndex = 0;
    tr.setAttribute("aria-selected", String(selected));
    [
      row.theatre,
      formatCompact(row.gross, true),
      row.shows.size.toLocaleString("en-US"),
      formatPercent(row.available ? row.seats / row.available : Number.NaN)
    ].forEach((value) => tr.appendChild(createElement("td", value)));
    const select = () => selectTheatre(row.theatre);
    tr.addEventListener("click", select);
    tr.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
    return tr;
  }));
}

function renderProductionTable(rows) {
  const body = document.querySelector("#theatre-production-body");
  body.replaceChildren(...rows.map((row) => {
    const tr = document.createElement("tr");
    [
      row.show,
      formatCompact(row.gross, true),
      formatPercent(row.available ? row.seats / row.available : Number.NaN)
    ].forEach((value) => tr.appendChild(createElement("td", value)));
    return tr;
  }));
}

function renderTheatreDashboard() {
  const baseRows = theatreBaseRows();
  const metricRows = theatreMetricRows(baseRows);
  const baseTheatres = aggregateTheatres(baseRows);
  const filteredTheatres = aggregateTheatres(metricRows);
  const productions = aggregateProductions(metricRows);
  const totals = metricRows.reduce((result, row) => {
    result.gross += row.gross;
    result.seats += row.seats;
    result.available += row.available;
    return result;
  }, { gross: 0, seats: 0, available: 0 });
  const mappedNames = new Set(theatreMetadata.keys());
  const mappedGross = metricRows
    .filter((row) => mappedNames.has(row.theatre))
    .reduce((sum, row) => sum + row.gross, 0);

  document.querySelector("#theatre-count").textContent = filteredTheatres.length.toLocaleString("en-US");
  document.querySelector("#theatre-total-gross").textContent = formatCompact(mappedGross, true);
  document.querySelector("#theatre-capacity").textContent = formatPercent(totals.available ? totals.seats / totals.available : Number.NaN);

  renderTheatreMap(baseTheatres);
  renderBars("theatre-bars", baseTheatres.slice(0, 10).map((row) => ({
    label: row.theatre,
    value: row.gross,
    display: formatCompact(row.gross, true),
    selected: row.theatre === selectedTheatreName,
    onSelect: () => selectTheatre(row.theatre)
  })));
  renderTheatreSummary(baseTheatres);
  renderProductionTable(productions);
}

theatreYear.addEventListener("change", () => {
  selectedTheatreName = "";
  renderTheatreDashboard();
});
theatreName.addEventListener("input", () => {
  selectedTheatreName = "";
  renderTheatreDashboard();
});
theatreShow.addEventListener("input", () => {
  selectedTheatreName = "";
  renderTheatreDashboard();
});
mapZoomIn.addEventListener("click", () => setTheatreMapZoom(theatreMapZoom + theatreMapZoomStep));
mapZoomOut.addEventListener("click", () => setTheatreMapZoom(theatreMapZoom - theatreMapZoomStep));
setTheatreMapZoom(theatreMapZoom);

fetch("theatres-dashboard-data.json")
  .then((response) => {
    if (!response.ok) throw new Error(`Theatre data request failed: ${response.status}`);
    return response.json();
  })
  .then((data) => {
    theatreRows = data.rows.map(([year, show, theatre, gross, seats, available]) => (
      { year, show, theatre, gross, seats, available }
    ));
    theatreMetadata = new Map(data.theatres.map(([name, address, current, x, y]) => (
      [name, { address, current, x, y }]
    )));
    [...new Set(theatreRows.map((row) => row.year))]
      .sort((a, b) => b.localeCompare(a))
      .forEach((year) => theatreYear.appendChild(createElement("option", year)));
    populateDatalist("theatre-names", theatreRows.map((row) => row.theatre));
    populateDatalist("theatre-shows", theatreRows.map((row) => row.show));
    renderTheatreDashboard();
  })
  .catch((error) => console.error(error));
