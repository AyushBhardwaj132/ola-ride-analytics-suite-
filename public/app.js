/**
 * OLA Ride Analytics Suite - Client Application
 * Handles API calls, dynamic chart rendering, SQL runner, and table pagination.
 */

// Global state
const state = {
    filters: {
        vehicle: "All",
        status: "All",
        payment: "All",
        date_start: "",
        date_end: ""
    },
    activeTab: "overview",
    trendMetric: "volume", // 'volume' or 'revenue'
    rawTrendsData: [],
    explorerPage: 1,
    explorerPageSize: 15,
    searchDebounce: null,
    currentSqlResult: null
};

// Chart instances store
const charts = {};

// Color Palettes
const COLORS = {
    emerald: '#10B981',
    emeraldSubtle: 'rgba(16, 185, 129, 0.2)',
    cyan: '#06B6D4',
    indigo: '#6366F1',
    amber: '#F59E0B',
    rose: '#F43F5E',
    slate: '#64748B',
    border: 'rgba(255, 255, 255, 0.08)',
    text: '#94A3B8'
};

// Initialize Chart.js global dark theme defaults
if (window.Chart) {
    Chart.defaults.color = '#94A3B8';
    Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.95)';
    Chart.defaults.plugins.tooltip.titleColor = '#F8FAFC';
    Chart.defaults.plugins.tooltip.bodyColor = '#CBD5E1';
    Chart.defaults.plugins.tooltip.borderColor = 'rgba(255, 255, 255, 0.12)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
}

// Formatters
const fmtNumber = (n) => n != null ? Number(n).toLocaleString() : '--';
const fmtCurrency = (n) => {
    if (n == null) return '--';
    if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
    if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
    if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}k`;
    return `₹${Number(n).toLocaleString()}`;
};

// Helper: Build Query String from Filters
function getFilterQuery() {
    const p = new URLSearchParams();
    if (state.filters.vehicle !== 'All') p.set('vehicle', state.filters.vehicle);
    if (state.filters.status !== 'All') p.set('status', state.filters.status);
    if (state.filters.payment !== 'All') p.set('payment', state.filters.payment);
    if (state.filters.date_start) p.set('date_start', state.filters.date_start);
    if (state.filters.date_end) p.set('date_end', state.filters.date_end);
    return p.toString();
}

// App Initialization
document.addEventListener("DOMContentLoaded", async () => {
    setupTabNavigation();
    setupFilterListeners();
    await loadFilterOptions();
    await refreshAllDashboardData();
    setupSqlStudio();
    setupDataExplorer();
});

// Setup Tab Navigation
function setupTabNavigation() {
    const tabs = document.querySelectorAll(".nav-tab");
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
            
            tab.classList.add("active");
            const targetId = `tab-${tab.dataset.tab}`;
            const targetPane = document.getElementById(targetId);
            if (targetPane) {
                targetPane.classList.add("active");
                state.activeTab = tab.dataset.tab;
                
                // Trigger chart resizing if needed
                setTimeout(() => {
                    Object.values(charts).forEach(c => c && c.resize());
                }, 100);
            }
        });
    });

    // Volume vs Revenue Pill on Daily Trend
    document.querySelectorAll(".chart-pill-selector .pill-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".chart-pill-selector .pill-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.trendMetric = btn.dataset.metric;
            renderDailyTrendChart(state.rawTrendsData);
        });
    });
}

// Setup Filters
function setupFilterListeners() {
    const vehicleSelect = document.getElementById("filter-vehicle");
    const statusSelect = document.getElementById("filter-status");
    const paymentSelect = document.getElementById("filter-payment");
    const dateStart = document.getElementById("filter-date-start");
    const dateEnd = document.getElementById("filter-date-end");
    const btnReset = document.getElementById("btn-reset-filters");

    const onFilterChange = () => {
        state.filters.vehicle = vehicleSelect.value;
        state.filters.status = statusSelect.value;
        state.filters.payment = paymentSelect.value;
        state.filters.date_start = dateStart.value;
        state.filters.date_end = dateEnd.value;
        refreshAllDashboardData();
    };

    vehicleSelect.addEventListener("change", onFilterChange);
    statusSelect.addEventListener("change", onFilterChange);
    paymentSelect.addEventListener("change", onFilterChange);
    dateStart.addEventListener("change", onFilterChange);
    dateEnd.addEventListener("change", onFilterChange);

    btnReset.addEventListener("click", () => {
        vehicleSelect.value = "All";
        statusSelect.value = "All";
        paymentSelect.value = "All";
        dateStart.value = dateStart.min || "";
        dateEnd.value = dateEnd.max || "";
        onFilterChange();
    });
}

// Load Dropdown Options from DB
async function loadFilterOptions() {
    try {
        const res = await fetch("/api/filter_options");
        const data = await res.json();

        const vSelect = document.getElementById("filter-vehicle");
        vSelect.innerHTML = data.vehicles.map(v => `<option value="${v}">${v === 'All' ? 'All Vehicles (7)' : v}</option>`).join("");

        const sSelect = document.getElementById("filter-status");
        sSelect.innerHTML = data.statuses.map(s => `<option value="${s}">${s === 'All' ? 'All Statuses (4)' : s}</option>`).join("");

        const pSelect = document.getElementById("filter-payment");
        pSelect.innerHTML = data.payments.map(p => `<option value="${p}">${p === 'All' ? 'All Payment Modes' : p}</option>`).join("");

        const dStart = document.getElementById("filter-date-start");
        const dEnd = document.getElementById("filter-date-end");
        if (data.min_date && data.max_date) {
            dStart.min = data.min_date;
            dStart.max = data.max_date;
            dStart.value = data.min_date;

            dEnd.min = data.min_date;
            dEnd.max = data.max_date;
            dEnd.value = data.max_date;

            state.filters.date_start = data.min_date;
            state.filters.date_end = data.max_date;
        }
    } catch (err) {
        console.error("Failed to load filter options", err);
    }
}

// Master refresh for all dashboard views
async function refreshAllDashboardData() {
    await Promise.all([
        loadSummary(),
        loadDailyTrends(),
        loadHourly(),
        loadHotspots(),
        loadVehicles(),
        loadPayments(),
        loadTopCustomers(),
        loadCancellations()
    ]);
    if (state.activeTab === 'explorer') {
        loadExplorerBookings();
    }
}

// ================= TAB 1: OVERVIEW LOADERS =================

async function loadSummary() {
    try {
        const q = getFilterQuery();
        const res = await fetch(`/api/summary?${q}`);
        const data = await res.json();

        // Header counts
        document.getElementById("header-rides-count").innerText = fmtNumber(data.total_bookings);
        document.getElementById("header-rev-count").innerText = fmtCurrency(data.successful_revenue);

        // KPI cards
        document.getElementById("kpi-total-bookings").innerText = fmtNumber(data.total_bookings);
        document.getElementById("kpi-daily-avg").innerText = `~${Math.round(data.total_bookings / 31).toLocaleString()}`;
        
        document.getElementById("kpi-revenue").innerText = fmtCurrency(data.successful_revenue);
        document.getElementById("kpi-gross-value").innerText = fmtCurrency(data.total_booking_value);

        document.getElementById("kpi-success-pct").innerText = `${data.success_rate}%`;
        document.getElementById("kpi-success-count").innerText = fmtNumber(data.successful_bookings);
        document.getElementById("bar-success").style.width = `${Math.min(data.success_rate, 100)}%`;

        const totalCancelRate = (data.driver_cancel_rate + data.cust_cancel_rate).toFixed(1);
        document.getElementById("kpi-cancel-pct").innerText = `${totalCancelRate}%`;
        document.getElementById("kpi-cancelled-count").innerText = fmtNumber(data.canceled_by_driver + data.canceled_by_customer);
        document.getElementById("sub-driver-cancel").innerText = `${data.driver_cancel_rate}%`;
        document.getElementById("sub-cust-cancel").innerText = `${data.cust_cancel_rate}%`;

        document.getElementById("kpi-not-found-pct").innerText = `${data.not_found_rate}%`;
        document.getElementById("kpi-not-found-count").innerText = fmtNumber(data.driver_not_found);

        document.getElementById("kpi-avg-distance").innerText = `${data.avg_distance} km`;
        document.getElementById("kpi-driver-rating").innerText = `${data.avg_driver_rating}★`;
        document.getElementById("kpi-cust-rating").innerText = `${data.avg_customer_rating}★`;

        // Update status donut chart
        renderStatusDonut([
            data.successful_bookings,
            data.canceled_by_driver,
            data.canceled_by_customer,
            data.driver_not_found
        ]);
    } catch (err) {
        console.error("Failed to load summary", err);
    }
}

async function loadDailyTrends() {
    try {
        const q = getFilterQuery();
        const res = await fetch(`/api/trends?${q}`);
        state.rawTrendsData = await res.json();
        renderDailyTrendChart(state.rawTrendsData);
    } catch (err) {
        console.error("Failed to load daily trends", err);
    }
}

function renderDailyTrendChart(data) {
    const ctx = document.getElementById("chart-daily-trend").getContext("2d");
    if (charts.dailyTrend) charts.dailyTrend.destroy();

    const labels = data.map(d => d.date ? d.date.slice(5) : '');

    if (state.trendMetric === "revenue") {
        charts.dailyTrend = new Chart(ctx, {
            type: "line",
            data: {
                labels,
                datasets: [{
                    label: "Fulfilled Revenue (INR)",
                    data: data.map(d => d.revenue),
                    borderColor: COLORS.emerald,
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    fill: true,
                    tension: 0.35,
                    borderWidth: 2,
                    pointRadius: 2,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { color: COLORS.border } },
                    y: { 
                        grid: { color: COLORS.border },
                        ticks: { callback: v => fmtCurrency(v) }
                    }
                }
            }
        });
    } else {
        charts.dailyTrend = new Chart(ctx, {
            type: "line",
            data: {
                labels,
                datasets: [
                    {
                        label: "Successful Trips",
                        data: data.map(d => d.success),
                        borderColor: COLORS.emerald,
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        fill: true,
                        tension: 0.35,
                        borderWidth: 2,
                        pointRadius: 2
                    },
                    {
                        label: "Canceled by Driver",
                        data: data.map(d => d.driver_cancel),
                        borderColor: COLORS.rose,
                        backgroundColor: 'transparent',
                        tension: 0.35,
                        borderWidth: 2,
                        pointRadius: 2
                    },
                    {
                        label: "Canceled by Customer",
                        data: data.map(d => d.customer_cancel),
                        borderColor: COLORS.amber,
                        backgroundColor: 'transparent',
                        tension: 0.35,
                        borderWidth: 2,
                        pointRadius: 2
                    },
                    {
                        label: "Driver Not Found",
                        data: data.map(d => d.driver_not_found),
                        borderColor: COLORS.slate,
                        backgroundColor: 'transparent',
                        borderDash: [4, 4],
                        tension: 0.35,
                        borderWidth: 2,
                        pointRadius: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { color: COLORS.border } },
                    y: { grid: { color: COLORS.border } }
                }
            }
        });
    }
}

function renderStatusDonut(counts) {
    const ctx = document.getElementById("chart-status-donut").getContext("2d");
    if (charts.statusDonut) charts.statusDonut.destroy();

    charts.statusDonut = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: ["Success", "Driver Canceled", "Customer Canceled", "Driver Not Found"],
            datasets: [{
                data: counts,
                backgroundColor: [COLORS.emerald, COLORS.rose, COLORS.amber, COLORS.slate],
                borderColor: "#0F172A",
                borderWidth: 3,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "70%",
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { boxWidth: 12, padding: 12 }
                }
            }
        }
    });
}

async function loadHourly() {
    try {
        const q = getFilterQuery();
        const res = await fetch(`/api/hourly?${q}`);
        const data = await res.json();

        const ctx = document.getElementById("chart-hourly").getContext("2d");
        if (charts.hourly) charts.hourly.destroy();

        charts.hourly = new Chart(ctx, {
            type: "bar",
            data: {
                labels: data.map(d => `${d.hour}:00`),
                datasets: [
                    {
                        label: "Completed",
                        data: data.map(d => d.success),
                        backgroundColor: COLORS.emerald,
                        borderRadius: 3
                    },
                    {
                        label: "Canceled",
                        data: data.map(d => d.canceled),
                        backgroundColor: COLORS.rose,
                        borderRadius: 3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { stacked: true, grid: { color: 'transparent' } },
                    y: { stacked: true, grid: { color: COLORS.border } }
                }
            }
        });
    } catch (err) {
        console.error("Failed to load hourly data", err);
    }
}

async function loadHotspots() {
    try {
        const q = getFilterQuery();
        const res = await fetch(`/api/locations?${q}`);
        const data = await res.json();

        const ctx = document.getElementById("chart-hotspots").getContext("2d");
        if (charts.hotspots) charts.hotspots.destroy();

        const top10 = data.top_pickups.slice(0, 10);
        charts.hotspots = new Chart(ctx, {
            type: "bar",
            data: {
                labels: top10.map(d => d.location),
                datasets: [{
                    label: "Trip Bookings",
                    data: top10.map(d => d.rides),
                    backgroundColor: COLORS.cyan,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: "y",
                scales: {
                    x: { grid: { color: COLORS.border } },
                    y: { grid: { color: 'transparent' } }
                }
            }
        });
    } catch (err) {
        console.error("Failed to load hotspots", err);
    }
}

// ================= TAB 2: VEHICLE & FLEET LOADERS =================

const VEHICLE_ICONS = {
    'Auto': '🛺',
    'Bike': '🏍️',
    'eBike': '⚡',
    'Mini': '🚗',
    'Prime Sedan': '🚘',
    'Prime SUV': '🚙',
    'Prime Plus': '✨'
};

async function loadVehicles() {
    try {
        const q = getFilterQuery();
        const res = await fetch(`/api/vehicles?${q}`);
        const data = await res.json();

        // 1. Render Fleet Summary Cards
        const container = document.getElementById("fleet-cards-container");
        container.innerHTML = data.map(v => `
            <div class="fleet-card">
                <div class="fleet-card-icon">${VEHICLE_ICONS[v.vehicle] || '🚗'}</div>
                <div class="fleet-card-name">${v.vehicle}</div>
                <div class="fleet-card-metrics">
                    <div>Rides: <strong>${fmtNumber(v.total_rides)}</strong></div>
                    <div>Avg Dist: <strong>${v.avg_distance} km</strong></div>
                    <div>Turnaround: <strong>${v.avg_vtat}s</strong></div>
                    <div>Driver Rating: <strong>${v.avg_driver_rating}★</strong></div>
                </div>
            </div>
        `).join("");

        // 2. Rides & Revenue Chart
        const ctxVolume = document.getElementById("chart-vehicle-volume").getContext("2d");
        if (charts.vehicleVolume) charts.vehicleVolume.destroy();

        charts.vehicleVolume = new Chart(ctxVolume, {
            type: "bar",
            data: {
                labels: data.map(d => d.vehicle),
                datasets: [
                    {
                        label: "Total Trips",
                        data: data.map(d => d.total_rides),
                        backgroundColor: COLORS.indigo,
                        borderRadius: 4,
                        yAxisID: "y"
                    },
                    {
                        label: "Completed Trips",
                        data: data.map(d => d.successful_rides),
                        backgroundColor: COLORS.emerald,
                        borderRadius: 4,
                        yAxisID: "y"
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { color: 'transparent' } },
                    y: { grid: { color: COLORS.border } }
                }
            }
        });

        // 3. Avg Distance Chart (Query #2)
        const ctxDist = document.getElementById("chart-vehicle-distance").getContext("2d");
        if (charts.vehicleDistance) charts.vehicleDistance.destroy();

        charts.vehicleDistance = new Chart(ctxDist, {
            type: "bar",
            data: {
                labels: data.map(d => d.vehicle),
                datasets: [{
                    label: "Avg Distance (km)",
                    data: data.map(d => d.avg_distance),
                    backgroundColor: COLORS.cyan,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { color: 'transparent' } },
                    y: { 
                        grid: { color: COLORS.border },
                        ticks: { callback: v => `${v} km` }
                    }
                }
            }
        });

        // 4. Ratings Chart (Query #8)
        const ctxRatings = document.getElementById("chart-vehicle-ratings").getContext("2d");
        if (charts.vehicleRatings) charts.vehicleRatings.destroy();

        charts.vehicleRatings = new Chart(ctxRatings, {
            type: "radar",
            data: {
                labels: data.map(d => d.vehicle),
                datasets: [
                    {
                        label: "Driver Rating",
                        data: data.map(d => d.avg_driver_rating),
                        borderColor: COLORS.amber,
                        backgroundColor: 'rgba(245, 158, 11, 0.2)',
                        borderWidth: 2
                    },
                    {
                        label: "Customer Rating",
                        data: data.map(d => d.avg_customer_rating),
                        borderColor: COLORS.emerald,
                        backgroundColor: 'rgba(16, 185, 129, 0.2)',
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        min: 3.5,
                        max: 4.5,
                        grid: { color: COLORS.border },
                        angleLines: { color: COLORS.border },
                        pointLabels: { color: '#CBD5E1' }
                    }
                }
            }
        });

        // 5. TAT Chart
        const ctxTat = document.getElementById("chart-vehicle-tat").getContext("2d");
        if (charts.vehicleTat) charts.vehicleTat.destroy();

        charts.vehicleTat = new Chart(ctxTat, {
            type: "bar",
            data: {
                labels: data.map(d => d.vehicle),
                datasets: [
                    {
                        label: "Vehicle Search TAT (V_TAT)",
                        data: data.map(d => d.avg_vtat),
                        backgroundColor: COLORS.indigo,
                        borderRadius: 4
                    },
                    {
                        label: "Customer Response TAT (C_TAT)",
                        data: data.map(d => d.avg_ctat),
                        backgroundColor: COLORS.cyan,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { color: 'transparent' } },
                    y: { 
                        grid: { color: COLORS.border },
                        ticks: { callback: v => `${v}s` }
                    }
                }
            }
        });

    } catch (err) {
        console.error("Failed to load vehicle metrics", err);
    }
}

// ================= TAB 3: REVENUE & PAYMENTS LOADERS =================

async function loadPayments() {
    try {
        const q = getFilterQuery();
        const res = await fetch(`/api/payments?${q}`);
        const data = await res.json();

        const ctx = document.getElementById("chart-payment-revenue").getContext("2d");
        if (charts.paymentRevenue) charts.paymentRevenue.destroy();

        charts.paymentRevenue = new Chart(ctx, {
            type: "doughnut",
            data: {
                labels: data.map(d => d.method),
                datasets: [{
                    data: data.map(d => d.successful_value),
                    backgroundColor: [COLORS.emerald, COLORS.cyan, COLORS.indigo, COLORS.amber],
                    borderColor: "#0F172A",
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "65%",
                plugins: {
                    legend: { position: "bottom" },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.label}: ${fmtCurrency(ctx.raw)}`
                        }
                    }
                }
            }
        });
    } catch (err) {
        console.error("Failed to load payments", err);
    }
}

async function loadTopCustomers() {
    try {
        const q = getFilterQuery();
        const res = await fetch(`/api/top_customers?${q}`);
        const data = await res.json();

        const tbody = document.querySelector("#table-top-customers tbody");
        tbody.innerHTML = data.map((c, i) => `
            <tr>
                <td><strong>#${i + 1}</strong></td>
                <td><code style="color: #38BDF8">${c.customer_id}</code></td>
                <td><strong>${c.total_rides}</strong></td>
                <td><span class="badge-status success">${c.successful_rides}</span></td>
                <td><strong>${fmtCurrency(c.total_spend)}</strong></td>
                <td>${c.avg_rating ? c.avg_rating + '★' : '--'}</td>
                <td><span class="badge-tag">${i < 3 ? 'Elite Rider' : 'Gold'}</span></td>
            </tr>
        `).join("");
    } catch (err) {
        console.error("Failed to load top customers", err);
    }
}

// ================= TAB 4: CANCELLATIONS LOADERS =================

async function loadCancellations() {
    try {
        const q = getFilterQuery();
        const res = await fetch(`/api/cancellations?${q}`);
        const data = await res.json();

        // 1. Driver Reasons
        const ctxDriver = document.getElementById("chart-driver-reasons").getContext("2d");
        if (charts.driverReasons) charts.driverReasons.destroy();

        charts.driverReasons = new Chart(ctxDriver, {
            type: "bar",
            data: {
                labels: data.driver_reasons.map(d => d.reason),
                datasets: [{
                    label: "Cancellations",
                    data: data.driver_reasons.map(d => d.count),
                    backgroundColor: COLORS.rose,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: "y",
                scales: {
                    x: { grid: { color: COLORS.border } },
                    y: { grid: { color: 'transparent' } }
                }
            }
        });

        // 2. Customer Reasons
        const ctxCust = document.getElementById("chart-customer-reasons").getContext("2d");
        if (charts.customerReasons) charts.customerReasons.destroy();

        charts.customerReasons = new Chart(ctxCust, {
            type: "bar",
            data: {
                labels: data.customer_reasons.map(d => d.reason),
                datasets: [{
                    label: "Cancellations",
                    data: data.customer_reasons.map(d => d.count),
                    backgroundColor: COLORS.amber,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: "y",
                scales: {
                    x: { grid: { color: COLORS.border } },
                    y: { grid: { color: 'transparent' } }
                }
            }
        });

        // 3. Incomplete Reasons
        const incompContainer = document.getElementById("incomplete-reasons-container");
        if (data.incomplete_reasons.length === 0) {
            incompContainer.innerHTML = `<div class="empty-state">No incomplete rides found for active filters.</div>`;
        } else {
            incompContainer.innerHTML = data.incomplete_reasons.map(r => `
                <div class="incomplete-box">
                    <div class="incomplete-box-val">${fmtNumber(r.count)}</div>
                    <div class="incomplete-box-lbl">${r.reason || 'Unspecified Reason'}</div>
                </div>
            `).join("");
        }

    } catch (err) {
        console.error("Failed to load cancellations", err);
    }
}

// ================= TAB 5: SQL STUDIO =================

let sqlPresets = [];

async function setupSqlStudio() {
    try {
        const res = await fetch("/api/sql_presets");
        sqlPresets = await res.json();

        const listContainer = document.getElementById("presets-list");
        listContainer.innerHTML = sqlPresets.map(p => `
            <div class="preset-item" data-id="${p.id}">
                <span class="preset-num">QUERY #${p.id}</span>
                <div class="preset-title">${p.title.split('. ')[1] || p.title}</div>
            </div>
        `).join("");

        // Preset click handler
        document.querySelectorAll(".preset-item").forEach(item => {
            item.addEventListener("click", () => {
                document.querySelectorAll(".preset-item").forEach(i => i.classList.remove("active"));
                item.classList.add("active");

                const preset = sqlPresets.find(p => p.id === parseInt(item.dataset.id));
                if (preset) {
                    loadPresetIntoEditor(preset);
                }
            });
        });

        // Load first preset by default
        if (sqlPresets.length > 0) {
            const firstItem = document.querySelector(".preset-item");
            if (firstItem) firstItem.click();
        }

        // Run Button
        document.getElementById("btn-run-sql").addEventListener("click", runCurrentSql);

        // Export CSV Button
        document.getElementById("btn-export-csv").addEventListener("click", exportSqlCsv);

        // Keyboard Shortcut: Ctrl+Enter to run
        document.getElementById("sql-input").addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                runCurrentSql();
            }
        });

    } catch (err) {
        console.error("Failed to load SQL presets", err);
    }
}

function loadPresetIntoEditor(preset) {
    document.getElementById("current-query-title").innerText = preset.title;
    document.getElementById("current-query-desc").innerText = preset.description;
    document.getElementById("sql-input").value = preset.query;
    runCurrentSql();
}

async function runCurrentSql() {
    const query = document.getElementById("sql-input").value.trim();
    if (!query) return;

    const statusEl = document.getElementById("sql-status");
    const countEl = document.getElementById("sql-rows-count");
    const timeEl = document.getElementById("sql-time");
    const container = document.getElementById("sql-table-container");
    const captionEl = document.getElementById("results-caption");

    statusEl.innerText = "Executing...";
    statusEl.className = "meta-val";

    try {
        const res = await fetch("/api/execute_sql", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query })
        });
        const data = await res.json();

        timeEl.innerText = `${data.duration_ms} ms`;

        if (!res.ok || data.error) {
            statusEl.innerText = "Error";
            statusEl.className = "meta-val status-err";
            countEl.innerText = "0";
            captionEl.innerText = "Query execution failed";
            container.innerHTML = `
                <div class="empty-state" style="color: var(--accent-rose);">
                    ⚠️ ${data.error || 'Syntax or operational error in query.'}
                </div>
            `;
            state.currentSqlResult = null;
            return;
        }

        statusEl.innerText = "Success";
        statusEl.className = "meta-val status-ok";
        countEl.innerText = fmtNumber(data.row_count);
        captionEl.innerText = `Showing ${data.row_count} rows (Executed in ${data.duration_ms} ms)`;
        state.currentSqlResult = data;

        if (data.rows.length === 0) {
            container.innerHTML = `<div class="empty-state">Query returned 0 rows.</div>`;
            return;
        }

        // Render HTML Table
        let html = '<table class="data-table"><thead><tr>';
        data.columns.forEach(col => {
            html += `<th>${col}</th>`;
        });
        html += '</tr></thead><tbody>';

        data.rows.forEach(row => {
            html += '<tr>';
            row.forEach(val => {
                let display = val === null ? '<span style="color: var(--text-muted);">NULL</span>' : val;
                html += `<td>${display}</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody></table>';

        container.innerHTML = html;

    } catch (err) {
        console.error("SQL execution error", err);
        statusEl.innerText = "Network Error";
        statusEl.className = "meta-val status-err";
    }
}

function exportSqlCsv() {
    if (!state.currentSqlResult || !state.currentSqlResult.columns) {
        alert("Please run a query first before exporting.");
        return;
    }
    const { columns, rows } = state.currentSqlResult;
    let csv = columns.join(",") + "\n";
    rows.forEach(r => {
        csv += r.map(v => v === null ? "" : `"${String(v).replace(/"/g, '""')}"`).join(",") + "\n";
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `ola_sql_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ================= TAB 6: DATA EXPLORER =================

function setupDataExplorer() {
    const searchInput = document.getElementById("explorer-search");
    const prevBtn = document.getElementById("btn-prev-page");
    const nextBtn = document.getElementById("btn-next-page");

    searchInput.addEventListener("input", (e) => {
        clearTimeout(state.searchDebounce);
        state.searchDebounce = setTimeout(() => {
            state.explorerPage = 1;
            loadExplorerBookings();
        }, 300);
    });

    prevBtn.addEventListener("click", () => {
        if (state.explorerPage > 1) {
            state.explorerPage--;
            loadExplorerBookings();
        }
    });

    nextBtn.addEventListener("click", () => {
        state.explorerPage++;
        loadExplorerBookings();
    });
}

async function loadExplorerBookings() {
    const searchVal = document.getElementById("explorer-search").value.trim();
    const q = getFilterQuery();
    const url = `/api/bookings?page=${state.explorerPage}&page_size=${state.explorerPageSize}&search=${encodeURIComponent(searchVal)}&${q}`;

    try {
        const res = await fetch(url);
        const data = await res.json();

        const tbody = document.getElementById("bookings-tbody");
        if (data.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding: 2rem;">No matching booking records found.</td></tr>`;
        } else {
            tbody.innerHTML = data.data.map(b => {
                let statusClass = 'success';
                if (b.Booking_Status.includes('Canceled')) statusClass = 'canceled';
                else if (b.Booking_Status === 'Driver Not Found') statusClass = 'not-found';

                return `
                    <tr>
                        <td><code style="color: #38BDF8">${b.Booking_ID}</code></td>
                        <td>${b.Date_Only} <span style="color:var(--text-muted); font-size: 0.75rem;">${b.Time}</span></td>
                        <td><span class="badge-status ${statusClass}">${b.Booking_Status}</span></td>
                        <td><code>${b.Customer_ID}</code></td>
                        <td><span class="vehicle-pill">${VEHICLE_ICONS[b.Vehicle_Type] || '🚗'} ${b.Vehicle_Type}</span></td>
                        <td>${b.Pickup_Location}</td>
                        <td>${b.Drop_Location}</td>
                        <td>${b.Ride_Distance ? b.Ride_Distance + ' km' : '--'}</td>
                        <td><strong>₹${b.Booking_Value}</strong></td>
                        <td>${b.Payment_Method || '<span style="color:var(--text-muted)">--</span>'}</td>
                        <td>${b.Customer_Rating ? b.Customer_Rating + '★' : '--'}</td>
                    </tr>
                `;
            }).join("");
        }

        // Pagination controls
        document.getElementById("pagination-info").innerText = 
            `Showing page ${data.page} of ${data.total_pages} (${fmtNumber(data.total_records)} total records)`;
        document.getElementById("current-page-display").innerText = data.page;

        document.getElementById("btn-prev-page").disabled = (data.page <= 1);
        document.getElementById("btn-next-page").disabled = (data.page >= data.total_pages);

    } catch (err) {
        console.error("Failed to load bookings", err);
    }
}
