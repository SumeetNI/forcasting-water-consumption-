// ---------- CONFIG ----------
const BASE_URL = "http://127.0.0.1:8000";

// ---------- Utilities ----------
const fmt = (n) => Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(n);

// Save + Load history in localStorage
const store = {
  key: "wc-forecast-history",
  load: () => JSON.parse(localStorage.getItem("wc-forecast-history") || "[]"),
  save: (arr) => localStorage.setItem("wc-forecast-history", JSON.stringify(arr)),
  add: (item) => { const arr = store.load(); arr.unshift(item); store.save(arr); }
};

// ---------- Router ----------
const routes = [...document.querySelectorAll('.route')];
const links = [...document.querySelectorAll('.link')];

function activate(id) {
  routes.forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.addEventListener('hashchange', () => activate(location.hash.replace('#', '') || 'home'));
activate(location.hash.replace('#', '') || 'home');

document.querySelector('.brand').addEventListener('click', () => { location.hash = '#home' });

// ---------- COUNTRY DROPDOWNS ----------
const countrySel = document.getElementById('country');
const countryAnalysis = document.getElementById('countryAnalysis');

// Load countries from backend
(async () => {
  try {
    const res = await fetch(`${BASE_URL}/countries`);
    const countries = await res.json();

    countries.forEach(c => {
      const o1 = document.createElement('option');
      o1.value = o1.textContent = c;
      countrySel.appendChild(o1);

      const o2 = o1.cloneNode(true);
      countryAnalysis.appendChild(o2);
    });

    countrySel.value = "India";
    countryAnalysis.value = "India";

    renderCompare(countrySel.value);
  } catch (e) {
    alert("Failed to load countries from backend. Is backend running?");
  }
})();

// Helper: Get Simulated Water Stress (0-100)
function getWaterStress(countryName) {
  // Deterministic random based on name length for consistency during session
  // In real app, fetch from API
  let hash = 0;
  for (let i = 0; i < countryName.length; i++) {
    hash = countryName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash % 100);
}

// Helper: Get Color for Stress Level
function getStressColor(score) {
  if (score < 40) return 'rgba(76, 201, 240, 0.8)'; // Low (Cyan)
  if (score < 70) return 'rgba(247, 37, 133, 0.8)'; // Medium (Pink)
  return 'rgba(255, 0, 0, 0.8)'; // High (Red)
}

// ---------- HOME GLOBE ----------
async function initGlobe() {
  const globeContainer = document.getElementById('globeViz');

  // Fetch countries to highlight (from backend)
  let supportedCountries = [];
  try {
    const res = await fetch(`${BASE_URL}/countries`);
    supportedCountries = await res.json();
  } catch (e) {
    console.warn("Could not load supported countries for globe highlight");
  }

  // Fetch World GeoJSON
  const geoRes = await fetch('https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson');
  const geoData = await geoRes.json();

  const world = Globe()
    (globeContainer)
    .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
    .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
    .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
    .width(globeContainer.clientWidth)
    .height(400)
    .polygonsData(geoData.features)
    .polygonCapColor(d => {
      const name = d.properties.NAME || d.properties.ADMIN;
      const isSupported = isCountrySupported(name, supportedCountries);
      if (isSupported) {
        const stress = getWaterStress(name);
        return getStressColor(stress);
      }
      return 'rgba(255, 255, 255, 0.05)';
    })
    .polygonSideColor(() => 'rgba(0, 0, 0, 0.1)')
    .polygonStrokeColor(() => '#111')
    .polygonLabel(({ properties: d }) => {
      const name = d.NAME || d.ADMIN;
      const isSupported = isCountrySupported(name, supportedCountries);
      let stressHtml = '';
      if (isSupported) {
        const stress = getWaterStress(name);
        let level = 'Low';
        let color = '#4cc9f0';
        if (stress >= 40) { level = 'Medium'; color = '#f72585'; }
        if (stress >= 70) { level = 'High'; color = '#ff0000'; }
        stressHtml = `<br><span style="color:${color}">Stress: ${level} (${stress})</span>`;
      }

      return `
        <div style="background: #111a2e; color: #fff; padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(122, 234, 255, .25);">
          <b>${name}</b>
          ${stressHtml}
        </div>
      `;
    })
    .labelsData(geoData.features.filter(d => {
      const name = d.properties.NAME || d.properties.ADMIN;
      return isCountrySupported(name, supportedCountries);
    }))
    .labelLat(d => {
      if (d.properties.LABEL_Y) return d.properties.LABEL_Y;
      if (d.properties.latitude) return d.properties.latitude;
      if (d.bbox) return (d.bbox[1] + d.bbox[3]) / 2;
      return 0;
    })
    .labelLng(d => {
      if (d.properties.LABEL_X) return d.properties.LABEL_X;
      if (d.properties.longitude) return d.properties.longitude;
      if (d.bbox) return (d.bbox[0] + d.bbox[2]) / 2;
      return 0;
    })
    .labelText(d => d.properties.NAME)
    .labelSize(1.5)
    .labelDotRadius(0.5)
    .labelColor(() => '#fff')
    .labelResolution(2)
    .onPolygonClick(({ properties: d }) => {
      const name = d.NAME;
      // Try to find exact match in dropdown
      const match = findDropdownMatch(name);

      if (match) {
        countrySel.value = match;
        location.hash = '#predict';
        renderCompare(match);
      } else {
        alert(`Sorry, we don't have data for ${name} yet.`);
      }
    });

  // Auto-rotate
  world.controls().autoRotate = true;
  world.controls().autoRotateSpeed = 0.5;
}

// Helper: Strict Country Matching
function isCountrySupported(geoName, dbList) {
  if (!geoName) return false;
  const g = geoName.toLowerCase();

  return dbList.some(db => {
    const d = db.toLowerCase();
    // Exact match
    if (g === d) return true;
    // Common Aliases
    if (d === 'usa' && (g === 'united states of america' || g === 'united states')) return true;
    if (d === 'england' && (g === 'united kingdom' || g === 'great britain')) return true;
    if (d === 'uk' && (g === 'united kingdom')) return true;
    if (d === 'uae' && g.includes('united arab emirates')) return true;
    return false;
  });
}

// Helper: Find Dropdown Value
function findDropdownMatch(geoName) {
  const options = [...countrySel.options].map(o => o.value);
  const g = geoName.toLowerCase();

  return options.find(opt => {
    const o = opt.toLowerCase();
    if (g === o) return true;
    if (o === 'usa' && (g === 'united states of america' || g === 'united states')) return true;
    if (o === 'england' && (g === 'united kingdom')) return true;
    return false;
  });
}

// Initialize after a slight delay to ensure container is ready
setTimeout(initGlobe, 1000);

// ---------- RECENT CAROUSEL ----------
function renderCarousel() {
  const wrap = document.getElementById('recentCarousel');
  wrap.innerHTML = '';
  const items = store.load().slice(0, 6);
  if (!items.length) {
    wrap.innerHTML = '<div class="muted">No predictions yet. Try Predict tab.</div>';
    return;
  }
  items.forEach(p => {
    const d = document.createElement('div');
    d.className = 'cardlet';
    d.innerHTML = `
      <div><b>${p.country}</b> • ${p.year}</div>
      <div>${p.models.join(', ')}</div>
      <div><small>${new Date(p.ts).toLocaleString()}</small></div>
      <div><b>${fmt(p.predicted)} m³</b> (${p.change > 0 ? '+' : ''}${fmt(p.change)}%)</div>
    `;
    wrap.appendChild(d);
  });
}
renderCarousel();

// ---------- PREDICT ----------
const predictForm = document.getElementById('predictForm');
const predictCtx = document.getElementById('predictChart').getContext('2d');
let predictChart;

function renderPredictChart(labels, series, band) {
  if (predictChart) predictChart.destroy();
  predictChart = new Chart(predictCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Prediction', data: series, fill: false, tension: .35 },
        { label: 'Lower Bound', data: band.map(b => b[0]), fill: '+1', tension: .35, pointRadius: 0 },
        { label: 'Upper Bound', data: band.map(b => b[1]), fill: false, tension: .35, pointRadius: 0 }
      ]
    },
    options: {
      plugins: { legend: { display: false } },
      interaction: { mode: 'index', intersect: false },
      elements: { point: { radius: 0 } },
      scales: { x: { grid: { display: false } } }
    }
  });
}

predictForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const country = countrySel.value;
  const year = +document.getElementById('year').value;
  const models = [...document.querySelectorAll('input[name="model"]:checked')].map(i => i.value);

  try {
    const response = await fetch(`${BASE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country, year, models })
    });

    if (!response.ok) throw new Error("Prediction failed.");

    const data = await response.json();

    document.getElementById('statCurrent').textContent = data.current.toFixed(2);
    document.getElementById('statPredicted').textContent = data.predicted.toFixed(2);
    document.getElementById('statChange').textContent = data.change.toFixed(2) + '%';

    renderPredictChart(data.years, data.values, data.band);

    store.add({ country, year, models, predicted: data.predicted, change: data.change, ts: Date.now() });
    renderHistory();
    renderCarousel();
    renderCompare(country);

  } catch (err) {
    alert("Error: " + err.message);
  }
});

// ---------- COMPARE ----------
const compareCtx = document.getElementById('compareChart').getContext('2d');
let compareChart;

async function renderCompare(country = "India") {

  try {
    const res = await fetch(`${BASE_URL}/compare?country=${encodeURIComponent(country)}`);
    if (!res.ok) throw new Error("Failed to load comparison data");
    const data = await res.json();

    const labels = data.years || [];
    const lasso = data.lasso || [];
    const ridge = data.ridge || [];
    const knn = data.knn || [];

    if (compareChart) compareChart.destroy();

    compareChart = new Chart(compareCtx, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "LASSO", data: lasso, borderColor: "blue", borderWidth: 2, fill: false },
          { label: "Ridge", data: ridge, borderColor: "green", borderWidth: 2, fill: false },
          { label: "KNN", data: knn, borderColor: "red", borderWidth: 2, fill: false }
        ]
      },
      options: {
        elements: { point: { radius: 0 } },
        interaction: { mode: "index", intersect: false }
      }
    });

  } catch (err) {
    alert("Compare chart error: " + err.message);
  }

  try {
    const mres = await fetch(`${BASE_URL}/metrics?country=${encodeURIComponent(country)}`);
    if (!mres.ok) throw new Error("Failed to fetch metrics");
    const metrics = await mres.json();
    updateCompareTable(metrics);
  } catch (err) {
    console.warn(err);
  }
}

function updateCompareTable(metrics) {
  const models = ["lasso", "knn", "ridge"];
  models.forEach(m => {
    const x = metrics[m] || {};
    document.querySelector(`[data-k="mae-${m}"]`).textContent = x.MAE ? fmt(x.MAE) : "—";
    document.querySelector(`[data-k="rmse-${m}"]`).textContent = x.RMSE ? fmt(x.RMSE) : "—";
    document.querySelector(`[data-k="r2-${m}"]`).textContent = x.R2 ? x.R2.toFixed(2) : "—";
    document.querySelector(`[data-k="mape-${m}"]`).textContent = x.MAPE ? fmt(x.MAPE) : "—";
  });
}

countrySel.addEventListener('change', e => renderCompare(e.target.value));

renderCompare();

// ---------- COUNTRY ANALYSIS (FIXED) ----------
const analysisCtx = document.getElementById('analysisChart').getContext('2d');
let analysisChart;

async function renderAnalysis(country = "India") {
  try {
    const res = await fetch(`${BASE_URL}/analysis?country=${encodeURIComponent(country)}`);
    if (!res.ok) throw new Error("Failed to load analysis data");

    const data = await res.json();

    if (analysisChart) analysisChart.destroy();

    analysisChart = new Chart(analysisCtx, {
      type: 'line',
      data: {
        labels: data.years,
        datasets: [{
          label: `${country} Water Consumption`,
          data: data.true_values,
          borderColor: "#00b7ff",
          borderWidth: 2,
          fill: false,
          tension: 0.35
        }]
      },
      options: {
        elements: { point: { radius: 0 } },
        plugins: { legend: { display: false } }
      }
    });

    document.getElementById('countryFacts').innerHTML =
      `<div class="stat"><span class="label">Years</span><span class="value">${data.years[0]} - ${data.years[data.years.length - 1]}</span></div>
       <div class="stat"><span class="label">Total Records</span><span class="value">${data.true_values.length}</span></div>`;

  } catch (err) {
    alert("Error loading analysis data: " + err.message);
  }
}

countryAnalysis.addEventListener('change', e => renderAnalysis(e.target.value));
renderAnalysis("India");

// ---------- HISTORY ----------
function renderHistory() {
  const tbody = document.querySelector('#historyTable tbody');
  tbody.innerHTML = '';

  store.load().forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${r.country}</td>
      <td>${new Date(r.ts).toLocaleDateString()}</td>
      <td>${r.year}</td>
      <td>${r.models.join(', ')}</td>
      <td>${fmt(r.predicted)}</td>
      <td>${r.change > 0 ? '+' : ''}${fmt(r.change)}%</td>
      <td><button class="btn danger sm" onclick="deleteHistory(${i})"><i class="fa-solid fa-trash"></i></button></td>
    `;
    tbody.appendChild(tr);
  });
}

// Global scope for onclick
window.deleteHistory = (index) => {
  const arr = store.load();
  arr.splice(index, 1);
  store.save(arr);
  renderHistory();
  renderCarousel();
};

document.getElementById('clearHistory').addEventListener('click', () => {
  if (confirm("Clear all history?")) {
    localStorage.removeItem(store.key);
    renderHistory();
    renderCarousel();
  }
});

document.getElementById('exportAll').addEventListener('click', () => {
  const data = JSON.stringify(store.load(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'prediction_history.json';
  a.click();
});

renderHistory();

// ---------- PDF REPORT GENERATION ----------
document.getElementById('downloadReport').addEventListener('click', async () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Title
  doc.setFontSize(20);
  doc.text("Water Consumption Forecast Report", 14, 22);

  doc.setFontSize(12);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

  // 1. Comparison Metrics Table
  doc.setFontSize(14);
  doc.text("Model Comparison Metrics", 14, 45);

  doc.autoTable({
    startY: 50,
    html: '#metricsTable',
    theme: 'grid',
    headStyles: { fillColor: [0, 119, 255] }
  });

  let finalY = doc.lastAutoTable.finalY + 10;

  // 2. Visual Comparison Chart
  const canvas = document.getElementById('compareChart');
  const imgData = canvas.toDataURL('image/png');

  doc.text("Visual Comparison Chart", 14, finalY);
  doc.addImage(imgData, 'PNG', 14, finalY + 5, 180, 90);

  // Save
  doc.save("Water_Forecast_Report.pdf");
});
