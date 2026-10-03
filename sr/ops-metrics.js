/**
 * Separate Ops & PM view: leading + lagging SR product metrics across merchants.
 * Not shown on the merchant-facing dashboard (product decision).
 */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function formatPct(n) {
  return n == null ? "—" : `${n}%`;
}

function merchantMetrics(merchant) {
  const mode = loadThresholdMode(merchant.id);
  const actions = loadActions(merchant.id);
  const analysis = analyzeMerchant(merchant, mode, actions);
  const openActions = actions.filter((a) => a.accepted && !a.reversedAt);
  const reversed = actions.filter((a) => a.reversedAt);
  const reversedWithin24h = reversed.filter((a) => {
    if (!a.createdAt || !a.reversedAt) return false;
    return hoursBetween(a.createdAt, a.reversedAt) <= 24;
  });
  const leadingEligible = openActions.filter((a) => actedWithin24h(a) === true).length;
  const leadingDenom = openActions.length;
  const leadingRate =
    leadingDenom > 0 ? Math.round((100 * leadingEligible) / leadingDenom) : null;

  return {
    merchant,
    analysis,
    mode,
    openActions: leadingDenom,
    leadingEligible,
    leadingRate,
    reversedWithin24h: reversedWithin24h.length,
    lagging30d: analysis.lagging30d,
    last30: analysis.last30,
    dropCount: analysis.dropCount,
    improvedCount: analysis.improvedCount,
  };
}

function render() {
  const rows = SR_MERCHANTS.map(merchantMetrics);
  const totalOpen = rows.reduce((s, r) => s + r.openActions, 0);
  const totalLeading = rows.reduce((s, r) => s + r.leadingEligible, 0);
  const portfolioLeading =
    totalOpen > 0 ? Math.round((100 * totalLeading) / totalOpen) : null;
  const laggingVals = rows.map((r) => r.lagging30d).filter((v) => v != null);
  const avgLagging = laggingVals.length
    ? Math.round((laggingVals.reduce((a, b) => a + b, 0) / laggingVals.length) * 10) / 10
    : null;

  document.getElementById("app").innerHTML = `
    <div class="toolbar">
      <div>
        <h1>SR product metrics</h1>
        <p class="sub">Internal Ops &amp; PM view — leading / lagging health of the merchant SR diagnosis product. Merchant dashboards do not show these KPIs.</p>
      </div>
    </div>

    <div class="banner festive">
      <strong>Definitions —</strong>
      <em>Leading:</em> merchant initiates corrective action within 24h of viewing a DROP diagnosis, and does not reverse within 24h of enabling.
      <em>Lagging:</em> blended SR change over rolling 30 days vs prior 30 days.
    </div>

    <div class="kpi-row">
      <div class="kpi">
        <div class="label">Portfolio leading rate</div>
        <div class="value">${portfolioLeading == null ? "—" : portfolioLeading + "%"}</div>
        <div class="foot">${totalLeading} / ${totalOpen} active actions met ≤24h rule</div>
      </div>
      <div class="kpi">
        <div class="label">Avg lagging · 30d SR Δ</div>
        <div class="value" style="color:${avgLagging != null && avgLagging >= 0 ? "var(--green)" : "var(--red)"}">${
          avgLagging == null ? "—" : `${avgLagging >= 0 ? "+" : ""}${avgLagging} pp`
        }</div>
        <div class="foot">Across ${rows.length} prototype merchants</div>
      </div>
      <div class="kpi">
        <div class="label">Merchants with DROP</div>
        <div class="value">${rows.filter((r) => r.dropCount > 0).length}</div>
        <div class="foot">${rows.reduce((s, r) => s + r.dropCount, 0)} method-level DROPs</div>
      </div>
      <div class="kpi">
        <div class="label">Improved attributions</div>
        <div class="value">${rows.reduce((s, r) => s + r.improvedCount, 0)}</div>
        <div class="foot">Methods currently IMPROVED (often post-action)</div>
      </div>
    </div>

    <section class="panel">
      <h2>Per-merchant scorecard</h2>
      <p class="sub">Prototype clock: ${SR_TODAY}. Threshold defaults: monthly avg · brand-new (&lt;6 mo) → PG cohort benchmark.</p>
      <table class="stat-table">
        <thead>
          <tr>
            <th>Merchant</th>
            <th>Maturity</th>
            <th>Threshold default</th>
            <th>DROP / IMPROVED</th>
            <th>Leading (acted ≤24h)</th>
            <th>Reversed ≤24h</th>
            <th>Lagging 30d Δ</th>
            <th>Today SR</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((r) => {
              const defMode = defaultThresholdMode(r.merchant);
              return `<tr>
                <td>
                  <strong>${escapeHtml(r.merchant.brand)}</strong><br/>
                  <span style="color:var(--muted);font-size:12px">${escapeHtml(r.merchant.id)} · ${escapeHtml(r.merchant.category)}</span>
                </td>
                <td>${r.merchant.maturityMonths} mo<br/><span style="color:var(--muted);font-size:12px">${
                  isBrandNewMerchant(r.merchant) ? "Brand-new → cohort" : "Established → monthly avg"
                }</span></td>
                <td>${escapeHtml(THRESHOLD_MODES.find((t) => t.id === defMode)?.label || defMode)}</td>
                <td><span class="status-pill red">${r.dropCount} DROP</span> <span class="status-pill green">${r.improvedCount} ↑</span></td>
                <td>${r.leadingEligible}/${r.openActions}${r.leadingRate != null ? ` (${r.leadingRate}%)` : ""}</td>
                <td>${r.reversedWithin24h}</td>
                <td style="color:${r.lagging30d != null && r.lagging30d >= 0 ? "var(--green)" : "var(--red)"};font-weight:600">${
                  r.lagging30d == null ? "—" : `${r.lagging30d >= 0 ? "+" : ""}${r.lagging30d} pp`
                }</td>
                <td>${formatPct(r.analysis.overallSr)}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </section>

    <section class="panel">
      <h2>How to use this view</h2>
      <p class="sub">
        Ops: chase merchants with DROP + leading rate 0% (viewed but not acted).
        PM: watch portfolio leading rate during festive; lagging 30d Δ validates whether corrective-action quality is improving SR.
        Merchant UX stays diagnosis + action only — open <a href="./index.html">SR dashboard</a>.
      </p>
    </section>`;
}

render();
