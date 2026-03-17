let optimizerData = [];
const RULE_LABELS = {
  DA_IDA1: "Day Ahead ↔ IDA1",
  DA_IDA2: "Day Ahead ↔ IDA2",
  DA_IDA3: "Day Ahead ↔ IDA3",
  DA_VWAP: "Day Ahead ↔ Intraday VWAP",
  IDA1_IDA2: "IDA1 ↔ IDA2",
  IDA1_IDA3: "IDA1 ↔ IDA3",
  IDA1_VWAP: "IDA1 ↔ Intraday VWAP",
  IDA2_IDA3: "IDA2 ↔ IDA3",
  IDA2_VWAP: "IDA2 ↔ Intraday VWAP",
  IDA3_VWAP: "IDA3 ↔ Intraday VWAP",
};

function byId(id) {
  return document.getElementById(id);
}

function unique(arr) {
  return [...new Set(arr)];
}

function setOptions(id, values, labelMap = null) {
  const el = byId(id);
  if (!el) return;
  el.innerHTML = "";
  values.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.text = labelMap && labelMap[v] ? labelMap[v] : v;
    el.appendChild(opt);
  });
}

async function loadOptimizerData() {
  const statusEl = byId("optimizerDataStatus");
  try {
    const res = await fetch("./data/contract_profits.json", { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to load data: ${res.status} ${res.statusText}`);
    }
    optimizerData = await res.json();
    if (!Array.isArray(optimizerData) || optimizerData.length === 0) {
      throw new Error("contract_profits.json is empty.");
    }
    populateDatasetScope();
    if (statusEl) {
      statusEl.innerHTML = buildDatasetSummary();
    }
  } catch (err) {
    console.error(err);
    if (statusEl) {
      statusEl.innerHTML = `

Dataset error  
${err.message} 

`;
    }
  }
}

function buildDatasetSummary() {
  const areas = unique(optimizerData.map((x) => x.area)).filter(Boolean).sort();
  const rules = unique(optimizerData.map((x) => x.rule)).filter(Boolean).sort();
  const dates = unique(optimizerData.map((x) => x.date)).filter(Boolean).sort();
  return `

Loaded historical dataset

Rows: ${optimizerData.length}

Areas: ${areas.join(", ") || "-"}

Historical market pairs: ${rules.length}

Date range: ${dates[0] || "-"} → ${dates[dates.length - 1] || "-"}

`;
}

function populateDatasetScope() {
  const areas = unique(optimizerData.map((x) => x.area)).filter(Boolean).sort();
  const dates = unique(optimizerData.map((x) => x.date)).filter(Boolean).sort();
  setOptions("optimizerArea", areas);
  if (byId("startDate") && dates.length) byId("startDate").value = dates[0];
  if (byId("endDate") && dates.length) byId("endDate").value = dates[dates.length - 1];
}

function getSelectedMarkets() {
  const markets = [];
  if (byId("marketDA")?.checked) markets.push("DA");
  if (byId("marketIDA1")?.checked) markets.push("IDA1");
  if (byId("marketIDA2")?.checked) markets.push("IDA2");
  if (byId("marketIDA3")?.checked) markets.push("IDA3");
  if (byId("marketVWAP")?.checked) markets.push("VWAP");
  return markets;
}

function getOptimizerInputs() {
  return {
    powerMw: Number(byId("bessPowerMw")?.value || 0),
    capacityMWh: Number(byId("bessCapacityMWh")?.value || 0),
    efficiency: Number(byId("bessEfficiency")?.value || 0),
    minSoc: Number(byId("bessMinSoc")?.value || 0),
    maxSoc: Number(byId("bessMaxSoc")?.value || 0),
    dailyCycleLimit: Number(byId("bessDailyCycleLimit")?.value || 0),
    area: byId("optimizerArea")?.value || "",
    strategyMode: byId("strategyMode")?.value || "charge_discharge",
    startDate: byId("startDate")?.value || "",
    endDate: byId("endDate")?.value || "",
    markets: getSelectedMarkets(),
  };
}

function validateInputs(inputs) {
  if (!optimizerData.length) return "No historical dataset is loaded.";
  if (inputs.powerMw <= 0) return "BESS MW must be greater than 0.";
  if (inputs.capacityMWh <= 0) return "BESS MWh must be greater than 0.";
  if (inputs.efficiency <= 0 || inputs.efficiency > 1) return "η must be between 0 and 1.";
  if (inputs.minSoc < 0 || inputs.minSoc > 100) return "Min SoC must be between 0 and 100.";
  if (inputs.maxSoc < 0 || inputs.maxSoc > 100) return "Max SoC must be between 0 and 100.";
  if (inputs.minSoc >= inputs.maxSoc) return "Min SoC must be lower than Max SoC.";
  if (inputs.dailyCycleLimit < 0) return "Daily cycle limit cannot be negative.";
  if (!inputs.startDate || !inputs.endDate) return "Please select both start and end dates.";
  if (inputs.startDate > inputs.endDate) return "Start date must be before end date.";
  if (!inputs.area) return "Please select an area.";
  if (!inputs.markets.length) return "Select at least one market.";
  return null;
}

function getScopedRows(inputs) {
  return optimizerData
    .filter((row) => {
      if (inputs.area && row.area !== inputs.area) return false;
      if (inputs.startDate && String(row.date ?? "") < inputs.startDate) return false;
      if (inputs.endDate && String(row.date ?? "") > inputs.endDate) return false;
      return true;
    })
    .sort((a, b) => {
      const dateCompare = String(a.date).localeCompare(String(b.date));
      if (dateCompare !== 0) return dateCompare;
      return Number(a.contract_sort ?? 0) - Number(b.contract_sort ?? 0);
    });
}

function getEligibleRules(rows, selectedMarkets) {
  const allRules = unique(rows.map((r) => r.rule)).filter(Boolean);
  return allRules.filter((rule) => rule.split("_").every((p) => selectedMarkets.includes(p)));
}

function percentile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[idx];
}

function parseContractHours(contractLabel) {
  if (!contractLabel || !contractLabel.includes("-")) return 0.25;
  const [startStr, endStr] = contractLabel.split("-");
  const [sh, sm] = startStr.split(":" ).map(Number);
  const [eh, em] = endStr.split(":" ).map(Number);
  if (![sh, sm, eh, em].every(Number.isFinite)) return 0.25;
  let startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;
  if (endMins < startMins) endMins += 24 * 60;
  return (endMins - startMins) / 60;
}

function buildCandidateStrategies(mode) {
  const buyThresholds = [0.15, 0.2, 0.25, 0.3, 0.35];
  const sellThresholds = [0.65, 0.7, 0.75, 0.8, 0.85];
  const candidates = [];
  if (mode === "charge_only") {
    buyThresholds.forEach((bq) => candidates.push({ mode, buyQ: bq, sellQ: null }));
    return candidates;
  }
  if (mode === "discharge_only") {
    sellThresholds.forEach((sq) => candidates.push({ mode, buyQ: null, sellQ: sq }));
    return candidates;
  }
  buyThresholds.forEach((bq) => {
    sellThresholds.forEach((sq) => {
      if (sq > bq) candidates.push({ mode, buyQ: bq, sellQ: sq });
    });
  });
  return candidates;
}

function runSingleBacktest(rows, inputs, candidate, rule) {
  if (!rows.length) return null;
  const buyPrices = rows.map((r) => Number(r.buy_price)).filter(Number.isFinite);
  const sellPrices = rows.map((r) => Number(r.sell_price)).filter(Number.isFinite);
  const buyThreshold = candidate.buyQ !== null ? percentile(buyPrices, candidate.buyQ) : null;
  const sellThreshold = candidate.sellQ !== null ? percentile(sellPrices, candidate.sellQ) : null;
  const eta = Math.sqrt(inputs.efficiency);
  const minSocMWh = inputs.capacityMWh * (inputs.minSoc / 100);
  const maxSocMWh = inputs.capacityMWh * (inputs.maxSoc / 100);
  let soc =
    candidate.mode === "discharge_only"
      ? maxSocMWh
      : candidate.mode === "charge_only"
      ? minSocMWh
      : (minSocMWh + maxSocMWh) / 2;
  let totalPnL = 0;
  let chargeEnergyRaw = 0;
  let dischargeEnergyRaw = 0;
  let chargeActions = 0;
  let dischargeActions = 0;
  let currentDate = null;
  let chargedTodayRaw = 0;
  const actions = [];
  rows.forEach((row) => {
    const date = String(row.date);
    if (currentDate !== date) {
      currentDate = date;
      chargedTodayRaw = 0;
    }
    const durationH = parseContractHours(row.contract);
    const stepRawLimit = inputs.powerMw * durationH;
    const dailyChargeBudgetRaw = inputs.dailyCycleLimit * inputs.capacityMWh;
    const dailyChargeRemaining = Math.max(0, dailyChargeBudgetRaw - chargedTodayRaw);
    const buyPrice = Number(row.buy_price);
    const sellPrice = Number(row.sell_price);
    if (!Number.isFinite(buyPrice) || !Number.isFinite(sellPrice)) return;
    let action = "idle";
    let energyRaw = 0;
    let pnlDelta = 0;
    const canCharge =
      candidate.mode !== "discharge_only" &&
      buyThreshold !== null &&
      buyPrice <= buyThreshold &&
      soc < maxSocMWh &&
      dailyChargeRemaining > 0;
    const canDischarge =
      candidate.mode !== "charge_only" &&
      sellThreshold !== null &&
      sellPrice >= sellThreshold &&
      soc > minSocMWh;
    if (canCharge) {
      const socRoomRaw = (maxSocMWh - soc) / eta;
      const chargeRaw = Math.max(0, Math.min(stepRawLimit, dailyChargeRemaining, socRoomRaw));
      if (chargeRaw > 0) {
        soc += chargeRaw * eta;
        chargedTodayRaw += chargeRaw;
        chargeEnergyRaw += chargeRaw;
        chargeActions += 1;
        pnlDelta = -(chargeRaw * buyPrice);
        totalPnL += pnlDelta;
        action = "charge";
        energyRaw = chargeRaw;
      }
    } else if (canDischarge) {
      const availableRaw = Math.max(0, soc - minSocMWh);
      const dischargeRaw = Math.min(stepRawLimit, availableRaw);
      if (dischargeRaw > 0) {
        const delivered = dischargeRaw * eta;
        soc -= dischargeRaw;
        dischargeEnergyRaw += dischargeRaw;
        dischargeActions += 1;
        pnlDelta = delivered * sellPrice;
        totalPnL += pnlDelta;
        action = "discharge";
        energyRaw = dischargeRaw;
      }
    }
    actions.push({
      date: row.date,
      contract: row.contract,
      action,
      buy_price: buyPrice,
      sell_price: sellPrice,
      energy_raw_mwh: energyRaw,
      pnl_delta: pnlDelta,
      soc_after: soc,
    });
  });
  const activeActions = actions.filter((a) => a.action !== "idle");
  const equivalentCycles = inputs.capacityMWh > 0 ? chargeEnergyRaw / inputs.capacityMWh : 0;
  return {
    rule,
    candidate,
    buyThreshold,
    sellThreshold,
    totalPnL,
    chargeEnergyRaw,
    dischargeEnergyRaw,
    equivalentCycles,
    chargeActions,
    dischargeActions,
    endingSoc: soc,
    actions,
    activeActions,
  };
}

function runOptimizerBacktest(scopedRows, inputs) {
  const eligibleRules = getEligibleRules(scopedRows, inputs.markets);
  const candidates = buildCandidateStrategies(inputs.strategyMode);
  const allResults = [];
  eligibleRules.forEach((rule) => {
    const ruleRows = scopedRows.filter((r) => r.rule === rule);
    if (!ruleRows.length) return;
    candidates.forEach((candidate) => {
      const result = runSingleBacktest(ruleRows, inputs, candidate, rule);
      if (result) allResults.push(result);
    });
  });
  if (!allResults.length) {
    return { best: null, allResults: [], eligibleRules: [] };
  }
  allResults.sort((a, b) => b.totalPnL - a.totalPnL);
  return { best: allResults[0], allResults, eligibleRules };
}

function formatMode(mode) {
  if (mode === "charge_only") return "Charge only";
  if (mode === "discharge_only") return "Discharge only";
  if (mode === "arbitrage") return "Quant / Buy low, sell high";
  return "Charge + Discharge";
}

function renderActionTable(actions) {
  if (!actions.length)
    return `

No charge/discharge actions were triggered by the selected strategy.

`;
  return `${actions
    .slice(0, 20)
    .map((a) => ` `)
    .join("")}  Date Contract Action Buy Sell Energy P&L Δ SoC After  
${a.date} ${a.contract} ${a.action} ${a.buy_price.toFixed(2)} ${a.sell_price.toFixed(2)} ${a.energy_raw_mwh.toFixed(2)} ${a.pnl_delta.toFixed(2)} ${a.soc_after.toFixed(2)}  
`;
}

function renderTopAlternatives(allResults) {
  if (!allResults.length)
    return `

No alternatives found.

`;
  return `${allResults
    .slice(0, 5)
    .map((r, idx) => ` `)
    .join("")}  Rank Market Pair Mode Buy Q Sell Q Total P&L  
${idx + 1} ${RULE_LABELS[r.rule] || r.rule} ${formatMode(r.candidate.mode)} ${r.candidate.buyQ !== null ? (r.candidate.buyQ * 100).toFixed(0) + "%" : "-"} ${r.candidate.sellQ !== null ? (r.candidate.sellQ * 100).toFixed(0) + "%" : "-"} ${r.totalPnL.toFixed(2)} €  
`;
}

function summarizeDaily(bestResult) {
  const map = new Map();
  bestResult.actions.forEach((a) => {
    const key = a.date;
    if (!map.has(key)) {
      map.set(key, {
        date: key,
        pnl: 0,
        chargeEnergy: 0,
        dischargeEnergy: 0,
        charges: 0,
        discharges: 0,
        lastSoc: a.soc_after,
      });
    }
    const row = map.get(key);
    row.pnl += a.pnl_delta;
    row.lastSoc = a.soc_after;
    if (a.action === "charge") {
      row.chargeEnergy += a.energy_raw_mwh;
      row.charges += 1;
    } else if (a.action === "discharge") {
      row.dischargeEnergy += a.energy_raw_mwh;
      row.discharges += 1;
    }
  });
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function renderDailySummaryTable(dailyRows) {
  const el = byId("optimizerDailySummary");
  if (!el) return;
  if (!dailyRows.length) {
    el.innerHTML = `

No daily summary available.

`;
    return;
  }
  el.innerHTML = `${dailyRows
    .map((r) => ` `)
    .join("")}  Date Daily P&L Charge Energy Discharge Energy Charge Actions Discharge Actions Ending SoC  
${r.date} ${r.pnl.toFixed(2)} ${r.chargeEnergy.toFixed(2)} ${r.dischargeEnergy.toFixed(2)} ${r.charges} ${r.discharges} ${r.lastSoc.toFixed(2)}  
`;
}

function renderOptimizerCharts(bestResult) {
  if (typeof Plotly === "undefined") return;
  const dailyRows = summarizeDaily(bestResult);
  const dailyDates = dailyRows.map((r) => r.date);
  const dailyPnL = dailyRows.map((r) => r.pnl);
  const cumulative = [];
  dailyPnL.reduce((acc, val, i) => {
    cumulative[i] = acc + val;
    return cumulative[i];
  }, 0);
  const stepLabels = bestResult.actions.map((a, i) => `${a.date} | ${a.contract} | ${i + 1}`);
  const socTrace = bestResult.actions.map((a) => a.soc_after);
  Plotly.newPlot(
    "optimizerDailyPnL",
    [
      {
        x: dailyDates,
        y: dailyPnL,
        type: "bar",
        hovertemplate: "Date: %{x}  \nDaily P&L: %{y:.2f} €",
      },
    ],
    {
      title: "Daily P&L",
      margin: { l: 60, r: 20, t: 50, b: 90 },
      paper_bgcolor: "white",
      plot_bgcolor: "white",
      xaxis: { title: "Date", tickangle: -45, automargin: true },
      yaxis: { title: "P&L (€)", gridcolor: "#eaecf0", automargin: true },
    },
    { responsive: true, displayModeBar: false }
  );
  Plotly.newPlot(
    "optimizerCumulativePnL",
    [
      {
        x: dailyDates,
        y: cumulative,
        mode: "lines+markers",
        hovertemplate: "Date: %{x}  \nCumulative P&L: %{y:.2f} €",
      },
    ],
    {
      title: "Cumulative P&L",
      margin: { l: 60, r: 20, t: 50, b: 90 },
      paper_bgcolor: "white",
      plot_bgcolor: "white",
      xaxis: { title: "Date", tickangle: -45, automargin: true },
      yaxis: { title: "Cumulative (€)", gridcolor: "#eaecf0", automargin: true },
    },
    { responsive: true, displayModeBar: false }
  );
  Plotly.newPlot(
    "optimizerSocTrace",
    [
      {
        x: stepLabels,
        y: socTrace,
        mode: "lines",
        customdata: bestResult.actions.map((a) => `${a.date} | ${a.contract} | ${a.action}`),
        hovertemplate: "%{customdata}  \nSoC: %{y:.2f} MWh",
      },
    ],
    {
      title: "SoC Trace",
      margin: { l: 60, r: 20, t: 50, b: 110 },
      paper_bgcolor: "white",
      plot_bgcolor: "white",
      xaxis: { title: "Step", showticklabels: false, automargin: true },
      yaxis: { title: "SoC (MWh)", gridcolor: "#eaecf0", automargin: true },
    },
    { responsive: true, displayModeBar: false }
  );
  renderDailySummaryTable(dailyRows);
}

function clearOptimizerCharts() {
  ["optimizerDailyPnL", "optimizerCumulativePnL", "optimizerSocTrace"].forEach((id) => {
    const el = byId(id);
    if (!el || typeof Plotly === "undefined") return;
    Plotly.newPlot(
      id,
      [],
      {
        annotations: [
          {
            text: "No data",
            showarrow: false,
          },
        ],
        margin: { l: 40, r: 20, t: 40, b: 40 },
        paper_bgcolor: "white",
        plot_bgcolor: "white",
      },
      { responsive: true, displayModeBar: false }
    );
  });
  const summaryEl = byId("optimizerDailySummary");
  if (summaryEl) {
    summaryEl.innerHTML = `

No daily summary yet.

`;
  }
}

function renderBacktestResult(inputs, scopedRows, run) {
  const resultEl = byId("optimizerResult");
  if (!resultEl) return;
  if (!run.best) {
    resultEl.innerHTML = `

No valid strategy found  
No eligible historical market pair exists inside the selected markets and date range. 

`;
    clearOptimizerCharts();
    return;
  }
  const best = run.best;
  const strategyNote =
    inputs.strategyMode === "charge_only"
      ? `Best pair: ${RULE_LABELS[best.rule] || best.rule}. Charge when buy price is in the lowest ${(best.candidate.buyQ * 100).toFixed(0)}% of scoped history for this pair.`
      : inputs.strategyMode === "discharge_only"
      ? `Best pair: ${RULE_LABELS[best.rule] || best.rule}. Discharge when sell price is in the highest ${(100 - best.candidate.sellQ * 100).toFixed(0)}% tail of scoped history for this pair.`
      : `Best pair: ${RULE_LABELS[best.rule] || best.rule}. Charge below ${best.buyThreshold?.toFixed(2) ?? "-"} €/MWh and discharge above ${best.sellThreshold?.toFixed(2) ?? "-"} €/MWh for the selected period.`;
  resultEl.innerHTML = `

Recommended strategy

Mode: ${formatMode(inputs.strategyMode)}

Recommended market pair: ${RULE_LABELS[best.rule] || best.rule}

Markets selected: ${inputs.markets.join(", ")}

Scope: ${inputs.area} | ${inputs.startDate} → ${inputs.endDate}

${strategyNote}

Scoped rows: ${scopedRows.length}

Eligible market pairs: ${run.eligibleRules.length}

Total P&L: ${best.totalPnL.toFixed(2)} €

Charge actions: ${best.chargeActions}

Discharge actions: ${best.dischargeActions}

Charged energy: ${best.chargeEnergyRaw.toFixed(2)} MWh

Discharged energy: ${best.dischargeEnergyRaw.toFixed(2)} MWh

Equivalent charge cycles: ${best.equivalentCycles.toFixed(2)}

Ending SoC: ${best.endingSoc.toFixed(2)} MWh

Notes  
Step 6 adds daily P&L, cumulative P&L, SoC trace, and a daily summary table for the recommended historical market pair strategy. 

Top 5 strategy alternatives

${renderTopAlternatives(run.allResults)} 

First 20 active actions of recommended strategy

${renderActionTable(best.activeActions)} 

`;
  renderOptimizerCharts(best);
}

function handleRunOptimizer() {
  const inputs = getOptimizerInputs();
  const error = validateInputs(inputs);
  if (error) {
    const resultEl = byId("optimizerResult");
    if (resultEl) {
      resultEl.innerHTML = ` 

Input error  
${error} 

`;
    }
    clearOptimizerCharts();
    return;
  }
  const scopedRows = getScopedRows(inputs);
  if (!scopedRows.length) {
    const resultEl = byId("optimizerResult");
    if (resultEl) {
      resultEl.innerHTML = ` 

No scoped data  
No historical rows match the selected area and date range. 

`;
    }
    clearOptimizerCharts();
    return;
  }
  const run = runOptimizerBacktest(scopedRows, inputs);
  renderBacktestResult(inputs, scopedRows, run);
}

byId("runOptimizerBtn")?.addEventListener("click", handleRunOptimizer);
loadOptimizerData();
clearOptimizerCharts();
console.log("Advanced BESS Optimizer Step 6 loaded.");

// Walk-forward override for runSingleBacktest to avoid in-sample bias.
// This override computes buy/sell thresholds using only past prices and therefore uses walk-forward thresholds.
(function () {
  const originalRunSingleBacktest = runSingleBacktest;
  runSingleBacktest = function (rows, inputs, candidate, rule) {
    if (!rows || !rows.length) return null;
    const eta = Math.sqrt(inputs.efficiency);
    const minSocMWh = inputs.capacityMWh * (inputs.minSoc / 100);
    const maxSocMWh = inputs.capacityMWh * (inputs.maxSoc / 100);
    let soc = candidate.mode === "discharge_only"
      ? maxSocMWh
      : candidate.mode === "charge_only"
      ? minSocMWh
      : (minSocMWh + maxSocMWh) / 2;
    let totalPnL = 0;
    let chargeEnergyRaw = 0;
    let dischargeEnergyRaw = 0;
    let chargeActions = 0;
    let dischargeActions = 0;
    let currentDate = null;
    let chargedTodayRaw = 0;
    const actions = [];
    const buyPricesSoFar = [];
    const sellPricesSoFar = [];
    rows.forEach((row) => {
      const date = String(row.date);
      if (currentDate !== date) {
        currentDate = date;
        chargedTodayRaw = 0;
      }
      const durationH = parseContractHours(row.contract);
      const stepRawLimit = inputs.powerMw * durationH;
      const dailyChargeBudgetRaw = inputs.dailyCycleLimit * inputs.capacityMWh;
      const dailyChargeRemaining = Math.max(0, dailyChargeBudgetRaw - chargedTodayRaw);
      const buyPrice = Number(row.buy_price);
      const sellPrice = Number(row.sell_price);
      const buyThresholdLocal = candidate.buyQ !== null && buyPricesSoFar.length > 0
        ? percentile(buyPricesSoFar, candidate.buyQ)
        : null;
      const sellThresholdLocal = candidate.sellQ !== null && sellPricesSoFar.length > 0
        ? percentile(sellPricesSoFar, candidate.sellQ)
        : null;
      let action = "idle";
      let energyRaw = 0;
      let pnlDelta = 0;
      const canChargeLocal = candidate.mode !== "discharge_only" && buyThresholdLocal !== null && buyPrice <= buyThresholdLocal && soc < maxSocMWh && dailyChargeRemaining > 0;
      const canDischargeLocal = candidate.mode !== "charge_only" && sellThresholdLocal !== null && sellPrice >= sellThresholdLocal && soc > minSocMWh;
      if (canChargeLocal) {
        const socRoomRaw = (maxSocMWh - soc) / eta;
        const chargeRaw = Math.max(0, Math.min(stepRawLimit, dailyChargeRemaining, socRoomRaw));
        if (chargeRaw > 0) {
          soc += chargeRaw * eta;
          chargedTodayRaw += chargeRaw;
          chargeEnergyRaw += chargeRaw;
          chargeActions += 1;
          pnlDelta = -(chargeRaw * buyPrice);
          totalPnL += pnlDelta;
          action = "charge";
          energyRaw = chargeRaw;
        }
      } else if (canDischargeLocal) {
        const availableRaw = Math.max(0, soc - minSocMWh);
        const dischargeRaw = Math.min(stepRawLimit, availableRaw);
        if (dischargeRaw > 0) {
          const delivered = dischargeRaw * eta;
          soc -= dischargeRaw;
          dischargeEnergyRaw += dischargeRaw;
          dischargeActions += 1;
          pnlDelta = delivered * sellPrice;
          totalPnL += pnlDelta;
          action = "discharge";
          energyRaw = dischargeRaw;
        }
      }
      actions.push({
        date: row.date,
        contract: row.contract,
        action,
        buy_price: buyPrice,
        sell_price: sellPrice,
        energy_raw_mwh: energyRaw,
        pnl_delta: pnlDelta,
        soc_after: soc,
      });
      if (Number.isFinite(buyPrice)) buyPricesSoFar.push(buyPrice);
      if (Number.isFinite(sellPrice)) sellPricesSoFar.push(sellPrice);
    });
    const activeActions = actions.filter((a) => a.action !== "idle");
    const equivalentCycles = inputs.capacityMWh > 0 ? chargeEnergyRaw / inputs.capacityMWh : 0;
    const finalBuyThreshold = candidate.buyQ !== null && buyPricesSoFar.length > 0
      ? percentile(buyPricesSoFar, candidate.buyQ)
      : null;
    const finalSellThreshold = candidate.sellQ !== null && sellPricesSoFar.length > 0
      ? percentile(sellPricesSoFar, candidate.sellQ)
      : null;
    return {
      rule,
      candidate,
      buyThreshold: finalBuyThreshold,
      sellThreshold: finalSellThreshold,
      totalPnL,
      chargeEnergyRaw,
      dischargeEnergyRaw,
      equivalentCycles,
      chargeActions,
      dischargeActions,
      endingSoc: soc,
      actions,
      activeActions,
    };
  };
})();
