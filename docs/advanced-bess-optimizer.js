function byId(id) {
  return document.getElementById(id);
}

function initializeOptimizerDates() {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 7);
  const start = startDate.toISOString().slice(0, 10);

  if (byId("startDate")) byId("startDate").value = start;
  if (byId("endDate")) byId("endDate").value = end;
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
    strategyMode: byId("strategyMode")?.value || "charge_discharge",
    startDate: byId("startDate")?.value || "",
    endDate: byId("endDate")?.value || "",
    markets: getSelectedMarkets()
  };
}

function validateInputs(inputs) {
  if (inputs.powerMw <= 0) return "BESS MW must be greater than 0.";
  if (inputs.capacityMWh <= 0) return "BESS MWh must be greater than 0.";
  if (inputs.efficiency <= 0 || inputs.efficiency > 1) return "η must be between 0 and 1.";
  if (inputs.minSoc < 0 || inputs.minSoc > 100) return "Min SoC must be between 0 and 100.";
  if (inputs.maxSoc < 0 || inputs.maxSoc > 100) return "Max SoC must be between 0 and 100.";
  if (inputs.minSoc >= inputs.maxSoc) return "Min SoC must be lower than Max SoC.";
  if (inputs.dailyCycleLimit < 0) return "Daily cycle limit cannot be negative.";
  if (!inputs.startDate || !inputs.endDate) return "Please select both start and end dates.";
  if (inputs.startDate > inputs.endDate) return "Start date must be before end date.";
  if (!inputs.markets.length) return "Select at least one market.";
  return null;
}

function renderMockResult(inputs) {
  const resultEl = byId("optimizerResult");
  if (!resultEl) return;

  resultEl.innerHTML = `
    <div class="optimizer-result-card">
      <div class="optimizer-result-title">Optimization input summary</div>
      <div>This is a safe mock result for Step 2 only. No backtest has been run yet.</div>

      <div class="optimizer-result-grid">
        <div><strong>Power:</strong> ${inputs.powerMw} MW</div>
        <div><strong>Capacity:</strong> ${inputs.capacityMWh} MWh</div>
        <div><strong>η:</strong> ${inputs.efficiency}</div>
        <div><strong>Min SoC:</strong> ${inputs.minSoc}%</div>
        <div><strong>Max SoC:</strong> ${inputs.maxSoc}%</div>
        <div><strong>Cycle limit:</strong> ${inputs.dailyCycleLimit}</div>
        <div><strong>Mode:</strong> ${inputs.strategyMode}</div>
        <div><strong>Markets:</strong> ${inputs.markets.join(", ")}</div>
        <div><strong>Start date:</strong> ${inputs.startDate}</div>
        <div><strong>End date:</strong> ${inputs.endDate}</div>
      </div>
    </div>
  `;
}

function handleRunOptimizer() {
  const inputs = getOptimizerInputs();
  const error = validateInputs(inputs);

  if (error) {
    const resultEl = byId("optimizerResult");
    if (resultEl) {
      resultEl.innerHTML = `
        <div class="optimizer-placeholder" style="border-color:#fda29b;background:#fff1f3;color:#b42318;">
          <strong>Input error</strong><br>
          ${error}
        </div>
      `;
    }
    return;
  }

  renderMockResult(inputs);
}

byId("runOptimizerBtn")?.addEventListener("click", handleRunOptimizer);

initializeOptimizerDates();

console.log("Advanced BESS Optimizer Step 2 loaded.");
