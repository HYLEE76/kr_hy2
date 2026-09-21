/**
 * StatPulse Application Controller
 * Handles user interactions, file ingestion via SheetJS,
 * reactive UI updates, tab switching, and one-click statistical analysis.
 */

(function (window) {
  'use strict';

  // Global Application State
  const AppState = {
    fileName: 'sensor_data_dummy.xlsx',
    sheetName: '센서 데이터',
    headers: [],
    rawRows: [],
    numericCols: [],
    timeCol: null,
    activeTab: 'tab-overview',
    selectedRegModel: 'linear',
    activeWorkbook: null
  };

  // ==========================================
  // 1. Toast Notification Utility
  // ==========================================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    
    let iconName = 'info';
    let color = 'var(--primary)';
    if (type === 'success') { iconName = 'check-circle'; color = 'var(--success)'; }
    else if (type === 'warning') { iconName = 'alert-triangle'; color = 'var(--warning)'; }
    else if (type === 'danger') { iconName = 'alert-octagon'; color = 'var(--danger)'; }

    toast.innerHTML = `
      <i data-lucide="${iconName}" style="width: 16px; height: 16px; color: ${color}; flex-shrink: 0;"></i>
      <span>${message}</span>
    `;
    container.appendChild(toast);
    if (window.lucide) lucide.createIcons({ root: toast });

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // ==========================================
  // 2. Data Ingestion & Parsing (100% Client Memory)
  // ==========================================

  function detectNumericColumns(headers, rows) {
    const numCols = [];
    headers.forEach(h => {
      let numCount = 0;
      let nonNullCount = 0;
      for (const r of rows) {
        const val = r[h];
        if (val !== null && val !== undefined && val !== '') {
          nonNullCount++;
          if (StatsEngine.isNumeric(val)) {
            numCount++;
          }
        }
      }
      if (nonNullCount > 0 && numCount / nonNullCount >= 0.6) {
        numCols.push(h);
      }
    });
    return numCols;
  }

  function detectTimeColumn(headers, rows) {
    // Check known timestamp keywords
    const keywords = ['시각', '시간', 'time', 'date', '일시', '일자', 'datetime', 'timestamp'];
    for (const h of headers) {
      const lower = h.toLowerCase();
      if (keywords.some(k => lower.includes(k)) && !lower.includes('경과') && !lower.includes('duration')) {
        return h;
      }
    }
    // Check first column if values look like time/date strings
    if (rows.length > 0) {
      const firstCol = headers[0];
      const val = String(rows[0][firstCol] || '');
      if (val.includes('-') || val.includes(':') || val.includes('/')) {
        return firstCol;
      }
    }
    return headers[0] || 'Index';
  }

  function loadDataset(fileName, sheetName, headers, data) {
    AppState.fileName = fileName;
    AppState.sheetName = sheetName;
    AppState.headers = headers;
    AppState.rawRows = data;
    AppState.numericCols = detectNumericColumns(headers, data);
    AppState.timeCol = detectTimeColumn(headers, data);

    // Update Header Badges
    document.getElementById('currentFileName').textContent = fileName;
    document.getElementById('currentRowCount').textContent = `(${data.length}행)`;

    // Refresh All UI Controls & Analytics
    populateDropdowns();
    runAllAnalyses();

    showToast(`데이터셋 로드 완료: ${data.length}개 행, ${AppState.numericCols.length}개 수치형 변수`, 'success');
  }

  function handleExcelFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        AppState.activeWorkbook = workbook;

        const sheetNames = workbook.SheetNames;
        const sheetContainer = document.getElementById('sheetSelectorContainer');
        const sheetSelect = document.getElementById('sheetSelector');

        if (sheetNames.length > 1) {
          sheetContainer.style.display = 'block';
          sheetSelect.innerHTML = '';
          sheetNames.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            sheetSelect.appendChild(opt);
          });
        } else {
          sheetContainer.style.display = 'none';
        }

        const firstSheetName = sheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (!jsonData || jsonData.length === 0) {
          showToast('선택한 시트에 유효한 데이터가 없습니다.', 'warning');
          return;
        }

        const headers = Object.keys(jsonData[0]);
        loadDataset(file.name, firstSheetName, headers, jsonData);
      } catch (err) {
        console.error('File parsing error:', err);
        showToast('엑셀 파일 파싱 중 오류가 발생했습니다: ' + err.message, 'danger');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ==========================================
  // 3. Populate Form Dropdowns
  // ==========================================

  function populateDropdowns() {
    const numCols = AppState.numericCols;
    const allHeaders = AppState.headers;

    function fillSelect(selectId, items, defaultVal) {
      const el = document.getElementById(selectId);
      if (!el) return;
      el.innerHTML = '';
      items.forEach(it => {
        const opt = document.createElement('option');
        opt.value = it;
        opt.textContent = it;
        if (it === defaultVal) opt.selected = true;
        el.appendChild(opt);
      });
    }

    // Descriptive Variable Selector
    fillSelect('selectDescVariable', numCols, numCols.find(c => c.includes('원시값')) || numCols[0]);

    // Correlation Selectors
    const corrX = numCols.find(c => c.includes('원시값')) || numCols[0];
    const corrY = numCols.find(c => c.includes('참값') || c.includes('비교')) || numCols[1] || numCols[0];
    fillSelect('selectCorrVarX', numCols, corrX);
    fillSelect('selectCorrVarY', numCols, corrY);

    // Sensor Error Selectors (Pred vs True)
    const errorPred = numCols.find(c => c.includes('원시값')) || numCols[0];
    const errorTrue = numCols.find(c => c.includes('참값') || c.includes('비교')) || numCols[1] || numCols[0];
    fillSelect('selectErrorVarPred', numCols, errorPred);
    fillSelect('selectErrorVarTrue', numCols, errorTrue);

    // Regression Selectors
    fillSelect('selectRegVarX', numCols, numCols.find(c => c.includes('경과시간') || c.includes('원시값')) || numCols[0]);
    fillSelect('selectRegVarY', numCols, numCols.find(c => c.includes('진동') || c.includes('압력') || c.includes('참값')) || numCols[1] || numCols[0]);

    // SPC Outlier Selector
    fillSelect('selectSpcVariable', numCols, numCols.find(c => c.includes('원시값')) || numCols[0]);
  }

  // ==========================================
  // 4. Analytics Modules Execution
  // ==========================================

  function runAllAnalyses() {
    renderOverviewTab();
    renderDescriptiveTab();
    renderCorrelationTab();
    renderSensorErrorTab();
    renderRegressionTab();
    renderOutliersTab();
    renderRawDataTab();
  }

  // --- TAB 1: Overview Dashboard ---
  function renderOverviewTab() {
    const rows = AppState.rawRows;
    const numCols = AppState.numericCols;
    const timeCol = AppState.timeCol;

    document.getElementById('kpiRowCount').textContent = rows.length;
    document.getElementById('kpiNumericCols').textContent = `${numCols.length}개`;

    const timeLabels = rows.map((r, i) => String(r[timeCol] || `#${i + 1}`));
    if (timeLabels.length > 0) {
      document.getElementById('kpiTimeSpan').textContent = `구간: ${timeLabels[0]} ~ ${timeLabels[timeLabels.length - 1]}`;
    }

    // Identify Pred & True columns for error summary
    const predCol = numCols.find(c => c.includes('원시값')) || numCols[0];
    const trueCol = numCols.find(c => c.includes('참값') || c.includes('비교')) || numCols[1];

    let rmseDisplay = '--';
    if (predCol && trueCol && predCol !== trueCol) {
      const yPred = rows.map(r => r[predCol]);
      const yTrue = rows.map(r => r[trueCol]);
      const errRes = StatsEngine.sensorErrorAnalysis(yPred, yTrue);
      if (errRes) {
        rmseDisplay = errRes.rmse.toFixed(4);
        document.getElementById('kpiRmseSub').textContent = `${predCol.slice(0, 10)}... 대비 RMSE`;
      }
    }
    document.getElementById('kpiRmseVal').textContent = rmseDisplay;

    // Check outliers across primary sensor variable
    let totalOutliersFound = 0;
    numCols.forEach(col => {
      const vals = rows.map(r => r[col]);
      const outRes = StatsEngine.detectOutliers(vals);
      totalOutliersFound += outRes.outliersCount;
    });
    document.getElementById('kpiOutlierCount').textContent = `${totalOutliersFound}건`;

    // Overview Multi Time Series Chart
    const seriesList = numCols.map(col => ({
      name: col,
      data: rows.map(r => {
        const v = Number(r[col]);
        return isNaN(v) ? null : v;
      })
    }));

    ChartManager.renderMultiTimeSeriesChart('chartOverviewTimeSeries', timeLabels, seriesList);
  }

  // --- TAB 2: Descriptive Statistics ---
  function renderDescriptiveTab() {
    const rows = AppState.rawRows;
    const numCols = AppState.numericCols;
    const selectedVar = document.getElementById('selectDescVariable').value || numCols[0];

    // 1. Build Descriptive Table
    const tbody = document.querySelector('#tableDescriptive tbody');
    tbody.innerHTML = '';

    const summaries = [];
    numCols.forEach(col => {
      const rawVals = rows.map(r => r[col]);
      const s = StatsEngine.summary(rawVals, col);
      if (s) {
        summaries.push(s);
        const tr = document.createElement('tr');
        if (col === selectedVar) {
          tr.style.backgroundColor = 'var(--primary-subtle)';
        }
        tr.innerHTML = `
          <td><strong>${s.colName}</strong></td>
          <td class="num">${s.n}</td>
          <td class="num">${s.mean.toFixed(4)}</td>
          <td class="num">${s.median.toFixed(4)}</td>
          <td class="num">${s.stdev.toFixed(4)}</td>
          <td class="num">${s.variance.toFixed(4)}</td>
          <td class="num">${s.se.toFixed(4)}</td>
          <td class="num">${s.min.toFixed(4)}</td>
          <td class="num">${s.q1.toFixed(4)}</td>
          <td class="num">${s.q3.toFixed(4)}</td>
          <td class="num">${s.max.toFixed(4)}</td>
          <td class="num">${s.iqr.toFixed(4)}</td>
          <td class="num">${s.skewness.toFixed(4)}</td>
          <td class="num">${s.kurtosis.toFixed(4)}</td>
          <td>
            <span class="badge-tag ${s.isNormal ? 'badge-security' : 'badge'}" style="${s.isNormal ? '' : 'background-color: var(--warning-subtle); color: var(--warning);'}">
              ${s.isNormal ? '정규분포 만족 (p≥0.05)' : '비정규분포 (p<0.05)'}
            </span>
          </td>
        `;
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => {
          document.getElementById('selectDescVariable').value = col;
          renderDescriptiveSelectedVar(col);
        });
        tbody.appendChild(tr);
      }
    });

    renderDescriptiveSelectedVar(selectedVar);

    // Boxplot for all numeric variables
    const boxDataArrays = numCols.map(col => rows.map(r => r[col]));
    ChartManager.renderBoxPlotChart('chartBoxPlot', numCols, boxDataArrays);
  }

  function renderDescriptiveSelectedVar(varName) {
    const rows = AppState.rawRows;
    const rawVals = rows.map(r => r[varName]);
    const summary = StatsEngine.summary(rawVals, varName);
    if (!summary) return;

    // Normality Banner update
    const normalityBanner = document.getElementById('normalityBanner');
    const normalityText = document.getElementById('normalityText');
    const normalStatus = summary.isNormal
      ? `<span style="color: var(--success); font-weight: bold;">정규성 만족 (p-value: ${summary.jbPValue.toFixed(4)})</span>`
      : `<span style="color: var(--warning); font-weight: bold;">비정규 분포 (p-value: ${summary.jbPValue.toFixed(4)})</span>`;

    normalityBanner.className = `insight-box ${summary.isNormal ? 'success' : 'warning'}`;
    normalityText.innerHTML = `
      <strong>[${varName}] 정규성 검정 (Jarque-Bera Test)</strong>: 
      JB 통계량 = <b>${summary.jarqueBera.toFixed(4)}</b>, 유의확률 p = <b>${summary.jbPValue.toFixed(4)}</b> → ${normalStatus}.
      <br/>왜도(Skewness)는 <b>${summary.skewness.toFixed(4)}</b>(${summary.skewness > 0 ? '우측 꼬리가 김' : '좌측 꼬리가 김'}), 
      첨도(Kurtosis)는 <b>${summary.kurtosis.toFixed(4)}</b>입니다.
    `;

    // Distribution Histogram + Fitted Normal Curve
    ChartManager.renderDistributionChart('chartDistribution', rawVals, varName);
  }

  // --- TAB 3: Correlation & Covariance ---
  function renderCorrelationTab() {
    const rows = AppState.rawRows;
    const numCols = AppState.numericCols;
    if (numCols.length === 0) return;

    // Calculate Correlation Matrix
    const matrix = [];
    for (let i = 0; i < numCols.length; i++) {
      matrix[i] = [];
      const colI = rows.map(r => r[numCols[i]]);
      for (let j = 0; j < numCols.length; j++) {
        if (i === j) {
          matrix[i][j] = 1.0;
        } else {
          const colJ = rows.map(r => r[numCols[j]]);
          const p = StatsEngine.pearson(colI, colJ);
          matrix[i][j] = p.r;
        }
      }
    }

    ChartManager.renderCorrelationHeatmap('chartCorrHeatmap', numCols, matrix, (var1, var2) => {
      document.getElementById('selectCorrVarX').value = var2;
      document.getElementById('selectCorrVarY').value = var1;
      updateScatterPlot();
    });

    updateScatterPlot();
  }

  function updateScatterPlot() {
    const rows = AppState.rawRows;
    const varX = document.getElementById('selectCorrVarX').value;
    const varY = document.getElementById('selectCorrVarY').value;
    if (!varX || !varY) return;

    const xVals = rows.map(r => r[varX]);
    const yVals = rows.map(r => r[varY]);

    const pearson = StatsEngine.pearson(xVals, yVals);
    const spearman = StatsEngine.spearman(xVals, yVals);
    const linReg = StatsEngine.linearRegression(xVals, yVals);

    const insightText = document.getElementById('corrInsightText');
    const pValFormatted = pearson.pValue < 0.001 ? '< 0.001' : pearson.pValue.toFixed(4);
    const isSignificant = pearson.pValue < 0.05;

    insightText.innerHTML = `
      <strong>${varX} ↔ ${varY} 상관분석 결과</strong>:<br/>
      • 피어슨 상관계수(r): <b>${pearson.r.toFixed(4)}</b> (${pearson.strength})<br/>
      • 스피어만 순위상관계수(ρ): <b>${spearman.rho.toFixed(4)}</b><br/>
      • 결정계수(R²): <b>${pearson.r2.toFixed(4)}</b> | 공분산: <b>${pearson.covariance.toFixed(4)}</b><br/>
      • 유의확률 (p-value): <b>${pValFormatted}</b> → ${isSignificant ? '<span style="color:var(--success); font-weight:bold;">유의수준 5%에서 두 변수 간 유의미한 상관관계가 확인되었습니다.</span>' : '<span style="color:var(--text-muted);">통계적으로 유의미하지 않은 무상관 관계입니다.</span>'}
    `;

    ChartManager.renderScatterRegressionChart('chartCorrScatter', xVals, yVals, varX, varY, linReg);
  }

  // --- TAB 4: Sensor Error & Paired t-Test ---
  function renderSensorErrorTab() {
    const rows = AppState.rawRows;
    const timeCol = AppState.timeCol;
    const varPred = document.getElementById('selectErrorVarPred').value;
    const varTrue = document.getElementById('selectErrorVarTrue').value;
    if (!varPred || !varTrue) return;

    const yPred = rows.map(r => Number(r[varPred]));
    const yTrue = rows.map(r => Number(r[varTrue]));
    const timeLabels = rows.map((r, i) => String(r[timeCol] || `#${i + 1}`));

    const res = StatsEngine.sensorErrorAnalysis(yPred, yTrue, varPred, varTrue);
    if (!res) return;

    // Update KPIs
    document.getElementById('statRmse').textContent = res.rmse.toFixed(4);
    document.getElementById('statMae').textContent = res.mae.toFixed(4);
    document.getElementById('statBias').textContent = (res.bias >= 0 ? '+' : '') + res.bias.toFixed(4);
    document.getElementById('statMaxError').textContent = res.maxError.toFixed(4);

    // Paired t-Test Banner
    const banner = document.getElementById('tTestResultBanner');
    const text = document.getElementById('tTestResultText');
    const pValFormatted = res.pValue < 0.001 ? '< 0.001' : res.pValue.toFixed(4);

    if (res.isSignificant) {
      banner.className = 'insight-box warning';
      text.innerHTML = `
        <strong>대응표본 t-검정 판정 (Paired Samples t-test)</strong>: 
        t-통계량 = <b>${res.tStat.toFixed(4)}</b>, 자유도(df) = <b>${res.df}</b>, p-value = <b>${pValFormatted}</b><br/>
        95% 신뢰구간 (CI): [<b>${res.ci95Lower.toFixed(4)}</b>, <b>${res.ci95Upper.toFixed(4)}</b>]<br/>
        🚨 <b>귀무가설 기각 (p < 0.05)</b>: 원시값과 참값 간에 <strong>통계적으로 유의미한 계측 차이(Bias)</strong>가 존재합니다. 센서 교정(Calibration) 또는 영점 조정이 권장됩니다.
      `;
    } else {
      banner.className = 'insight-box success';
      text.innerHTML = `
        <strong>대응표본 t-검정 판정 (Paired Samples t-test)</strong>: 
        t-통계량 = <b>${res.tStat.toFixed(4)}</b>, 자유도(df) = <b>${res.df}</b>, p-value = <b>${pValFormatted}</b><br/>
        95% 신뢰구간 (CI): [<b>${res.ci95Lower.toFixed(4)}</b>, <b>${res.ci95Upper.toFixed(4)}</b>]<br/>
        ✅ <b>귀무가설 채택 (p ≥ 0.05)</b>: 두 측정치 간의 오차는 통계적으로 무의미하며, <strong>센서의 측정 정밀도 및 기준 일치도가 매우 우수</strong>합니다.
      `;
    }

    // Charts
    ChartManager.renderSensorComparisonChart('chartErrorComparison', timeLabels, yPred, yTrue, varPred, varTrue);
    ChartManager.renderBlandAltmanChart('chartBlandAltman', res, varPred, varTrue);
  }

  // --- TAB 5: Regression Modeling ---
  let currentRegModelResult = null;

  function renderRegressionTab() {
    const rows = AppState.rawRows;
    const varX = document.getElementById('selectRegVarX').value;
    const varY = document.getElementById('selectRegVarY').value;
    const modelType = AppState.selectedRegModel;
    if (!varX || !varY) return;

    const xVals = rows.map(r => r[varX]);
    const yVals = rows.map(r => r[varY]);

    let model = null;
    if (modelType === 'poly2') {
      model = StatsEngine.polyRegressionDegree2(xVals, yVals);
    } else if (modelType === 'exponential') {
      model = StatsEngine.exponentialRegression(xVals, yVals);
    } else {
      model = StatsEngine.linearRegression(xVals, yVals);
    }
    currentRegModelResult = model;

    if (!model) {
      document.getElementById('regEquation').textContent = '적합 모델 생성 불가';
      document.getElementById('regR2').textContent = '--';
      return;
    }

    document.getElementById('regEquation').textContent = model.equation;
    document.getElementById('regR2').textContent = model.r2.toFixed(4);
    document.getElementById('regAdjR2').textContent = `수정 R²: ${model.adjR2.toFixed(4)}`;

    const pValFormatted = model.pValue !== undefined ? (model.pValue < 0.001 ? '< 0.001' : model.pValue.toFixed(4)) : 'N/A';
    document.getElementById('regPValue').textContent = pValFormatted;
    document.getElementById('regStdError').textContent = model.seRes ? model.seRes.toFixed(4) : '--';

    ChartManager.renderScatterRegressionChart('chartRegressionFit', xVals, yVals, varX, varY, model);

    // Update simulator label
    document.getElementById('lblSimInputX').textContent = `독립변수 [${varX}] 입력값:`;
  }

  function simulatePrediction() {
    if (!currentRegModelResult || !currentRegModelResult.predict) {
      showToast('활성화된 회귀 모델이 없습니다.', 'warning');
      return;
    }
    const inputVal = parseFloat(document.getElementById('inputSimX').value);
    if (isNaN(inputVal)) {
      showToast('유효한 숫자를 입력해 주세요.', 'warning');
      return;
    }
    const predY = currentRegModelResult.predict(inputVal);
    document.getElementById('simResultValue').textContent = predY.toFixed(4);
    document.getElementById('simResultFormula').textContent = `${currentRegModelResult.equation.replace(/x/g, `(${inputVal})`)} = ${predY.toFixed(4)}`;
  }

  // --- TAB 6: SPC & Outliers ---
  function renderOutliersTab() {
    const rows = AppState.rawRows;
    const timeCol = AppState.timeCol;
    const varName = document.getElementById('selectSpcVariable').value;
    const zThreshold = parseFloat(document.getElementById('selectZThreshold').value) || 2.5;
    if (!varName) return;

    const rawVals = rows.map(r => r[varName]);
    const timeLabels = rows.map((r, i) => String(r[timeCol] || `#${i + 1}`));

    const res = StatsEngine.detectOutliers(rawVals, 'all', { zThreshold });
    if (!res) return;

    // Summary banner
    const banner = document.getElementById('spcSummaryBanner');
    const text = document.getElementById('spcSummaryText');
    if (res.outliersCount > 0) {
      banner.className = 'insight-box danger';
      text.innerHTML = `
        <strong>공정 관리도 이상치 감지 경고</strong>:
        총 <b>${res.total}</b>건 중 <b>${res.outliersCount}건 (${res.outlierRatio.toFixed(1)}%)</b>의 이상치가 감지되었습니다.
        관리한계선(UCL: ${res.spc.ucl.toFixed(3)}, LCL: ${res.spc.lcl.toFixed(3)}) 또는 사분위 기준을 초과한 데이터 포인트를 확인하세요.
      `;
    } else {
      banner.className = 'insight-box success';
      text.innerHTML = `
        <strong>공정 관리 상태 양호</strong>:
        현재 <b>${varName}</b> 측정값은 모든 3-Sigma 관리한계선 및 IQR 범위 내에서 안정적으로 제어되고 있습니다. (감지된 이상치 0건)
      `;
    }

    // Outlier Table
    const tbody = document.querySelector('#tableOutliers tbody');
    tbody.innerHTML = '';
    if (res.outliers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">감지된 이상치가 없습니다. 모든 공정 지표가 정상 범위 내에 있습니다.</td></tr>';
    } else {
      res.outliers.forEach(ot => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>#${ot.index + 1}</strong></td>
          <td>${timeLabels[ot.index] || '--'}</td>
          <td class="num" style="color: var(--danger); font-weight: bold;">${ot.value.toFixed(4)}</td>
          <td class="num">${ot.zScore.toFixed(2)}</td>
          <td><span class="badge" style="background-color: var(--danger-subtle); color: var(--danger);">${ot.reasons.join(' / ')}</span></td>
        `;
        tbody.appendChild(tr);
      });
    }

    // Render Chart
    ChartManager.renderSpcControlChart('chartSpcControl', timeLabels, res, varName);
  }

  // --- TAB 7: Raw Data Browser ---
  function renderRawDataTab() {
    const headers = AppState.headers;
    const rows = AppState.rawRows;

    const thead = document.getElementById('tableRawHead');
    const tbody = document.getElementById('tableRawBody');

    // Headers
    thead.innerHTML = '<tr><th>#</th>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';

    // Body
    renderRawTableRows(rows);
  }

  function renderRawTableRows(rowsToRender) {
    const headers = AppState.headers;
    const tbody = document.getElementById('tableRawBody');
    tbody.innerHTML = '';

    rowsToRender.forEach((r, idx) => {
      const tr = document.createElement('tr');
      let cells = `<td>${idx + 1}</td>`;
      headers.forEach(h => {
        const val = r[h];
        const isNum = StatsEngine.isNumeric(val);
        const formatted = isNum ? Number(val).toFixed(4) : (val !== undefined ? val : '');
        cells += `<td class="${isNum ? 'num' : ''}">${formatted}</td>`;
      });
      tr.innerHTML = cells;
      tbody.appendChild(tr);
    });

    document.getElementById('tableFilterStatus').textContent = `전체 ${AppState.rawRows.length}행 중 ${rowsToRender.length}행 표시`;
  }

  // ==========================================
  // 5. Export Functions (CSV & Print)
  // ==========================================

  function exportTableToCsv(filename, headers, rows) {
    let csvContent = '\uFEFF'; // UTF-8 BOM for Excel Korean support
    csvContent += headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(',') + '\r\n';

    rows.forEach(r => {
      const line = headers.map(h => {
        const v = r[h] !== undefined && r[h] !== null ? r[h] : '';
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(',');
      csvContent += line + '\r\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`CSV 다운로드 완료: ${filename}`, 'success');
  }

  // ==========================================
  // 6. UI Events & Tab Switching
  // ==========================================

  function setupEventListeners() {
    // Navigation Tabs
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        const tabId = item.getAttribute('data-tab');
        AppState.activeTab = tabId;

        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        const activePane = document.getElementById(tabId);
        if (activePane) activePane.classList.add('active');

        // Resize charts inside active pane
        setTimeout(() => {
          ChartManager.resizeAll();
        }, 100);
      });
    });

    // Theme Toggle
    const btnThemeToggle = document.getElementById('btnThemeToggle');
    btnThemeToggle.addEventListener('click', () => {
      const html = document.documentElement;
      const current = html.getAttribute('data-theme') || 'light';
      const nextTheme = current === 'light' ? 'dark' : 'light';
      html.setAttribute('data-theme', nextTheme);
      ChartManager.setTheme(nextTheme);

      const icon = document.getElementById('themeIcon');
      if (nextTheme === 'dark') {
        icon.setAttribute('data-lucide', 'sun');
      } else {
        icon.setAttribute('data-lucide', 'moon');
      }
      if (window.lucide) lucide.createIcons();
      showToast(`${nextTheme === 'dark' ? '다크' : '라이트'} 모드로 전환되었습니다.`);
    });

    // File Upload Trigger
    const fileInput = document.getElementById('fileInput');
    const btnUpload = document.getElementById('btnUploadTrigger');
    const dropzone = document.getElementById('sidebarDropzone');

    btnUpload.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleExcelFile(e.target.files[0]);
      }
    });

    // Drag and Drop
    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-over');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
      }, false);
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files.length > 0) {
        handleExcelFile(files[0]);
      }
    });

    // Reset Data Button
    document.getElementById('btnResetData').addEventListener('click', () => {
      if (window.DEFAULT_DATASET) {
        loadDataset(
          window.DEFAULT_DATASET.fileName,
          window.DEFAULT_DATASET.sheetName,
          window.DEFAULT_DATASET.headers,
          window.DEFAULT_DATASET.data
        );
      }
    });

    // Print / PDF Button
    document.getElementById('btnPrintReport').addEventListener('click', () => {
      window.print();
    });

    // Quick Jump Buttons
    document.getElementById('btnJumpToErrorTab')?.addEventListener('click', () => {
      const errNav = document.querySelector('.nav-item[data-tab="tab-sensor-error"]');
      if (errNav) errNav.click();
    });

    document.getElementById('btnQuickReportGen')?.addEventListener('click', () => {
      showToast('종합 통계 진단이 완료되었습니다. 모든 탭에서 최신 결과가 갱신되었습니다.', 'success');
      runAllAnalyses();
    });

    // Dropdown Change Listeners
    document.getElementById('selectDescVariable').addEventListener('change', (e) => {
      renderDescriptiveSelectedVar(e.target.value);
    });

    document.getElementById('selectCorrVarX').addEventListener('change', updateScatterPlot);
    document.getElementById('selectCorrVarY').addEventListener('change', updateScatterPlot);

    document.getElementById('selectErrorVarPred').addEventListener('change', renderSensorErrorTab);
    document.getElementById('selectErrorVarTrue').addEventListener('change', renderSensorErrorTab);
    document.getElementById('btnRunErrorAnalysis').addEventListener('click', renderSensorErrorTab);

    document.getElementById('selectRegVarX').addEventListener('change', renderRegressionTab);
    document.getElementById('selectRegVarY').addEventListener('change', renderRegressionTab);

    // Regression Model Selector Pills
    document.querySelectorAll('#regModelSelector .pill-item').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('#regModelSelector .pill-item').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        AppState.selectedRegModel = pill.getAttribute('data-model');
        renderRegressionTab();
      });
    });

    // Simulator Button
    document.getElementById('btnSimulatePredict').addEventListener('click', simulatePrediction);
    document.getElementById('inputSimX').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') simulatePrediction();
    });

    // SPC Variable Selector & Threshold
    document.getElementById('selectSpcVariable').addEventListener('change', renderOutliersTab);
    document.getElementById('selectZThreshold').addEventListener('change', renderOutliersTab);

    // Raw Data Search Input
    document.getElementById('inputTableSearch').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) {
        renderRawTableRows(AppState.rawRows);
        return;
      }
      const filtered = AppState.rawRows.filter(r => {
        return Object.values(r).some(v => String(v).toLowerCase().includes(q));
      });
      renderRawTableRows(filtered);
    });

    // Export Buttons
    document.getElementById('btnExportRawCsv').addEventListener('click', () => {
      exportTableToCsv(`raw_data_${Date.now()}.csv`, AppState.headers, AppState.rawRows);
    });

    document.getElementById('btnExportStatsCsv').addEventListener('click', () => {
      const summaries = AppState.numericCols.map(c => StatsEngine.summary(AppState.rawRows.map(r => r[c]), c)).filter(Boolean);
      const statHeaders = ['변수명', '표본수(N)', '평균(Mean)', '중앙값(Median)', '표준편차(SD)', '분산(Var)', '최솟값(Min)', 'Q1(25%)', 'Q3(75%)', '최댓값(Max)', 'IQR', '왜도(Skewness)', '첨도(Kurtosis)', '정규성만족여부'];
      const statRows = summaries.map(s => ({
        '변수명': s.colName,
        '표본수(N)': s.n,
        '평균(Mean)': s.mean.toFixed(4),
        '중앙값(Median)': s.median.toFixed(4),
        '표준편차(SD)': s.stdev.toFixed(4),
        '분산(Var)': s.variance.toFixed(4),
        '최솟값(Min)': s.min.toFixed(4),
        'Q1(25%)': s.q1.toFixed(4),
        'Q3(75%)': s.q3.toFixed(4),
        '최댓값(Max)': s.max.toFixed(4),
        'IQR': s.iqr.toFixed(4),
        '왜도(Skewness)': s.skewness.toFixed(4),
        '첨도(Kurtosis)': s.kurtosis.toFixed(4),
        '정규성만족여부': s.isNormal ? 'Y' : 'N'
      }));
      exportTableToCsv(`descriptive_statistics_${Date.now()}.csv`, statHeaders, statRows);
    });

    // Sheet Selector change
    document.getElementById('sheetSelector').addEventListener('change', (e) => {
      if (!AppState.activeWorkbook) return;
      const sheetName = e.target.value;
      const sheet = AppState.activeWorkbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (jsonData.length > 0) {
        loadDataset(AppState.fileName, sheetName, Object.keys(jsonData[0]), jsonData);
      }
    });
  }

  // ==========================================
  // 7. App Initialization & Upfront CDN Loading Check
  // ==========================================

  function initApp() {
    // Upfront check of required CDN libraries
    const missing = [];
    if (!window.XLSX) missing.push('SheetJS (XLSX)');
    if (!window.echarts) missing.push('Apache ECharts');
    if (!window.lucide) missing.push('Lucide Icons');
    if (!window.StatsEngine) missing.push('StatsEngine');

    if (missing.length > 0) {
      console.warn('Waiting for external libraries to finish loading:', missing);
      setTimeout(initApp, 150);
      return;
    }

    // Render Lucide SVG icons
    lucide.createIcons();

    // Setup Event Listeners
    setupEventListeners();

    // Load Default Dataset
    if (window.DEFAULT_DATASET) {
      loadDataset(
        window.DEFAULT_DATASET.fileName,
        window.DEFAULT_DATASET.sheetName,
        window.DEFAULT_DATASET.headers,
        window.DEFAULT_DATASET.data
      );
    }

    // Hide Loading Overlay smoothly
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.classList.add('hidden');
      setTimeout(() => overlay.remove(), 450);
    }
  }

  // Launch when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})(window);
