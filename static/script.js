import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut, 
    sendPasswordResetEmail,
    updateProfile 
} from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_FIREBASE_AUTH_DOMAIN",
  projectId: "YOUR_FIREBASE_PROJECT_ID",
  storageBucket: "YOUR_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID",
  appId: "YOUR_FIREBASE_APP_ID",
  measurementId: "YOUR_FIREBASE_MEASUREMENT_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Analytics (wrapped in try-catch to prevent ad blocker crashes)
let analytics;
try {
    analytics = getAnalytics(app);
} catch (e) {
    console.warn("Firebase Analytics could not be initialized:", e);
}

// Initialize Auth
const auth = getAuth(app);

document.addEventListener('DOMContentLoaded', () => {
    // Auth DOM Elements
    const authSection = document.getElementById('authSection');
    const appNav = document.getElementById('appNav');
    const appContent = document.getElementById('appContent');
    const signInForm = document.getElementById('signInForm');
    const signUpForm = document.getElementById('signUpForm');
    const forgotForm = document.getElementById('forgotForm');
    const authAlert = document.getElementById('authAlert');
    const authAlertMsg = document.getElementById('authAlertMsg');
    const authSubtitle = document.getElementById('authSubtitle');
    const authSwitchText = document.getElementById('authSwitchText');
    const switchToSignUp = document.getElementById('switchToSignUp');
    const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
    const backToSignInBtn = document.getElementById('backToSignInBtn');
    const navUserName = document.getElementById('navUserName');
    const signOutBtn = document.getElementById('signOutBtn');

    // Dashboard DOM Elements
    const fileUpload = document.getElementById('fileUpload');
    const targetColumn = document.getElementById('targetColumn');
    const contaminationInput = document.getElementById('contamination');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const exportBtn = document.getElementById('exportBtn');
    const exportJsonBtn = document.getElementById('exportJsonBtn');
    const resultsDiv = document.getElementById('results');
    const detailedResults = document.getElementById('detailedResults');
    const comparisonChartDiv = document.getElementById('comparisonChart');
    const errorDisplay = document.getElementById('error');
    const uploadPreview = document.getElementById('uploadPreview');
    const cancelBtn = document.getElementById('cancelBtn');
    const contaminationSection = document.getElementById('contaminationSection');

    let abortController = null;
    let comparisonChart = null;
    let metricsChart = null;
    let scatterChart = null;
    let analysisData = [];

    // ==========================================
    // UI Helpers
    // ==========================================

    function toggleContamination() {
        const models = Array.from(document.querySelectorAll('.model-checkbox input:checked'))
                            .map(c => c.value);
        const isUnsupervised = models.some(m => ['isolation_forest', 'autoencoder'].includes(m));
        contaminationSection.classList.toggle('hidden', !isUnsupervised);
        if (!isUnsupervised) contaminationInput.value = '';
    }

    function updateFilePreview() {
        const files = fileUpload.files;
        if (files.length > 0) {
            uploadPreview.textContent = `${files.length} file(s) selected`;
            uploadPreview.classList.remove('hidden');
        } else {
            uploadPreview.classList.add('hidden');
        }
    }

    fileUpload.addEventListener('change', updateFilePreview);
    document.querySelectorAll('.model-checkbox input').forEach(cb => {
        cb.addEventListener('change', toggleContamination);
    });

    analyzeBtn.addEventListener('click', startAnalysis);
    exportBtn.addEventListener('click', exportResultsCsv);
    exportJsonBtn.addEventListener('click', exportResultsJson);
    cancelBtn.addEventListener('click', () => {
        if (abortController) {
            abortController.abort();
            analyzeBtn.disabled = false;
            cancelBtn.classList.add('hidden');
            analyzeBtn.querySelector('.btn-text').textContent = 'Analyze';
        }
    });

    function validateModelSelection() {
        const models = Array.from(document.querySelectorAll('.model-checkbox input:checked'))
                          .map(c => c.value);
        const hasSupervised = models.some(m => ['random_forest', 'lightgbm', 'deep_learning'].includes(m));
        const hasUnsupervised = models.some(m => ['isolation_forest', 'autoencoder'].includes(m));
        contaminationSection.classList.toggle('hidden', !hasUnsupervised);
        if (hasSupervised && !targetColumn.value.trim()) {
            showError('Supervised models require a target column');
            return false;
        }
        return true;
    }

	function showDownloadButton(preprocessedCsvUrl) {
		const downloadSection = document.getElementById("downloadSection");
		const downloadBtn = document.getElementById("downloadBtn");
		if (!preprocessedCsvUrl) return;
		if (downloadSection) downloadSection.classList.remove("hidden");
		if (downloadBtn) {
			downloadBtn.onclick = () => { window.location.href = preprocessedCsvUrl; };
		}
	}

    // ==========================================
    // Analysis
    // ==========================================

    async function startAnalysis() {
        if (!validateModelSelection()) return;
        abortController = new AbortController();

        const files = Array.from(fileUpload.files);
        const models = Array.from(document.querySelectorAll('.model-checkbox input:checked'))
                            .map(c => c.value);
        const target = targetColumn.value.trim();
        const contaminationValue = contaminationInput.value.trim();
        const thresholdMode = document.querySelector('input[name="thresholdMode"]:checked')?.value || 'contamination';

        clearResults();
        analyzeBtn.disabled = true;
        cancelBtn.classList.remove('hidden');
        analyzeBtn.querySelector('.btn-text').textContent = 'Analyzing...';
        errorDisplay.classList.add('hidden');

        try {
            if (!files.length) throw new Error('Please select at least one file');
            if (!models.length) throw new Error('Please select at least one model');

            const formData = new FormData();
            files.forEach(file => formData.append('files', file));
            formData.append('models', models.join(','));
            formData.append('targetColumn', target);
            formData.append('contamination', contaminationValue);
            formData.append('thresholdMode', thresholdMode);

            const response = await fetch('/analyze', {
                method: 'POST',
                body: formData,
                signal: abortController.signal
            });

            const data = await response.json();

            if (!response.ok || data.status === 'error') {
                let errorMsg = data.error || 'Analysis failed';
                if (data.errors) {
                    errorMsg += `: ${Array.isArray(data.errors) ? data.errors.join(', ') : data.errors}`;
                }
                throw new Error(errorMsg);
            }

            analysisData = data.results || data;
            renderResults(analysisData);
            resultsDiv.classList.remove('hidden');

			if (Array.isArray(data) && data.length > 0 && data[0].preprocessed_download) {
				showDownloadButton(data[0].preprocessed_download);
			}

        } catch (error) {
            if (error.name === 'AbortError') {
                showError('Analysis cancelled by user');
            } else {
                showError(error.message);
                console.error('Analysis error:', error);
            }
        } finally {
            analyzeBtn.disabled = false;
            analyzeBtn.querySelector('.btn-text').textContent = 'Analyze';
            cancelBtn.classList.add('hidden');
            abortController = null;
        }
    }

    // ==========================================
    // Export
    // ==========================================

    function exportResultsCsv() {
        if (!analysisData.length) { showError('No results to export'); return; }

        let csvContent = "File Name,Model,Accuracy,Precision,Recall,F1-Score,Contamination,Total Samples,Train Samples,Test Samples,% Normal,% Anomalies\n";

        analysisData.forEach(fileResult => {
            Object.entries(fileResult.results).forEach(([model, data]) => {
                if (data.error) return;
                csvContent += [
                    `"${fileResult.file_name}"`,
                    `"${model.replace(/_/g, ' ').toUpperCase()}"`,
                    data.metrics.accuracy != null ? (data.metrics.accuracy * 100).toFixed(2) : 'N/A',
                    data.metrics.precision != null ? (data.metrics.precision * 100).toFixed(2) : 'N/A',
                    data.metrics.recall != null ? (data.metrics.recall * 100).toFixed(2) : 'N/A',
                    data.metrics.f1 != null ? (data.metrics.f1 * 100).toFixed(2) : 'N/A',
                    data.stats.used_contamination || 'Auto',
                    data.stats.total_samples,
                    fileResult.train_size || 'N/A',
                    fileResult.test_size || 'N/A',
                    ((data.stats.normal / data.stats.total_samples) * 100).toFixed(2),
                    ((data.stats.anomalies / data.stats.total_samples) * 100).toFixed(2)
                ].join(',') + '\n';
            });

            // Add fusion row
            if (fileResult.fusion) {
                const f = fileResult.fusion;
                csvContent += [
                    `"${fileResult.file_name}"`,
                    '"FUSION (MAJORITY VOTE)"',
                    f.metrics.accuracy != null ? (f.metrics.accuracy * 100).toFixed(2) : 'N/A',
                    f.metrics.precision != null ? (f.metrics.precision * 100).toFixed(2) : 'N/A',
                    f.metrics.recall != null ? (f.metrics.recall * 100).toFixed(2) : 'N/A',
                    f.metrics.f1 != null ? (f.metrics.f1 * 100).toFixed(2) : 'N/A',
                    'N/A',
                    f.stats.total_samples,
                    'N/A',
                    f.stats.total_samples,
                    ((f.stats.normal / f.stats.total_samples) * 100).toFixed(2),
                    ((f.stats.anomalies / f.stats.total_samples) * 100).toFixed(2)
                ].join(',') + '\n';
            }
        });

        downloadFile(csvContent, `anomaly_results_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv;charset=utf-8;');
    }

    function exportResultsJson() {
        if (!analysisData.length) { showError('No results to export'); return; }
        const jsonStr = JSON.stringify(analysisData, null, 2);
        downloadFile(jsonStr, `anomaly_results_${new Date().toISOString().slice(0,10)}.json`, 'application/json');
    }

    function downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // ==========================================
    // Render Results
    // ==========================================

    function getBestModelPerFile(fileResult) {
        let bestModel = null;
        let bestScore = -Infinity;
        Object.entries(fileResult.results).forEach(([modelName, modelData]) => {
            if (modelData.error) return;
            const score = modelData.metrics.f1 != null ? modelData.metrics.f1 : (1 - modelData.stats.anomaly_rate);
            if (score > bestScore) { bestScore = score; bestModel = modelName; }
        });
        return bestModel ? bestModel.replace(/_/g, ' ').toUpperCase() : 'N/A';
    }

    function modelLabel(key) {
        return key.replace(/_/g, ' ').toUpperCase();
    }

    function renderResults(data) {
        detailedResults.innerHTML = '';
        if (comparisonChart) comparisonChart.destroy();
        if (metricsChart) metricsChart.destroy();
        if (scatterChart) scatterChart.destroy();

        // Dataset info bar
        renderDatasetInfo(data);

        // Main comparison chart (normal vs anomalies)
        const canvas1 = document.createElement('canvas');
        comparisonChartDiv.innerHTML = '';
        comparisonChartDiv.appendChild(canvas1);
        renderComparisonChart(canvas1, data);

        // Metrics chart (only if labels available)
        const hasMetrics = data.some(fr => Object.values(fr.results).some(r => !r.error && r.metrics.f1 != null));
        const metricsChartSection = document.getElementById('metricsChartSection');
        if (hasMetrics) {
            metricsChartSection.classList.remove('hidden');
            const canvas2 = document.createElement('canvas');
            document.getElementById('metricsChart').innerHTML = '';
            document.getElementById('metricsChart').appendChild(canvas2);
            renderMetricsChart(canvas2, data);
        } else {
            metricsChartSection.classList.add('hidden');
        }

        // Fusion section
        renderFusionSection(data);

        // Scatter plot
        renderScatterSection(data);

        // Confusion matrices
        renderConfusionMatrices(data);

        // Detailed tables
        data.forEach(fileResult => {
            const bestModel = getBestModelPerFile(fileResult);
            const table = buildResultsTable(fileResult, bestModel);
            detailedResults.appendChild(table);
        });
    }

    function renderDatasetInfo(data) {
        const bar = document.getElementById('datasetInfoBar');
        if (!data.length) { bar.classList.add('hidden'); return; }
        const first = data[0];
        const badges = [];
        if (first.total_features != null) badges.push(`<span class="info-badge"><i class="fas fa-table"></i> Features: ${first.total_features}</span>`);
        if (first.train_size != null) badges.push(`<span class="info-badge"><i class="fas fa-graduation-cap"></i> Train: ${first.train_size}</span>`);
        if (first.test_size != null) badges.push(`<span class="info-badge"><i class="fas fa-vial"></i> Test: ${first.test_size}</span>`);
        badges.push(`<span class="info-badge"><i class="fas fa-file-alt"></i> Files: ${data.length}</span>`);
        bar.innerHTML = badges.join('');
        bar.classList.remove('hidden');
    }

    function renderComparisonChart(canvas, data) {
        const datasets_info = data.flatMap(fileResult =>
            Object.entries(fileResult.results)
                .filter(([_, d]) => !d.error)
                .map(([model, d]) => ({
                    label: `${modelLabel(model)}\n(${fileResult.file_name})`,
                    normal: d.stats.normal,
                    anomalies: d.stats.anomalies,
                    total: d.stats.total_samples,
                    contamination: d.stats.used_contamination
                }))
        );

        const selectedModels = Array.from(document.querySelectorAll('.model-checkbox input:checked')).map(c => c.value);
        const showBestModel = selectedModels.length > 1;

        comparisonChart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: datasets_info.map(d => d.label),
                datasets: [
                    {
                        label: 'Normal',
                        data: datasets_info.map(d => d.normal),
                        backgroundColor: '#22c55e',
                        borderWidth: 0,
                        order: 2
                    },
                    {
                        label: 'Anomalies',
                        data: datasets_info.map(d => d.anomalies),
                        backgroundColor: '#ef4444',
                        borderWidth: 0,
                        order: 2
                    },
                    {
                        label: 'Total Samples',
                        type: 'line',
                        data: datasets_info.map(d => d.total),
                        borderColor: '#64748b',
                        borderWidth: 1,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#9ca3af' },
                        title: { display: true, text: 'Number of Samples', color: '#9ca3af' }
                    },
                    x: { ticks: { color: '#9ca3af', maxRotation: 0, minRotation: 0 }, grid: { display: false } }
                },
                plugins: {
                    legend: { display: true, position: 'bottom', labels: { color: '#9ca3af' } },
                    tooltip: {
                        callbacks: {
                            afterBody: (items) => {
                                const idx = items[0].dataIndex;
                                const c = datasets_info[idx].contamination;
                                return c ? `Contamination: ${c.toFixed(2)}` : '';
                            }
                        }
                    },
                    title: { display: true, text: 'Normal vs Anomalous Samples', color: '#ffffff' }
                }
            }
        });
    }

    function renderMetricsChart(canvas, data) {
        const entries = [];
        data.forEach(fileResult => {
            Object.entries(fileResult.results).forEach(([model, d]) => {
                if (d.error || d.metrics.f1 == null) return;
                entries.push({
                    label: `${modelLabel(model)} (${fileResult.file_name})`,
                    accuracy: d.metrics.accuracy != null ? +(d.metrics.accuracy * 100).toFixed(2) : 0,
                    precision: d.metrics.precision != null ? +(d.metrics.precision * 100).toFixed(2) : 0,
                    recall: d.metrics.recall != null ? +(d.metrics.recall * 100).toFixed(2) : 0,
                    f1: d.metrics.f1 != null ? +(d.metrics.f1 * 100).toFixed(2) : 0,
                });
            });
            // Add fusion entry
            if (fileResult.fusion && fileResult.fusion.metrics.f1 != null) {
                const f = fileResult.fusion;
                entries.push({
                    label: `FUSION (${fileResult.file_name})`,
                    accuracy: f.metrics.accuracy != null ? +(f.metrics.accuracy * 100).toFixed(2) : 0,
                    precision: f.metrics.precision != null ? +(f.metrics.precision * 100).toFixed(2) : 0,
                    recall: f.metrics.recall != null ? +(f.metrics.recall * 100).toFixed(2) : 0,
                    f1: f.metrics.f1 != null ? +(f.metrics.f1 * 100).toFixed(2) : 0,
                });
            }
        });

        metricsChart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: entries.map(e => e.label),
                datasets: [
                    { label: 'Accuracy', data: entries.map(e => e.accuracy), backgroundColor: '#3b82f6' },
                    { label: 'Precision', data: entries.map(e => e.precision), backgroundColor: '#f59e0b' },
                    { label: 'Recall', data: entries.map(e => e.recall), backgroundColor: '#22c55e' },
                    { label: 'F1-Score', data: entries.map(e => e.f1), backgroundColor: '#a855f7' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, max: 100, ticks: { color: '#9ca3af', callback: v => v + '%' }, title: { display: true, text: 'Score (%)', color: '#9ca3af' } },
                    x: { ticks: { color: '#9ca3af', maxRotation: 30 }, grid: { display: false } }
                },
                plugins: {
                    legend: { display: true, position: 'bottom', labels: { color: '#9ca3af' } },
                    title: { display: true, text: 'Performance Metrics by Model', color: '#ffffff' }
                }
            }
        });
    }

    function renderFusionSection(data) {
        const fusionSection = document.getElementById('fusionSection');
        const fusionResult = document.getElementById('fusionResult');
        const fusionFiles = data.filter(fr => fr.fusion);

        if (!fusionFiles.length) {
            fusionSection.classList.add('hidden');
            return;
        }
        fusionSection.classList.remove('hidden');
        fusionResult.innerHTML = '';

        fusionFiles.forEach(fr => {
            const f = fr.fusion;
            const anomalyPct = ((f.stats.anomalies / f.stats.total_samples) * 100).toFixed(2);
            const normalPct = ((f.stats.normal / f.stats.total_samples) * 100).toFixed(2);

            const card = document.createElement('div');
            card.className = 'fusion-result-card';
            card.innerHTML = `
                <div class="fusion-file-name"><i class="fas fa-file-csv"></i> ${fr.file_name}</div>
                <div class="fusion-stats-row">
                    <div class="fusion-stat">
                        <span class="fusion-stat-value text-green">${f.stats.normal}</span>
                        <span class="fusion-stat-label">Normal (${normalPct}%)</span>
                    </div>
                    <div class="fusion-stat">
                        <span class="fusion-stat-value text-red">${f.stats.anomalies}</span>
                        <span class="fusion-stat-label">Anomalies (${anomalyPct}%)</span>
                    </div>
                    ${f.metrics.f1 != null ? `
                    <div class="fusion-stat">
                        <span class="fusion-stat-value text-blue">${(f.metrics.accuracy * 100).toFixed(1)}%</span>
                        <span class="fusion-stat-label">Accuracy</span>
                    </div>
                    <div class="fusion-stat">
                        <span class="fusion-stat-value text-purple">${(f.metrics.f1 * 100).toFixed(1)}%</span>
                        <span class="fusion-stat-label">F1-Score</span>
                    </div>` : ''}
                </div>
                <div class="fusion-badge">Majority Voting Ensemble</div>
            `;
            fusionResult.appendChild(card);
        });
    }

    // Scatter plot: sample index vs anomaly score (0/1)
    function renderScatterSection(data) {
        const scatterSection = document.getElementById('scatterSection');
        const fileSelect = document.getElementById('scatterFileSelect');
        const modelSelect = document.getElementById('scatterModelSelect');

        fileSelect.innerHTML = '';
        data.forEach((fr, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = fr.file_name;
            fileSelect.appendChild(opt);
        });

        function populateModelSelect() {
            const fi = parseInt(fileSelect.value);
            const fr = data[fi];
            modelSelect.innerHTML = '';
            Object.keys(fr.results).filter(m => !fr.results[m].error).forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = modelLabel(m);
                modelSelect.appendChild(opt);
            });
            if (fr.fusion) {
                const opt = document.createElement('option');
                opt.value = '__fusion__';
                opt.textContent = 'FUSION (Majority Vote)';
                modelSelect.appendChild(opt);
            }
        }

        function drawScatter() {
            if (scatterChart) scatterChart.destroy();
            const fi = parseInt(fileSelect.value);
            const fr = data[fi];
            const modelKey = modelSelect.value;

            // We only have aggregate stats, not per-sample predictions from the API.
            // Generate a representative scatter using the stats (anomaly rate).
            let stats, label;
            if (modelKey === '__fusion__') {
                stats = fr.fusion.stats;
                label = 'FUSION';
            } else {
                stats = fr.results[modelKey].stats;
                label = modelLabel(modelKey);
            }

            const total = stats.total_samples;
            const nAnom = stats.anomalies;
            // Build synthetic index-based scatter: first n_normal are normal, rest anomalies
            const normalPoints = Array.from({ length: stats.normal }, (_, i) => ({ x: i, y: 0 }));
            const anomPoints = Array.from({ length: nAnom }, (_, i) => ({ x: stats.normal + i, y: 1 }));

            const canvas = document.createElement('canvas');
            document.getElementById('scatterChart').innerHTML = '';
            document.getElementById('scatterChart').appendChild(canvas);

            scatterChart = new Chart(canvas.getContext('2d'), {
                type: 'scatter',
                data: {
                    datasets: [
                        {
                            label: 'Normal',
                            data: normalPoints,
                            backgroundColor: 'rgba(34,197,94,0.5)',
                            pointRadius: 3
                        },
                        {
                            label: 'Anomaly',
                            data: anomPoints,
                            backgroundColor: 'rgba(239,68,68,0.7)',
                            pointRadius: 4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { title: { display: true, text: 'Sample Index', color: '#9ca3af' }, ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                        y: {
                            title: { display: true, text: 'Class (0=Normal, 1=Anomaly)', color: '#9ca3af' },
                            ticks: { color: '#9ca3af', stepSize: 1, callback: v => v === 0 ? 'Normal' : 'Anomaly' },
                            min: -0.2, max: 1.2,
                            grid: { color: 'rgba(255,255,255,0.05)' }
                        }
                    },
                    plugins: {
                        legend: { position: 'bottom', labels: { color: '#9ca3af' } },
                        title: { display: true, text: `Anomaly Scatter — ${label} (${fr.file_name})`, color: '#ffffff' }
                    }
                }
            });
        }

        fileSelect.addEventListener('change', () => { populateModelSelect(); drawScatter(); });
        modelSelect.addEventListener('change', drawScatter);

        populateModelSelect();
        scatterSection.classList.remove('hidden');
        drawScatter();
    }

    // Confusion matrix heatmap using canvas
    function renderConfusionMatrices(data) {
        const heatmapSection = document.getElementById('heatmapSection');
        const container = document.getElementById('confusionMatrices');
        container.innerHTML = '';

        const hasAny = data.some(fr =>
            Object.values(fr.results).some(r => !r.error && r.metrics.confusion_matrix) ||
            (fr.fusion && fr.fusion.metrics.confusion_matrix)
        );

        if (!hasAny) { heatmapSection.classList.add('hidden'); return; }
        heatmapSection.classList.remove('hidden');

        data.forEach(fr => {
            // Per-model confusion matrices
            Object.entries(fr.results).forEach(([model, d]) => {
                if (d.error || !d.metrics.confusion_matrix) return;
                const wrapper = createConfusionMatrixCard(d.metrics.confusion_matrix, `${modelLabel(model)} — ${fr.file_name}`);
                container.appendChild(wrapper);
            });
            // Fusion confusion matrix
            if (fr.fusion && fr.fusion.metrics.confusion_matrix) {
                const wrapper = createConfusionMatrixCard(fr.fusion.metrics.confusion_matrix, `FUSION — ${fr.file_name}`);
                container.appendChild(wrapper);
            }
        });
    }

    function createConfusionMatrixCard(cm, title) {
        const card = document.createElement('div');
        card.className = 'cm-card';

        const titleEl = document.createElement('div');
        titleEl.className = 'cm-title';
        titleEl.textContent = title;
        card.appendChild(titleEl);

        // Build a table-style matrix
        const labels = ['Normal', 'Anomaly'];
        const table = document.createElement('table');
        table.className = 'cm-table';

        // Header row
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = '<th>Actual \\ Pred</th>' + labels.map(l => `<th>${l}</th>`).join('');
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        // Find max value for color scaling
        const flat = cm.flat();
        const maxVal = Math.max(...flat, 1);

        cm.forEach((row, ri) => {
            const tr = document.createElement('tr');
            const rowLabel = document.createElement('th');
            rowLabel.textContent = labels[ri] || `Class ${ri}`;
            tr.appendChild(rowLabel);
            row.forEach((val, ci) => {
                const td = document.createElement('td');
                const intensity = val / maxVal;
                const isDiag = ri === ci;
                const bg = isDiag
                    ? `rgba(34,197,94,${0.2 + intensity * 0.6})`
                    : `rgba(239,68,68,${0.1 + intensity * 0.5})`;
                td.style.backgroundColor = bg;
                td.innerHTML = `<strong>${val}</strong>`;
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        card.appendChild(table);

        // Legend labels
        const legend = document.createElement('div');
        legend.className = 'cm-legend';
        legend.innerHTML = `<span class="cm-legend-normal">■ Correct</span><span class="cm-legend-error">■ Error</span>`;
        card.appendChild(legend);

        return card;
    }

    function buildResultsTable(fileResult, bestModel) {
        const totalSamples = Object.values(fileResult.results).find(r => !r.error)?.stats.total_samples || 0;
        const selectedModels = Array.from(document.querySelectorAll('.model-checkbox input:checked')).map(c => c.value);

        const table = document.createElement('table');
        table.className = 'results-table';

        const rows = Object.entries(fileResult.results)
            .filter(([_, d]) => !d.error)
            .map(([model, data]) => `
                <tr class="${model === bestModel.toLowerCase().replace(/ /g, '_') ? 'best-model' : ''}">
                    <td>${modelLabel(model)}</td>
                    <td>${data.metrics.accuracy != null ? `${(data.metrics.accuracy * 100).toFixed(2)}%` : 'N/A'}</td>
                    <td>${data.metrics.precision != null ? `${(data.metrics.precision * 100).toFixed(2)}%` : 'N/A'}</td>
                    <td>${data.metrics.recall != null ? `${(data.metrics.recall * 100).toFixed(2)}%` : 'N/A'}</td>
                    <td>${data.metrics.f1 != null ? `${(data.metrics.f1 * 100).toFixed(2)}%` : 'N/A'}</td>
                    <td>${data.stats.used_contamination || 'Auto'}</td>
                    <td>${((data.stats.normal / data.stats.total_samples) * 100).toFixed(2)}%</td>
                    <td>${((data.stats.anomalies / data.stats.total_samples) * 100).toFixed(2)}%</td>
                </tr>
            `).join('');

        // Fusion row
        let fusionRow = '';
        if (fileResult.fusion) {
            const f = fileResult.fusion;
            fusionRow = `
                <tr class="fusion-row">
                    <td><i class="fas fa-layer-group"></i> FUSION</td>
                    <td>${f.metrics.accuracy != null ? `${(f.metrics.accuracy * 100).toFixed(2)}%` : 'N/A'}</td>
                    <td>${f.metrics.precision != null ? `${(f.metrics.precision * 100).toFixed(2)}%` : 'N/A'}</td>
                    <td>${f.metrics.recall != null ? `${(f.metrics.recall * 100).toFixed(2)}%` : 'N/A'}</td>
                    <td>${f.metrics.f1 != null ? `${(f.metrics.f1 * 100).toFixed(2)}%` : 'N/A'}</td>
                    <td>Majority Vote</td>
                    <td>${((f.stats.normal / f.stats.total_samples) * 100).toFixed(2)}%</td>
                    <td>${((f.stats.anomalies / f.stats.total_samples) * 100).toFixed(2)}%</td>
                </tr>
            `;
        }

        table.innerHTML = `
            <thead>
                <tr>
                    <th colspan="8" class="file-header">
                        <span class="file-name">${fileResult.file_name}</span>
                        <div class="file-stats">
                            <span class="stat-badge">Total Samples: ${totalSamples}</span>
                            ${fileResult.train_size ? `<span class="stat-badge">Train: ${fileResult.train_size}</span>` : ''}
                            ${fileResult.test_size ? `<span class="stat-badge">Test: ${fileResult.test_size}</span>` : ''}
                            ${selectedModels.length > 1 ? `<span class="stat-badge best-model-badge">Best: ${bestModel}</span>` : ''}
                        </div>
                    </th>
                </tr>
                <tr class="column-headers">
                    <th>Model</th>
                    <th>Accuracy</th>
                    <th>Precision</th>
                    <th>Recall</th>
                    <th>F1-Score</th>
                    <th>Contamination</th>
                    <th>% Normal</th>
                    <th>% Anomalies</th>
                </tr>
            </thead>
            <tbody>${rows}${fusionRow}</tbody>
        `;
        return table;
    }

    function clearResults() {
        analysisData = [];
        detailedResults.innerHTML = '';
        comparisonChartDiv.innerHTML = '';
        if (comparisonChart) { comparisonChart.destroy(); comparisonChart = null; }
        if (metricsChart) { metricsChart.destroy(); metricsChart = null; }
        if (scatterChart) { scatterChart.destroy(); scatterChart = null; }
        document.getElementById("downloadSection").classList.add("hidden");
        document.getElementById("fusionSection").classList.add("hidden");
        document.getElementById("scatterSection").classList.add("hidden");
        document.getElementById("heatmapSection").classList.add("hidden");
        document.getElementById("metricsChartSection").classList.add("hidden");
        document.getElementById("datasetInfoBar").classList.add("hidden");
    }

    function showError(message) {
        errorDisplay.textContent = message;
        errorDisplay.classList.remove('hidden');
        setTimeout(() => errorDisplay.classList.add('hidden'), 8000);
    }

    document.getElementById('autoContam').addEventListener('click', () => {
        contaminationInput.value = '';
    });

    // ==========================================
    // Footer Features
    // ==========================================

    function initCodenesthubTypewriter() {
        const footerText = document.getElementById('codenesthub-text');
        if (!footerText) return;
        const targetText = 'codenesthub';
        const linkUrl = 'https://codenesthub.vercel.app/';
        let hasAnimated = false;
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !hasAnimated) {
                    hasAnimated = true;
                    typewriterEffect(footerText, targetText, linkUrl);
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.3 });
        const footer = document.querySelector('.business-footer');
        if (footer) observer.observe(footer);
    }

    function typewriterEffect(element, text, linkUrl) {
        let index = 0;
        element.textContent = '';
        const typeInterval = setInterval(() => {
            if (index < text.length) {
                element.textContent += text[index];
                index++;
            } else {
                clearInterval(typeInterval);
                setTimeout(() => {
                    const link = document.createElement('a');
                    link.href = linkUrl;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.textContent = text;
                    element.innerHTML = '';
                    element.appendChild(link);
                }, 300);
            }
        }, 100);
    }

    function initStatsCounter() {
        const statNumbers = document.querySelectorAll('.stat-number');
        let hasAnimated = false;
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !hasAnimated) {
                    hasAnimated = true;
                    statNumbers.forEach(stat => {
                        animateCounter(stat, parseInt(stat.getAttribute('data-target')));
                    });
                    observer.disconnect();
                }
            });
        }, { threshold: 0.5 });
        const footer = document.querySelector('.business-footer');
        if (footer) observer.observe(footer);
    }

    function animateCounter(element, target) {
        let current = 0;
        const increment = target / 50;
        const stepTime = 2000 / 50;
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) { current = target; clearInterval(timer); }
            element.textContent = Math.floor(current);
        }, stepTime);
    }

    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                const href = this.getAttribute('href');
                if (href !== '#' && href.length > 1) {
                    e.preventDefault();
                    const target = document.querySelector(href);
                    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
    }

    initCodenesthubTypewriter();
    initStatsCounter();
    initSmoothScroll();

    // ==========================================
    // Firebase Authentication Logic
    // ==========================================

    function setLoading(isLoading, button, spinner, textElement, loadingText) {
        button.disabled = isLoading;
        if (isLoading) {
            spinner.classList.remove('hidden');
            button.dataset.originalText = textElement.textContent;
            textElement.textContent = loadingText;
        } else {
            spinner.classList.add('hidden');
            textElement.textContent = button.dataset.originalText || loadingText;
        }
    }

    function showAuthAlert(message, isSuccess = false) {
        authAlert.className = 'auth-alert';
        if (isSuccess) {
            authAlert.classList.add('success');
            authAlert.querySelector('.alert-icon').className = 'fas fa-check-circle alert-icon';
        } else {
            authAlert.querySelector('.alert-icon').className = 'fas fa-exclamation-circle alert-icon';
        }
        authAlertMsg.textContent = message;
        authAlert.classList.remove('hidden');
    }

    function hideAuthAlert() { authAlert.classList.add('hidden'); }

    function clearAuthForms() {
        signInForm.reset();
        signUpForm.reset();
        forgotForm.reset();
        hideAuthAlert();
    }

    function getAuthErrorMessage(code) {
        switch (code) {
            case 'auth/invalid-email': return 'Invalid email address format.';
            case 'auth/user-disabled': return 'This user account has been disabled.';
            case 'auth/user-not-found': return 'No user found with this email.';
            case 'auth/wrong-password': return 'Incorrect password. Please try again.';
            case 'auth/email-already-in-use': return 'This email address is already registered.';
            case 'auth/weak-password': return 'The password is too weak. Must be at least 6 characters.';
            case 'auth/invalid-credential': return 'Invalid credentials. Please verify email and password.';
            case 'auth/too-many-requests': return 'Too many login attempts. Please try again later.';
            default: return 'An error occurred. Please try again.';
        }
    }

    function switchToSignUpView() {
        signInForm.classList.add('hidden');
        forgotForm.classList.add('hidden');
        signUpForm.classList.remove('hidden');
        authSubtitle.textContent = 'Create your account to get started';
        authSwitchText.innerHTML = `Already have an account? <button type="button" id="switchToSignIn" class="link-btn font-semibold">Sign In</button>`;
        document.getElementById('switchToSignIn').addEventListener('click', switchToSignInView);
        hideAuthAlert();
    }

    function switchToSignInView() {
        signUpForm.classList.add('hidden');
        forgotForm.classList.add('hidden');
        signInForm.classList.remove('hidden');
        authSubtitle.textContent = 'Sign in to access your analytics workspace';
        authSwitchText.innerHTML = `Don't have an account? <button type="button" id="switchToSignUp" class="link-btn font-semibold">Sign Up</button>`;
        document.getElementById('switchToSignUp').addEventListener('click', switchToSignUpView);
        hideAuthAlert();
    }

    function switchToForgotView() {
        signInForm.classList.add('hidden');
        signUpForm.classList.add('hidden');
        forgotForm.classList.remove('hidden');
        authSubtitle.textContent = 'Reset your account password';
        document.getElementById('authSwitchContainer').classList.add('hidden');
        hideAuthAlert();
    }

    if (switchToSignUp) switchToSignUp.addEventListener('click', switchToSignUpView);
    if (forgotPasswordBtn) forgotPasswordBtn.addEventListener('click', switchToForgotView);
    if (backToSignInBtn) {
        backToSignInBtn.addEventListener('click', () => {
            switchToSignInView();
            document.getElementById('authSwitchContainer').classList.remove('hidden');
        });
    }

    document.querySelectorAll('.password-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = btn.previousElementSibling;
            const icon = btn.querySelector('i');
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'fas fa-eye';
            }
        });
    });

    signInForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('signInEmail').value.trim();
        const password = document.getElementById('signInPassword').value;
        const btn = signInForm.querySelector('button[type="submit"]');
        const spinner = btn.querySelector('.auth-spinner');
        const text = btn.querySelector('.btn-text');
        setLoading(true, btn, spinner, text, 'Signing In...');
        hideAuthAlert();
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            showAuthAlert(getAuthErrorMessage(err.code));
            setLoading(false, btn, spinner, text, 'Sign In');
        }
    });

    signUpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('signUpName').value.trim();
        const email = document.getElementById('signUpEmail').value.trim();
        const password = document.getElementById('signUpPassword').value;
        const btn = signUpForm.querySelector('button[type="submit"]');
        const spinner = btn.querySelector('.auth-spinner');
        const text = btn.querySelector('.btn-text');
        if (password.length < 6) { showAuthAlert('Password must be at least 6 characters long.'); return; }
        setLoading(true, btn, spinner, text, 'Creating Account...');
        hideAuthAlert();
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCredential.user, { displayName: name });
            const user = auth.currentUser;
            if (user) navUserName.textContent = user.displayName || user.email.split('@')[0];
        } catch (err) {
            showAuthAlert(getAuthErrorMessage(err.code));
            setLoading(false, btn, spinner, text, 'Create Account');
        }
    });

    forgotForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('forgotEmail').value.trim();
        const btn = forgotForm.querySelector('button[type="submit"]');
        const spinner = btn.querySelector('.auth-spinner');
        const text = btn.querySelector('.btn-text');
        setLoading(true, btn, spinner, text, 'Sending...');
        hideAuthAlert();
        try {
            await sendPasswordResetEmail(auth, email);
            showAuthAlert('Password reset email sent! Check your inbox.', true);
            setLoading(false, btn, spinner, text, 'Send Reset Link');
            setTimeout(() => {
                switchToSignInView();
                document.getElementById('authSwitchContainer').classList.remove('hidden');
            }, 3000);
        } catch (err) {
            showAuthAlert(getAuthErrorMessage(err.code));
            setLoading(false, btn, spinner, text, 'Send Reset Link');
        }
    });

    signOutBtn.addEventListener('click', async () => {
        try { await signOut(auth); } catch (err) { console.error("Sign out error:", err); }
    });

    onAuthStateChanged(auth, (user) => {
        if (user) {
            const name = user.displayName || user.email.split('@')[0];
            navUserName.textContent = name;
            authSection.classList.add('hidden');
            appNav.classList.remove('hidden');
            appContent.classList.remove('hidden');
        } else {
            appNav.classList.add('hidden');
            appContent.classList.add('hidden');
            authSection.classList.remove('hidden');
            clearResults();
            fileUpload.value = '';
            uploadPreview.classList.add('hidden');
            targetColumn.value = '';
            contaminationInput.value = '';
            document.querySelectorAll('.model-checkbox input').forEach(cb => cb.checked = false);
            document.getElementById('contaminationSection').classList.add('hidden');
            clearAuthForms();
            switchToSignInView();
        }
    });
});
