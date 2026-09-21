/**
 * Interactive Visualizations Module using Apache ECharts
 * Manages responsive charts, dark/light themes, and statistical plots.
 */

(function (window) {
  'use strict';

  const ChartManager = {
    instances: {},
    currentTheme: 'light'
  };

  /**
   * Color palettes for charts
   */
  const PALETTES = {
    light: {
      bg: 'transparent',
      text: '#334155',
      subText: '#64748b',
      border: '#e2e8f0',
      grid: '#f1f5f9',
      tooltipBg: 'rgba(255, 255, 255, 0.95)',
      tooltipBorder: '#cbd5e1',
      primary: '#3b82f6',
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
      purple: '#8b5cf6',
      cyan: '#06b6d4',
      colors: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#6366f1']
    },
    dark: {
      bg: 'transparent',
      text: '#cbd5e1',
      subText: '#94a3b8',
      border: '#334155',
      grid: '#1e293b',
      tooltipBg: 'rgba(15, 23, 42, 0.95)',
      tooltipBorder: '#475569',
      primary: '#60a5fa',
      success: '#34d399',
      warning: '#fbbf24',
      danger: '#f87171',
      purple: '#a78bfa',
      cyan: '#22d3ee',
      colors: ['#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f87171', '#22d3ee', '#f472b6', '#818cf8']
    }
  };

  ChartManager.getColors = function () {
    return PALETTES[ChartManager.currentTheme] || PALETTES.light;
  };

  ChartManager.setTheme = function (theme) {
    ChartManager.currentTheme = theme;
    // Resize & re-apply theme on existing charts
    Object.keys(ChartManager.instances).forEach(id => {
      const chart = ChartManager.instances[id];
      if (chart && !chart.isDisposed()) {
        chart.resize();
      }
    });
  };

  ChartManager.getOrInit = function (domId) {
    const dom = document.getElementById(domId);
    if (!dom) return null;

    if (ChartManager.instances[domId]) {
      const existing = ChartManager.instances[domId];
      if (!existing.isDisposed()) {
        return existing;
      }
    }
    const chart = echarts.init(dom, ChartManager.currentTheme === 'dark' ? 'dark' : null, {
      renderer: 'canvas'
    });
    ChartManager.instances[domId] = chart;
    return chart;
  };

  ChartManager.resizeAll = function () {
    Object.keys(ChartManager.instances).forEach(id => {
      const chart = ChartManager.instances[id];
      if (chart && !chart.isDisposed()) {
        chart.resize();
      }
    });
  };

  window.addEventListener('resize', () => {
    ChartManager.resizeAll();
  });

  // ==========================================
  // 1. Multi Time-Series Overview Chart
  // ==========================================

  ChartManager.renderMultiTimeSeriesChart = function (domId, timeLabels, seriesList, title = '다변량 센서 시계열 트렌드') {
    const chart = ChartManager.getOrInit(domId);
    if (!chart) return;
    const c = ChartManager.getColors();

    const echartsSeries = seriesList.map((s, idx) => ({
      name: s.name,
      type: 'line',
      smooth: true,
      showSymbol: false,
      symbolSize: 6,
      data: s.data,
      itemStyle: { color: s.color || c.colors[idx % c.colors.length] },
      lineStyle: { width: 2 },
      emphasis: { focus: 'series' }
    }));

    const option = {
      backgroundColor: c.bg,
      title: {
        text: title,
        left: 10,
        top: 10,
        textStyle: { color: c.text, fontSize: 15, fontWeight: 600 }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: c.tooltipBg,
        borderColor: c.tooltipBorder,
        textStyle: { color: c.text },
        axisPointer: { type: 'cross', label: { backgroundColor: '#6a7985' } }
      },
      legend: {
        top: 10,
        right: 20,
        textStyle: { color: c.subText }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '16%',
        top: '18%',
        containLabel: true
      },
      toolbox: {
        right: 20,
        bottom: 5,
        feature: {
          dataZoom: { yAxisIndex: 'none' },
          restore: {},
          saveAsImage: { title: '이미지 저장' }
        },
        iconStyle: { borderColor: c.subText }
      },
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100
        },
        {
          type: 'slider',
          start: 0,
          end: 100,
          bottom: 10,
          height: 20,
          borderColor: c.border,
          textStyle: { color: c.subText }
        }
      ],
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: timeLabels,
        axisLine: { lineStyle: { color: c.border } },
        axisLabel: { color: c.subText, fontSize: 11 }
      },
      yAxis: {
        type: 'value',
        scale: true,
        splitLine: { lineStyle: { color: c.grid, type: 'dashed' } },
        axisLabel: { color: c.subText, fontSize: 11 }
      },
      series: echartsSeries
    };

    chart.setOption(option, true);
  };

  // ==========================================
  // 2. Distribution Histogram + Normal Curve
  // ==========================================

  ChartManager.renderDistributionChart = function (domId, rawValues, varName, binCount = 12) {
    const chart = ChartManager.getOrInit(domId);
    if (!chart) return;
    const c = ChartManager.getColors();

    const clean = StatsEngine.extractCleanNumbers(rawValues);
    if (clean.length === 0) return;

    const min = Math.min(...clean);
    const max = Math.max(...clean);
    const mean = StatsEngine.mean(clean);
    const sd = StatsEngine.stdev(clean, true);
    const median = StatsEngine.median(clean);

    const binWidth = (max - min) / binCount || 1;
    const bins = new Array(binCount).fill(0);
    const binLabels = [];

    for (let i = 0; i < binCount; i++) {
      const bMin = min + i * binWidth;
      const bMax = bMin + binWidth;
      binLabels.push(`${bMin.toFixed(2)} ~ ${bMax.toFixed(2)}`);
    }

    clean.forEach(val => {
      let bIdx = Math.floor((val - min) / binWidth);
      if (bIdx >= binCount) bIdx = binCount - 1;
      if (bIdx < 0) bIdx = 0;
      bins[bIdx]++;
    });

    // Generate theoretical Normal distribution curve points
    const normCurve = [];
    for (let i = 0; i < binCount; i++) {
      const mid = min + (i + 0.5) * binWidth;
      let density = 0;
      if (sd > 0) {
        density = (1 / (sd * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((mid - mean) / sd, 2));
      }
      // scale density to expected frequency: density * binWidth * N
      const expectedCount = density * binWidth * clean.length;
      normCurve.push(Number(expectedCount.toFixed(2)));
    }

    const option = {
      backgroundColor: c.bg,
      title: {
        text: `${varName} 데이터 분포 및 정규분포 적합곡선`,
        left: 10,
        top: 10,
        textStyle: { color: c.text, fontSize: 14, fontWeight: 600 }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: c.tooltipBg,
        borderColor: c.tooltipBorder,
        textStyle: { color: c.text }
      },
      legend: {
        top: 10,
        right: 20,
        textStyle: { color: c.subText }
      },
      grid: {
        left: '4%',
        right: '4%',
        bottom: '12%',
        top: '18%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: binLabels,
        axisLine: { lineStyle: { color: c.border } },
        axisLabel: { color: c.subText, fontSize: 10, rotate: 25 }
      },
      yAxis: {
        type: 'value',
        name: '빈도수(Count)',
        nameTextStyle: { color: c.subText, fontSize: 11 },
        splitLine: { lineStyle: { color: c.grid, type: 'dashed' } },
        axisLabel: { color: c.subText, fontSize: 11 }
      },
      series: [
        {
          name: '실제 빈도',
          type: 'bar',
          data: bins,
          barMaxWidth: 40,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: c.primary },
              { offset: 1, color: 'rgba(59, 130, 246, 0.4)' }
            ]),
            borderRadius: [4, 4, 0, 0]
          },
          markLine: {
            data: [
              {
                name: '평균',
                xAxis: Math.min(binCount - 1, Math.max(0, Math.floor((mean - min) / binWidth))),
                lineStyle: { color: c.danger, width: 2, type: 'solid' },
                label: { formatter: `평균: ${mean.toFixed(2)}`, color: c.danger }
              },
              {
                name: '중앙값',
                xAxis: Math.min(binCount - 1, Math.max(0, Math.floor((median - min) / binWidth))),
                lineStyle: { color: c.success, width: 2, type: 'dashed' },
                label: { formatter: `중앙값: ${median.toFixed(2)}`, color: c.success }
              }
            ]
          }
        },
        {
          name: '정규분포 곡선(Theoretical)',
          type: 'line',
          smooth: true,
          data: normCurve,
          itemStyle: { color: c.warning },
          lineStyle: { width: 3, type: 'solid' }
        }
      ]
    };

    chart.setOption(option, true);
  };

  // ==========================================
  // 3. Box & Whisker Plot
  // ==========================================

  ChartManager.renderBoxPlotChart = function (domId, varNames, dataArrays) {
    const chart = ChartManager.getOrInit(domId);
    if (!chart) return;
    const c = ChartManager.getColors();

    const boxData = [];
    const outlierData = [];

    varNames.forEach((name, idx) => {
      const arr = StatsEngine.extractCleanNumbers(dataArrays[idx]);
      if (arr.length < 4) return;
      const sorted = [...arr].sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const { q1, q2, q3, iqr } = StatsEngine.quartiles(sorted);
      
      const lowerFence = Math.max(min, q1 - 1.5 * iqr);
      const upperFence = Math.min(max, q3 + 1.5 * iqr);

      // ECharts boxplot format: [min, Q1, median, Q3, max]
      boxData.push([lowerFence, q1, q2, q3, upperFence]);

      // Outliers
      sorted.forEach(val => {
        if (val < lowerFence || val > upperFence) {
          outlierData.push([idx, val]);
        }
      });
    });

    const option = {
      backgroundColor: c.bg,
      title: {
        text: '수치형 변수 상자수염도 (Box Plot)',
        left: 10,
        top: 10,
        textStyle: { color: c.text, fontSize: 14, fontWeight: 600 }
      },
      tooltip: {
        trigger: 'item',
        axisPointer: { type: 'shadow' },
        backgroundColor: c.tooltipBg,
        borderColor: c.tooltipBorder,
        textStyle: { color: c.text }
      },
      grid: {
        left: '5%',
        right: '5%',
        bottom: '12%',
        top: '18%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: varNames,
        axisLine: { lineStyle: { color: c.border } },
        axisLabel: { color: c.subText, fontSize: 11 }
      },
      yAxis: {
        type: 'value',
        scale: true,
        splitLine: { lineStyle: { color: c.grid, type: 'dashed' } },
        axisLabel: { color: c.subText, fontSize: 11 }
      },
      series: [
        {
          name: 'Boxplot',
          type: 'boxplot',
          data: boxData,
          itemStyle: {
            color: 'rgba(59, 130, 246, 0.25)',
            borderColor: c.primary,
            borderWidth: 2
          },
          tooltip: {
            formatter: function (param) {
              return [
                `<b>${param.name}</b>`,
                `최댓값(Upper Fence): ${param.data[5]?.toFixed(4)}`,
                `Q3 (75%): ${param.data[4]?.toFixed(4)}`,
                `중앙값 (Median): ${param.data[3]?.toFixed(4)}`,
                `Q1 (25%): ${param.data[2]?.toFixed(4)}`,
                `최솟값(Lower Fence): ${param.data[1]?.toFixed(4)}`
              ].join('<br/>');
            }
          }
        },
        {
          name: '이상치(Outlier)',
          type: 'scatter',
          data: outlierData,
          itemStyle: { color: c.danger },
          symbolSize: 8,
          tooltip: {
            formatter: function (param) {
              return `이상치: ${param.data[1]?.toFixed(4)}`;
            }
          }
        }
      ]
    };

    chart.setOption(option, true);
  };

  // ==========================================
  // 4. Correlation Heatmap
  // ==========================================

  ChartManager.renderCorrelationHeatmap = function (domId, colNames, matrix, onCellClick) {
    const chart = ChartManager.getOrInit(domId);
    if (!chart) return;
    const c = ChartManager.getColors();

    const data = [];
    for (let i = 0; i < colNames.length; i++) {
      for (let j = 0; j < colNames.length; j++) {
        const val = Number(matrix[i][j].toFixed(3));
        data.push([j, i, val]);
      }
    }

    const option = {
      backgroundColor: c.bg,
      title: {
        text: '변수 간 상관관계 매트릭스 히트맵 (Pearson Correlation)',
        left: 10,
        top: 10,
        textStyle: { color: c.text, fontSize: 14, fontWeight: 600 }
      },
      tooltip: {
        position: 'top',
        backgroundColor: c.tooltipBg,
        borderColor: c.tooltipBorder,
        textStyle: { color: c.text },
        formatter: function (p) {
          const xName = colNames[p.data[0]];
          const yName = colNames[p.data[1]];
          const r = p.data[2];
          return `<b>${yName}</b> ↔ <b>${xName}</b><br/>상관계수 (r): <b>${r}</b>`;
        }
      },
      grid: {
        left: '10%',
        right: '12%',
        top: '18%',
        bottom: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: colNames,
        splitArea: { show: true },
        axisLabel: { color: c.subText, fontSize: 10, rotate: 30 }
      },
      yAxis: {
        type: 'category',
        data: colNames,
        splitArea: { show: true },
        axisLabel: { color: c.subText, fontSize: 10 }
      },
      visualMap: {
        min: -1,
        max: 1,
        calculable: true,
        orient: 'vertical',
        right: 15,
        top: 'center',
        inRange: {
          color: ['#ef4444', '#f8fafc', '#3b82f6'] // Red (-1) -> White (0) -> Blue (+1)
        },
        textStyle: { color: c.subText }
      },
      series: [
        {
          name: 'Correlation',
          type: 'heatmap',
          data: data,
          label: {
            show: true,
            color: '#1e293b',
            fontSize: 10,
            formatter: p => p.data[2].toFixed(2)
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          }
        }
      ]
    };

    chart.setOption(option, true);

    if (onCellClick) {
      chart.off('click');
      chart.on('click', function (params) {
        if (params.componentType === 'series') {
          const var1 = colNames[params.data[1]];
          const var2 = colNames[params.data[0]];
          onCellClick(var1, var2);
        }
      });
    }
  };

  // ==========================================
  // 5. Scatter Plot with Regression Curve
  // ==========================================

  ChartManager.renderScatterRegressionChart = function (domId, xVals, yVals, xName, yName, regModel) {
    const chart = ChartManager.getOrInit(domId);
    if (!chart) return;
    const c = ChartManager.getColors();

    const points = [];
    const minLen = Math.min(xVals.length, yVals.length);
    for (let i = 0; i < minLen; i++) {
      const x = Number(xVals[i]);
      const y = Number(yVals[i]);
      if (!isNaN(x) && !isNaN(y) && isFinite(x) && isFinite(y)) {
        points.push([x, y]);
      }
    }

    // Sort X to generate smooth regression line
    const cleanXs = points.map(p => p[0]).sort((a, b) => a - b);
    const minX = cleanXs[0];
    const maxX = cleanXs[cleanXs.length - 1];

    const regPoints = [];
    if (regModel && regModel.predict) {
      const step = (maxX - minX) / 50 || 1;
      for (let x = minX; x <= maxX; x += step) {
        regPoints.push([Number(x.toFixed(4)), Number(regModel.predict(x).toFixed(4))]);
      }
      regPoints.push([maxX, Number(regModel.predict(maxX).toFixed(4))]);
    }

    const option = {
      backgroundColor: c.bg,
      title: {
        text: `${yName} vs ${xName} 산점도 및 회귀선`,
        subtext: regModel ? `${regModel.equation} (R² = ${regModel.r2.toFixed(4)})` : '',
        left: 10,
        top: 10,
        textStyle: { color: c.text, fontSize: 14, fontWeight: 600 },
        subtextStyle: { color: c.primary, fontSize: 12, fontWeight: 'bold' }
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: c.tooltipBg,
        borderColor: c.tooltipBorder,
        textStyle: { color: c.text },
        formatter: function (p) {
          if (p.seriesName === '회귀선') {
            return `회귀 예측치<br/>X: ${p.data[0]}<br/>Ŷ: ${p.data[1]}`;
          }
          return `측정값 #${p.dataIndex + 1}<br/>${xName}: ${p.data[0]}<br/>${yName}: ${p.data[1]}`;
        }
      },
      legend: {
        top: 10,
        right: 20,
        textStyle: { color: c.subText }
      },
      grid: {
        left: '4%',
        right: '4%',
        bottom: '12%',
        top: '20%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        name: xName,
        nameTextStyle: { color: c.subText, fontSize: 11 },
        scale: true,
        splitLine: { lineStyle: { color: c.grid, type: 'dashed' } },
        axisLabel: { color: c.subText, fontSize: 11 }
      },
      yAxis: {
        type: 'value',
        name: yName,
        nameTextStyle: { color: c.subText, fontSize: 11 },
        scale: true,
        splitLine: { lineStyle: { color: c.grid, type: 'dashed' } },
        axisLabel: { color: c.subText, fontSize: 11 }
      },
      series: [
        {
          name: '데이터 포인트',
          type: 'scatter',
          data: points,
          itemStyle: { color: c.primary, opacity: 0.8 },
          symbolSize: 8
        },
        {
          name: '회귀선',
          type: 'line',
          showSymbol: false,
          smooth: true,
          data: regPoints,
          lineStyle: { color: c.danger, width: 2.5 },
          itemStyle: { color: c.danger }
        }
      ]
    };

    chart.setOption(option, true);
  };

  // ==========================================
  // 6. Sensor Error Comparison Chart (Dual Line + Diff)
  // ==========================================

  ChartManager.renderSensorComparisonChart = function (domId, timeLabels, yPred, yTrue, labelPred = '원시값', labelTrue = '참값') {
    const chart = ChartManager.getOrInit(domId);
    if (!chart) return;
    const c = ChartManager.getColors();

    const diffs = yPred.map((v, i) => Number((v - yTrue[i]).toFixed(4)));

    const option = {
      backgroundColor: c.bg,
      title: {
        text: `${labelPred} vs ${labelTrue} 추세 및 오차(잔차)`,
        left: 10,
        top: 10,
        textStyle: { color: c.text, fontSize: 14, fontWeight: 600 }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: c.tooltipBg,
        borderColor: c.tooltipBorder,
        textStyle: { color: c.text }
      },
      legend: {
        top: 10,
        right: 20,
        textStyle: { color: c.subText }
      },
      grid: {
        left: '4%',
        right: '5%',
        bottom: '14%',
        top: '20%',
        containLabel: true
      },
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        { type: 'slider', start: 0, end: 100, height: 18, bottom: 5 }
      ],
      xAxis: {
        type: 'category',
        data: timeLabels,
        axisLine: { lineStyle: { color: c.border } },
        axisLabel: { color: c.subText, fontSize: 10 }
      },
      yAxis: [
        {
          type: 'value',
          name: '측정값',
          scale: true,
          splitLine: { lineStyle: { color: c.grid, type: 'dashed' } },
          axisLabel: { color: c.subText, fontSize: 11 }
        },
        {
          type: 'value',
          name: '오차(원시값-참값)',
          splitLine: { show: false },
          axisLabel: { color: c.subText, fontSize: 11 }
        }
      ],
      series: [
        {
          name: labelPred,
          type: 'line',
          smooth: true,
          data: yPred,
          itemStyle: { color: c.primary },
          lineStyle: { width: 2 }
        },
        {
          name: labelTrue,
          type: 'line',
          smooth: true,
          data: yTrue,
          itemStyle: { color: c.success },
          lineStyle: { width: 2, type: 'dashed' }
        },
        {
          name: '오차 (잔차)',
          type: 'bar',
          yAxisIndex: 1,
          data: diffs,
          itemStyle: {
            color: function (params) {
              return params.value >= 0 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(59, 130, 246, 0.4)';
            }
          }
        }
      ]
    };

    chart.setOption(option, true);
  };

  // ==========================================
  // 7. Bland-Altman Plot
  // ==========================================

  ChartManager.renderBlandAltmanChart = function (domId, baResult, labelPred = '원시값', labelTrue = '참값') {
    const chart = ChartManager.getOrInit(domId);
    if (!chart || !baResult) return;
    const c = ChartManager.getColors();

    const points = baResult.baMeans.map((m, i) => [Number(m.toFixed(4)), Number(baResult.baDiffs[i].toFixed(4))]);

    const option = {
      backgroundColor: c.bg,
      title: {
        text: 'Bland-Altman 일치도 분석 (Difference vs Mean)',
        subtext: `일치한계선(LoA): [${baResult.lowerLoA.toFixed(3)}, ${baResult.upperLoA.toFixed(3)}] / 평균 편향(Bias): ${baResult.bias.toFixed(3)}`,
        left: 10,
        top: 10,
        textStyle: { color: c.text, fontSize: 14, fontWeight: 600 },
        subtextStyle: { color: c.subText, fontSize: 11 }
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: c.tooltipBg,
        borderColor: c.tooltipBorder,
        textStyle: { color: c.text },
        formatter: function (p) {
          return `평균값: ${p.data[0]}<br/>차이 (${labelPred} - ${labelTrue}): ${p.data[1]}`;
        }
      },
      grid: {
        left: '5%',
        right: '12%',
        bottom: '12%',
        top: '22%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        name: `평균 (${labelPred} + ${labelTrue}) / 2`,
        scale: true,
        splitLine: { lineStyle: { color: c.grid, type: 'dashed' } },
        axisLabel: { color: c.subText, fontSize: 11 }
      },
      yAxis: {
        type: 'value',
        name: `차이 (${labelPred} - ${labelTrue})`,
        scale: true,
        splitLine: { lineStyle: { color: c.grid, type: 'dashed' } },
        axisLabel: { color: c.subText, fontSize: 11 }
      },
      series: [
        {
          name: '측정치',
          type: 'scatter',
          data: points,
          symbolSize: 8,
          itemStyle: {
            color: function (params) {
              const diff = params.data[1];
              return diff > baResult.upperLoA || diff < baResult.lowerLoA ? c.danger : c.primary;
            }
          },
          markLine: {
            silent: false,
            data: [
              {
                yAxis: baResult.bias,
                lineStyle: { color: c.primary, width: 2, type: 'solid' },
                label: { formatter: `Mean Bias: ${baResult.bias.toFixed(3)}`, position: 'end', color: c.primary }
              },
              {
                yAxis: baResult.upperLoA,
                lineStyle: { color: c.danger, width: 2, type: 'dashed' },
                label: { formatter: `+1.96 SD: ${baResult.upperLoA.toFixed(3)}`, position: 'end', color: c.danger }
              },
              {
                yAxis: baResult.lowerLoA,
                lineStyle: { color: c.danger, width: 2, type: 'dashed' },
                label: { formatter: `-1.96 SD: ${baResult.lowerLoA.toFixed(3)}`, position: 'end', color: c.danger }
              },
              {
                yAxis: 0,
                lineStyle: { color: c.subText, width: 1, type: 'dotted' },
                label: { formatter: 'Line of Equality (0)', position: 'start', color: c.subText }
              }
            ]
          }
        }
      ]
    };

    chart.setOption(option, true);
  };

  // ==========================================
  // 8. SPC Shewhart Control Chart
  // ==========================================

  ChartManager.renderSpcControlChart = function (domId, timeLabels, spcResult, varName) {
    const chart = ChartManager.getOrInit(domId);
    if (!chart || !spcResult) return;
    const c = ChartManager.getColors();

    const dataPoints = spcResult.items.map(it => it.value);
    const ucl = spcResult.spc.ucl;
    const cl = spcResult.spc.cl;
    const lcl = spcResult.spc.lcl;

    const normalData = [];
    const outlierData = [];

    spcResult.items.forEach((it, idx) => {
      if (it.isOutlier) {
        outlierData.push([idx, it.value, it.reasons.join(', ')]);
      } else {
        normalData.push([idx, it.value]);
      }
    });

    const option = {
      backgroundColor: c.bg,
      title: {
        text: `${varName} Shewhart 관리도 (3-Sigma Control Chart)`,
        subtext: `UCL: ${ucl.toFixed(3)} | CL(Mean): ${cl.toFixed(3)} | LCL: ${lcl.toFixed(3)} | 감지된 이상치: ${spcResult.outliersCount}건`,
        left: 10,
        top: 10,
        textStyle: { color: c.text, fontSize: 14, fontWeight: 600 },
        subtextStyle: { color: spcResult.outliersCount > 0 ? c.danger : c.success, fontSize: 12, fontWeight: 'bold' }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: c.tooltipBg,
        borderColor: c.tooltipBorder,
        textStyle: { color: c.text },
        formatter: function (params) {
          const idx = params[0].dataIndex;
          const time = timeLabels[idx] || `#${idx + 1}`;
          const val = dataPoints[idx];
          const item = spcResult.items[idx];
          let html = `<b>${time}</b><br/>측정값: <b>${val}</b>`;
          if (item.isOutlier) {
            html += `<br/><span style="color:${c.danger}">🚨 이상치 경고: ${item.reasons.join(', ')}</span>`;
          }
          return html;
        }
      },
      legend: {
        top: 10,
        right: 20,
        textStyle: { color: c.subText }
      },
      grid: {
        left: '4%',
        right: '10%',
        bottom: '14%',
        top: '22%',
        containLabel: true
      },
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        { type: 'slider', start: 0, end: 100, height: 18, bottom: 5 }
      ],
      xAxis: {
        type: 'category',
        data: timeLabels,
        axisLine: { lineStyle: { color: c.border } },
        axisLabel: { color: c.subText, fontSize: 10 }
      },
      yAxis: {
        type: 'value',
        scale: true,
        splitLine: { lineStyle: { color: c.grid, type: 'dashed' } },
        axisLabel: { color: c.subText, fontSize: 11 }
      },
      series: [
        {
          name: '측정 추세',
          type: 'line',
          data: dataPoints,
          lineStyle: { color: c.primary, width: 2 },
          itemStyle: { color: c.primary },
          markLine: {
            silent: true,
            data: [
              {
                yAxis: ucl,
                lineStyle: { color: c.danger, width: 2, type: 'dashed' },
                label: { formatter: `UCL (+3σ): ${ucl.toFixed(2)}`, position: 'end', color: c.danger }
              },
              {
                yAxis: cl,
                lineStyle: { color: c.success, width: 2, type: 'solid' },
                label: { formatter: `CL (Mean): ${cl.toFixed(2)}`, position: 'end', color: c.success }
              },
              {
                yAxis: lcl,
                lineStyle: { color: c.danger, width: 2, type: 'dashed' },
                label: { formatter: `LCL (-3σ): ${lcl.toFixed(2)}`, position: 'end', color: c.danger }
              }
            ]
          }
        },
        {
          name: '이상치(Outlier)',
          type: 'scatter',
          data: outlierData,
          symbolSize: 12,
          itemStyle: {
            color: c.danger,
            borderColor: '#fff',
            borderWidth: 2
          },
          emphasis: {
            scale: 1.5
          }
        }
      ]
    };

    chart.setOption(option, true);
  };

  window.ChartManager = ChartManager;
})(window);
