/**
 * Comprehensive Statistical Analysis Engine
 * 100% Client-side execution in JavaScript.
 * Provides Descriptive Statistics, Normality Tests, Correlation,
 * Sensor Error Metrics, Paired/Independent t-Tests, Regression Models,
 * Bland-Altman analysis, and SPC Outlier Detection.
 */

(function (window) {
  'use strict';

  const StatsEngine = {};

  // ==========================================
  // 1. Math & Distribution Helper Functions
  // ==========================================

  /**
   * Polynomial approximation of Error Function erf(x)
   */
  function erf(x) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
    return sign * y;
  }

  /**
   * Standard Normal CDF (Φ(z))
   */
  StatsEngine.normalCDF = function (z) {
    return 0.5 * (1 + erf(z / Math.SQRT2));
  };

  /**
   * Incomplete Beta function continued fraction approximation
   */
  function betacf(a, b, x) {
    const MAXIT = 100;
    const EPS = 3.0e-7;
    const FPMIN = 1.0e-30;

    let qab = a + b;
    let qap = a + 1.0;
    let qam = a - 1.0;
    let c = 1.0;
    let d = 1.0 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1.0 / d;
    let h = d;

    for (let m = 1; m <= MAXIT; m++) {
      let m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1.0 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1.0 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1.0 / d;
      h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1.0 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1.0 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1.0 / d;
      let del = d * c;
      h *= del;
      if (Math.abs(del - 1.0) < EPS) break;
    }
    return h;
  }

  function logGamma(x) {
    const cof = [
      76.18009172947146, -86.50532032941677,
      24.01409824083091, -1.231739572450155,
      0.1208650973866179e-2, -0.5395239384953e-5
    ];
    let y = x;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) {
      ser += cof[j] / ++y;
    }
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  function incBeta(a, b, x) {
    if (x < 0.0 || x > 1.0) return 0;
    if (x === 0.0) return 0;
    if (x === 1.0) return 1;

    let bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1.0 - x));
    if (x < (a + 1.0) / (a + b + 2.0)) {
      return bt * betacf(a, b, x) / a;
    } else {
      return 1.0 - bt * betacf(b, a, 1.0 - x) / b;
    }
  }

  /**
   * Two-tailed Student's t-distribution p-value for given |t| and degrees of freedom df
   */
  StatsEngine.tPValue = function (t, df) {
    if (isNaN(t) || isNaN(df) || df <= 0) return 1.0;
    const absT = Math.abs(t);
    const x = df / (df + absT * absT);
    const p = incBeta(0.5 * df, 0.5, x);
    return Math.max(0, Math.min(1, p));
  };

  /**
   * Approximate inverse Student's t critical value for two-tailed alpha=0.05
   */
  StatsEngine.tCrit05 = function (df) {
    if (df <= 0) return 1.96;
    if (df >= 120) return 1.96;
    // Common critical values table with linear interpolation
    const table = {
      1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
      6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
      15: 2.131, 20: 2.086, 25: 2.060, 30: 2.042, 40: 2.021,
      60: 2.000, 100: 1.984
    };
    if (table[df]) return table[df];
    const keys = Object.keys(table).map(Number).sort((a,b)=>a-b);
    for (let i = 0; i < keys.length - 1; i++) {
      if (df > keys[i] && df < keys[i+1]) {
        const r = (df - keys[i]) / (keys[i+1] - keys[i]);
        return table[keys[i]] + r * (table[keys[i+1]] - table[keys[i]]);
      }
    }
    return 1.96;
  };

  /**
   * Chi-Square survival function (p-value) for 2 degrees of freedom (e.g. Jarque-Bera)
   */
  StatsEngine.chi2PValueDf2 = function (chi2) {
    if (chi2 < 0) return 1.0;
    return Math.exp(-chi2 / 2.0);
  };

  // ==========================================
  // 2. Data Cleaning & Type Helpers
  // ==========================================

  StatsEngine.isNumeric = function (val) {
    if (val === null || val === undefined || val === '') return false;
    return !isNaN(Number(val));
  };

  StatsEngine.extractCleanNumbers = function (arr) {
    const res = [];
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (v !== null && v !== undefined && v !== '') {
        const num = Number(v);
        if (!isNaN(num) && isFinite(num)) {
          res.push(num);
        }
      }
    }
    return res;
  };

  // ==========================================
  // 3. Descriptive Statistics
  // ==========================================

  StatsEngine.mean = function (arr) {
    if (!arr || arr.length === 0) return 0;
    const sum = arr.reduce((acc, v) => acc + v, 0);
    return sum / arr.length;
  };

  StatsEngine.sum = function (arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((acc, v) => acc + v, 0);
  };

  StatsEngine.variance = function (arr, isSample = true) {
    if (!arr || arr.length < 2) return 0;
    const m = StatsEngine.mean(arr);
    const ss = arr.reduce((acc, v) => acc + Math.pow(v - m, 2), 0);
    return ss / (arr.length - (isSample ? 1 : 0));
  };

  StatsEngine.stdev = function (arr, isSample = true) {
    return Math.sqrt(StatsEngine.variance(arr, isSample));
  };

  StatsEngine.median = function (arr) {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  StatsEngine.mode = function (arr) {
    if (!arr || arr.length === 0) return [];
    const counts = {};
    let maxCount = 0;
    for (const v of arr) {
      const rounded = Number(v.toFixed(4));
      counts[rounded] = (counts[rounded] || 0) + 1;
      if (counts[rounded] > maxCount) {
        maxCount = counts[rounded];
      }
    }
    if (maxCount <= 1) return []; // all unique
    return Object.keys(counts).filter(k => counts[k] === maxCount).map(Number);
  };

  StatsEngine.quartiles = function (arr) {
    if (!arr || arr.length === 0) return { q1: 0, q2: 0, q3: 0, iqr: 0 };
    const sorted = [...arr].sort((a, b) => a - b);
    const n = sorted.length;
    
    function percentile(p) {
      const pos = (n - 1) * p;
      const base = Math.floor(pos);
      const rest = pos - base;
      if (sorted[base + 1] !== undefined) {
        return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
      } else {
        return sorted[base];
      }
    }

    const q1 = percentile(0.25);
    const q2 = percentile(0.50);
    const q3 = percentile(0.75);
    const iqr = q3 - q1;
    return { q1, q2, q3, iqr };
  };

  StatsEngine.skewness = function (arr) {
    const n = arr.length;
    if (n < 3) return 0;
    const m = StatsEngine.mean(arr);
    const s = StatsEngine.stdev(arr, true);
    if (s === 0) return 0;
    const m3 = arr.reduce((acc, v) => acc + Math.pow((v - m) / s, 3), 0);
    return (n / ((n - 1) * (n - 2))) * m3;
  };

  StatsEngine.kurtosis = function (arr) {
    const n = arr.length;
    if (n < 4) return 0;
    const m = StatsEngine.mean(arr);
    const s = StatsEngine.stdev(arr, true);
    if (s === 0) return 0;
    const m4 = arr.reduce((acc, v) => acc + Math.pow((v - m) / s, 4), 0);
    const c1 = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3));
    const c2 = (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
    return c1 * m4 - c2; // Excess Kurtosis (0 for standard normal)
  };

  /**
   * Complete Descriptive Summary of a numeric array
   */
  StatsEngine.summary = function (rawArr, colName = 'Variable') {
    const arr = StatsEngine.extractCleanNumbers(rawArr);
    const n = arr.length;
    if (n === 0) return null;

    const sorted = [...arr].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[n - 1];
    const range = max - min;
    const mean = StatsEngine.mean(arr);
    const median = StatsEngine.median(arr);
    const variance = StatsEngine.variance(arr, true);
    const stdev = Math.sqrt(variance);
    const se = n > 1 ? stdev / Math.sqrt(n) : 0;
    const { q1, q2, q3, iqr } = StatsEngine.quartiles(arr);
    const skew = StatsEngine.skewness(arr);
    const kurt = StatsEngine.kurtosis(arr);
    const modes = StatsEngine.mode(arr);

    // Jarque-Bera Normality Test
    const jb = (n / 6.0) * (Math.pow(skew, 2) + Math.pow(kurt, 2) / 4.0);
    const jbPValue = StatsEngine.chi2PValueDf2(jb);
    const isNormal = jbPValue >= 0.05;

    return {
      colName,
      n,
      mean,
      median,
      modes,
      stdev,
      variance,
      se,
      min,
      q1,
      q2,
      q3,
      max,
      range,
      iqr,
      skewness: skew,
      kurtosis: kurt,
      jarqueBera: jb,
      jbPValue,
      isNormal
    };
  };

  // ==========================================
  // 4. Correlation & Covariance Matrix
  // ==========================================

  StatsEngine.covariance = function (arr1, arr2) {
    const n = Math.min(arr1.length, arr2.length);
    if (n < 2) return 0;
    const m1 = StatsEngine.mean(arr1.slice(0, n));
    const m2 = StatsEngine.mean(arr2.slice(0, n));
    let cov = 0;
    for (let i = 0; i < n; i++) {
      cov += (arr1[i] - m1) * (arr2[i] - m2);
    }
    return cov / (n - 1);
  };

  StatsEngine.pearson = function (arr1, arr2) {
    const pairs = [];
    const minLen = Math.min(arr1.length, arr2.length);
    for (let i = 0; i < minLen; i++) {
      const v1 = Number(arr1[i]);
      const v2 = Number(arr2[i]);
      if (!isNaN(v1) && !isNaN(v2) && isFinite(v1) && isFinite(v2)) {
        pairs.push([v1, v2]);
      }
    }
    const n = pairs.length;
    if (n < 3) return { r: 0, r2: 0, t: 0, pValue: 1, df: 0, strength: '데이터 부족' };

    const x = pairs.map(p => p[0]);
    const y = pairs.map(p => p[1]);
    const cov = StatsEngine.covariance(x, y);
    const sx = StatsEngine.stdev(x, true);
    const sy = StatsEngine.stdev(y, true);

    if (sx === 0 || sy === 0) {
      return { r: 0, r2: 0, t: 0, pValue: 1, df: n - 2, strength: '변동 없음 (표준편차 0)' };
    }

    const r = Math.max(-1, Math.min(1, cov / (sx * sy)));
    const r2 = r * r;
    const df = n - 2;
    const t = Math.abs(r) === 1 ? Infinity : (r * Math.sqrt(df)) / Math.sqrt(Math.max(1e-12, 1 - r2));
    const pValue = Math.abs(r) === 1 ? 0 : StatsEngine.tPValue(t, df);

    let strength = '무상관';
    const absR = Math.abs(r);
    if (absR >= 0.8) strength = r > 0 ? '매우 강한 양의 상관' : '매우 강한 음의 상관';
    else if (absR >= 0.6) strength = r > 0 ? '강한 양의 상관' : '강한 음의 상관';
    else if (absR >= 0.4) strength = r > 0 ? '보통의 양의 상관' : '보통의 음의 상관';
    else if (absR >= 0.2) strength = r > 0 ? '약한 양의 상관' : '약한 음의 상관';

    return { r, r2, t, pValue, df, strength, n, covariance: cov };
  };

  StatsEngine.spearman = function (arr1, arr2) {
    function rank(arr) {
      const indexed = arr.map((v, i) => ({ v, i }));
      indexed.sort((a, b) => a.v - b.v);
      const ranks = new Array(arr.length);
      let i = 0;
      while (i < indexed.length) {
        let j = i;
        while (j < indexed.length - 1 && indexed[j + 1].v === indexed[j].v) {
          j++;
        }
        const avgRank = (i + j + 2) / 2.0;
        for (let k = i; k <= j; k++) {
          ranks[indexed[k].i] = avgRank;
        }
        i = j + 1;
      }
      return ranks;
    }

    const validX = [];
    const validY = [];
    const minLen = Math.min(arr1.length, arr2.length);
    for (let i = 0; i < minLen; i++) {
      const vx = Number(arr1[i]);
      const vy = Number(arr2[i]);
      if (!isNaN(vx) && !isNaN(vy) && isFinite(vx) && isFinite(vy)) {
        validX.push(vx);
        validY.push(vy);
      }
    }
    if (validX.length < 3) return { rho: 0, pValue: 1 };

    const rx = rank(validX);
    const ry = rank(validY);
    const pearsonOnRanks = StatsEngine.pearson(rx, ry);
    return {
      rho: pearsonOnRanks.r,
      pValue: pearsonOnRanks.pValue,
      df: pearsonOnRanks.df
    };
  };

  // ==========================================
  // 5. Sensor Error & Precision Analysis
  // ==========================================

  StatsEngine.sensorErrorAnalysis = function (rawYPred, rawYTrue, labelPred = '원시값', labelTrue = '참값') {
    const pairs = [];
    const minLen = Math.min(rawYPred.length, rawYTrue.length);
    for (let i = 0; i < minLen; i++) {
      const yp = Number(rawYPred[i]);
      const yt = Number(rawYTrue[i]);
      if (!isNaN(yp) && !isNaN(yt) && isFinite(yp) && isFinite(yt)) {
        pairs.push({ pred: yp, trueVal: yt, diff: yp - yt });
      }
    }
    const n = pairs.length;
    if (n === 0) return null;

    const diffs = pairs.map(p => p.diff);
    const absDiffs = pairs.map(p => Math.abs(p.diff));

    // MAE, MSE, RMSE, Max Error, Bias
    const mae = StatsEngine.mean(absDiffs);
    const mse = StatsEngine.mean(diffs.map(d => d * d));
    const rmse = Math.sqrt(mse);
    const maxError = Math.max(...absDiffs);
    const bias = StatsEngine.mean(diffs);

    // MAPE (Mean Absolute Percentage Error)
    let mapeSum = 0;
    let mapeCount = 0;
    for (const p of pairs) {
      if (Math.abs(p.trueVal) > 1e-6) {
        mapeSum += Math.abs(p.diff / p.trueVal);
        mapeCount++;
      }
    }
    const mape = mapeCount > 0 ? (mapeSum / mapeCount) * 100 : null;

    // Paired t-test
    const sdDiff = StatsEngine.stdev(diffs, true);
    const seDiff = sdDiff / Math.sqrt(n);
    const df = n - 1;
    const tStat = seDiff > 0 ? bias / seDiff : 0;
    const pValue = StatsEngine.tPValue(tStat, df);
    const tCrit = StatsEngine.tCrit05(df);
    const ci95Lower = bias - tCrit * seDiff;
    const ci95Upper = bias + tCrit * seDiff;
    const isSignificant = pValue < 0.05;

    // Bland-Altman Stats
    const baMeans = pairs.map(p => (p.pred + p.trueVal) / 2);
    const upperLoA = bias + 1.96 * sdDiff; // Upper Limit of Agreement
    const lowerLoA = bias - 1.96 * sdDiff; // Lower Limit of Agreement
    const outsideLoACount = pairs.filter(p => p.diff > upperLoA || p.diff < lowerLoA).length;

    return {
      n,
      labelPred,
      labelTrue,
      mae,
      mse,
      rmse,
      maxError,
      bias,
      mape,
      sdDiff,
      seDiff,
      tStat,
      df,
      pValue,
      tCrit,
      ci95Lower,
      ci95Upper,
      isSignificant,
      baMeans,
      baDiffs: diffs,
      upperLoA,
      lowerLoA,
      outsideLoACount,
      pairs
    };
  };

  // ==========================================
  // 6. Regression Models (Linear, Polynomial, Exponential)
  // ==========================================

  StatsEngine.linearRegression = function (rawX, rawY) {
    const pairs = [];
    const minLen = Math.min(rawX.length, rawY.length);
    for (let i = 0; i < minLen; i++) {
      const x = Number(rawX[i]);
      const y = Number(rawY[i]);
      if (!isNaN(x) && !isNaN(y) && isFinite(x) && isFinite(y)) {
        pairs.push({ x, y });
      }
    }
    const n = pairs.length;
    if (n < 3) return null;

    const xVals = pairs.map(p => p.x);
    const yVals = pairs.map(p => p.y);
    const meanX = StatsEngine.mean(xVals);
    const meanY = StatsEngine.mean(yVals);

    let ssXX = 0;
    let ssYY = 0;
    let ssXY = 0;
    for (let i = 0; i < n; i++) {
      const dx = xVals[i] - meanX;
      const dy = yVals[i] - meanY;
      ssXX += dx * dx;
      ssYY += dy * dy;
      ssXY += dx * dy;
    }

    if (ssXX === 0) return null;

    const slope = ssXY / ssXX;
    const intercept = meanY - slope * meanX;

    let ssRes = 0;
    for (let i = 0; i < n; i++) {
      const yHat = slope * xVals[i] + intercept;
      const res = yVals[i] - yHat;
      ssRes += res * res;
    }

    const r2 = ssYY > 0 ? Math.max(0, 1 - ssRes / ssYY) : 0;
    const adjR2 = Math.max(0, 1 - (1 - r2) * ((n - 1) / (n - 2)));
    const seRes = Math.sqrt(ssRes / (n - 2));

    // F-statistic for model
    const msReg = (ssYY - ssRes) / 1;
    const msRes = ssRes / (n - 2);
    const fStat = msRes > 0 ? msReg / msRes : 0;
    const tSlope = ssXX > 0 && seRes > 0 ? slope / (seRes / Math.sqrt(ssXX)) : 0;
    const pValue = StatsEngine.tPValue(tSlope, n - 2);

    const sign = intercept >= 0 ? '+' : '-';
    const eq = `y = ${slope.toFixed(4)}x ${sign} ${Math.abs(intercept).toFixed(4)}`;

    return {
      type: 'linear',
      slope,
      intercept,
      r2,
      adjR2,
      seRes,
      fStat,
      pValue,
      equation: eq,
      n,
      predict: (x) => slope * x + intercept
    };
  };

  /**
   * Polynomial Regression degree 2: y = a x^2 + b x + c
   */
  StatsEngine.polyRegressionDegree2 = function (rawX, rawY) {
    const pairs = [];
    const minLen = Math.min(rawX.length, rawY.length);
    for (let i = 0; i < minLen; i++) {
      const x = Number(rawX[i]);
      const y = Number(rawY[i]);
      if (!isNaN(x) && !isNaN(y) && isFinite(x) && isFinite(y)) {
        pairs.push({ x, y });
      }
    }
    const n = pairs.length;
    if (n < 4) return null;

    let s0 = n, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
    let t0 = 0, t1 = 0, t2 = 0;

    for (let i = 0; i < n; i++) {
      const x = pairs[i].x;
      const y = pairs[i].y;
      const x2 = x * x;
      s1 += x;
      s2 += x2;
      s3 += x2 * x;
      s4 += x2 * x2;
      t0 += y;
      t1 += x * y;
      t2 += x2 * y;
    }

    // Solve 3x3 linear system A * [c, b, a]^T = T
    // Using Gaussian Elimination
    const A = [
      [s0, s1, s2, t0],
      [s1, s2, s3, t1],
      [s2, s3, s4, t2]
    ];

    for (let i = 0; i < 3; i++) {
      let maxEl = Math.abs(A[i][i]);
      let maxRow = i;
      for (let k = i + 1; k < 3; k++) {
        if (Math.abs(A[k][i]) > maxEl) {
          maxEl = Math.abs(A[k][i]);
          maxRow = k;
        }
      }
      for (let k = i; k < 4; k++) {
        const tmp = A[maxRow][k];
        A[maxRow][k] = A[i][k];
        A[i][k] = tmp;
      }
      if (Math.abs(A[i][i]) < 1e-12) return null; // singular

      for (let k = i + 1; k < 3; k++) {
        const c = -A[k][i] / A[i][i];
        for (let j = i; j < 4; j++) {
          if (i === j) A[k][j] = 0;
          else A[k][j] += c * A[i][j];
        }
      }
    }

    const sol = [0, 0, 0];
    for (let i = 2; i >= 0; i--) {
      sol[i] = A[i][3] / A[i][i];
      for (let k = i - 1; k >= 0; k--) {
        A[k][3] -= A[k][i] * sol[i];
      }
    }

    const c = sol[0];
    const b = sol[1];
    const a = sol[2];

    const meanY = t0 / n;
    let ssTot = 0;
    let ssRes = 0;
    for (let i = 0; i < n; i++) {
      const x = pairs[i].x;
      const y = pairs[i].y;
      const yHat = a * x * x + b * x + c;
      ssTot += (y - meanY) * (y - meanY);
      ssRes += (y - yHat) * (y - yHat);
    }
    const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
    const adjR2 = Math.max(0, 1 - (1 - r2) * ((n - 1) / (n - 3)));

    const eq = `y = ${a.toFixed(4)}x² + ${b.toFixed(4)}x + ${c.toFixed(4)}`;

    return {
      type: 'poly2',
      a, b, c,
      r2,
      adjR2,
      equation: eq,
      n,
      predict: (x) => a * x * x + b * x + c
    };
  };

  /**
   * Exponential Regression: y = a * exp(b * x)
   */
  StatsEngine.exponentialRegression = function (rawX, rawY) {
    const pairs = [];
    const minLen = Math.min(rawX.length, rawY.length);
    for (let i = 0; i < minLen; i++) {
      const x = Number(rawX[i]);
      const y = Number(rawY[i]);
      if (!isNaN(x) && !isNaN(y) && isFinite(x) && isFinite(y) && y > 0) {
        pairs.push({ x, y, lnY: Math.log(y) });
      }
    }
    if (pairs.length < 3) return null;

    const xs = pairs.map(p => p.x);
    const lnYs = pairs.map(p => p.lnY);
    const lin = StatsEngine.linearRegression(xs, lnYs);
    if (!lin) return null;

    const a = Math.exp(lin.intercept);
    const b = lin.slope;

    const meanY = StatsEngine.mean(pairs.map(p => p.y));
    let ssTot = 0;
    let ssRes = 0;
    for (const p of pairs) {
      const yHat = a * Math.exp(b * p.x);
      ssTot += Math.pow(p.y - meanY, 2);
      ssRes += Math.pow(p.y - yHat, 2);
    }
    const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
    const eq = `y = ${a.toFixed(4)} · e^(${b.toFixed(4)}x)`;

    return {
      type: 'exponential',
      a, b,
      r2,
      equation: eq,
      n: pairs.length,
      predict: (x) => a * Math.exp(b * x)
    };
  };

  // ==========================================
  // 7. SPC Control Charts & Outlier Detection
  // ==========================================

  StatsEngine.detectOutliers = function (rawArr, method = 'all', options = {}) {
    const zThreshold = options.zThreshold || 2.5;
    const items = [];
    for (let i = 0; i < rawArr.length; i++) {
      const v = rawArr[i];
      if (v !== null && v !== undefined && v !== '') {
        const num = Number(v);
        if (!isNaN(num) && isFinite(num)) {
          items.push({ index: i, value: num });
        }
      }
    }
    const n = items.length;
    if (n < 3) return { items: [], spc: null, iqrBounds: null };

    const vals = items.map(it => it.value);
    const mean = StatsEngine.mean(vals);
    const sd = StatsEngine.stdev(vals, true);
    const { q1, q2, q3, iqr } = StatsEngine.quartiles(vals);

    // Shewhart 3-Sigma Limits
    const cl = mean;
    const ucl = mean + 3 * sd;
    const lcl = mean - 3 * sd;

    // Tukey's IQR Fences
    const iqrLower = q1 - 1.5 * iqr;
    const iqrUpper = q3 + 1.5 * iqr;

    const annotatedItems = items.map(item => {
      const z = sd > 0 ? (item.value - mean) / sd : 0;
      const is3SigmaOutlier = item.value > ucl || item.value < lcl;
      const isIqrOutlier = item.value > iqrUpper || item.value < iqrLower;
      const isZOutlier = Math.abs(z) > zThreshold;

      const reasons = [];
      if (is3SigmaOutlier) reasons.push(item.value > ucl ? '3-Sigma 상한 초과' : '3-Sigma 하한 미달');
      if (isIqrOutlier) reasons.push(item.value > iqrUpper ? 'IQR 상한(Q3+1.5IQR) 초과' : 'IQR 하한(Q1-1.5IQR) 미달');
      if (isZOutlier) reasons.push(`|Z-Score| > ${zThreshold} (Z=${z.toFixed(2)})`);

      return {
        ...item,
        zScore: z,
        is3SigmaOutlier,
        isIqrOutlier,
        isZOutlier,
        isOutlier: reasons.length > 0,
        reasons
      };
    });

    const outliers = annotatedItems.filter(it => it.isOutlier);

    return {
      total: n,
      outliersCount: outliers.length,
      outlierRatio: (outliers.length / n) * 100,
      spc: { cl, ucl, lcl, sd, mean },
      iqrBounds: { q1, q2, q3, iqr, lower: iqrLower, upper: iqrUpper },
      items: annotatedItems,
      outliers
    };
  };

  // ==========================================
  // 8. Time Series Moving Averages
  // ==========================================

  StatsEngine.movingAverage = function (arr, windowSize = 5) {
    const res = [];
    for (let i = 0; i < arr.length; i++) {
      if (i < windowSize - 1) {
        res.push(null);
      } else {
        const slice = arr.slice(i - windowSize + 1, i + 1);
        res.push(StatsEngine.mean(slice));
      }
    }
    return res;
  };

  StatsEngine.exponentialMovingAverage = function (arr, alpha = 0.3) {
    if (!arr || arr.length === 0) return [];
    const res = [arr[0]];
    for (let i = 1; i < arr.length; i++) {
      res.push(alpha * arr[i] + (1 - alpha) * res[i - 1]);
    }
    return res;
  };

  window.StatsEngine = StatsEngine;
})(window);
