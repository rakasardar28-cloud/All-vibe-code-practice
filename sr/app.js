/**
 * Interactive SR drop diagnosis & corrective-action dashboard.
 * Views: login → overview → method detail (actions / review / undo).
 */

let srChart = null;
let state = {
  view: "login", // login | overview | method
  merchantId: null,
  method: null,
  windowDays: 14,
};

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function toast(msg) {
  const root = $("toastRoot");
  root.innerHTML = `<div class="toast" role="status">${escapeHtml(msg)}</div>`;
  setTimeout(() => {
    root.innerHTML = "";
  }, 2800);
}

function formatInr(n) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function formatPct(n) {
  return n == null ? "—" : `${n}%`;
}

function syncNav() {
  const el = $("navSession");
  const m = state.merchantId ? getMerchant(state.merchantId) : null;
  if (!m) {
    el.innerHTML = `<span>Merchant login</span>`;
    return;
  }
  el.innerHTML = `
    <span><strong style="color:#fff">${escapeHtml(m.brand)}</strong> · ${escapeHtml(m.id)}</span>
    <button class="btn btn-ghost" style="padding:5px 10px;font-size:12px" id="btnLogout">Switch merchant</button>
  `;
  $("btnLogout")?.addEventListener("click", () => {
    clearSession();
    state = { view: "login", merchantId: null, method: null, windowDays: 14 };
    render();
  });
}

function render() {
  syncNav();
  const app = $("app");
  if (state.view === "login") {
    app.innerHTML = renderLogin();
    bindLogin();
    return;
  }
  const merchant = getMerchant(state.merchantId);
  if (!merchant) {
    state.view = "login";
    return render();
  }
  if (state.view === "overview") {
    app.innerHTML = renderOverview(merchant);
    bindOverview(merchant);
    return;
  }
  if (state.view === "method") {
    app.innerHTML = renderMethod(merchant);
    bindMethod(merchant);
  }
}

/* ---------- Login ---------- */
function renderLogin() {
  const cards = SR_MERCHANTS.map((m) => {
    const tags = m.demoTags
      .slice(0, 3)
      .map((t) => {
        const cls =
          t.includes("drop") || t.includes("worsened") || t.includes("wrong")
            ? "red"
            : t.includes("improve")
              ? "green"
              : t.includes("stable") || t.includes("festive")
                ? "yellow"
                : "teal";
        return `<span class="chip ${cls}">${escapeHtml(t)}</span>`;
      })
      .join("");
    return `
      <button class="merchant-pick" data-id="${escapeHtml(m.id)}">
        <div>
          <strong>${escapeHtml(m.brand)}</strong>
          <div class="meta">${escapeHtml(m.id)} · ${escapeHtml(m.category)} · ${escapeHtml(m.maturityLabel)}</div>
          <div class="meta">${escapeHtml(m.mixNote)}</div>
        </div>
        <div class="tags">${tags}</div>
      </button>`;
  }).join("");

  return `
    <section class="hero-login">
      <div class="hero-copy">
        <div class="eyebrow">Merchant success rate</div>
        <h1>Diagnose SR drops.<br/>Act before GMV slips.</h1>
        <p class="lead">
          Per payment method view of UPI, Cards, Netbanking, EMI &amp; Wallets —
          DROP / STABLE / IMPROVED against your threshold, with TD vs BD classification
          and corrective actions for multi-PG routing, FRM, and instrument deep-dives.
        </p>
      </div>
      <div class="login-panel">
        <h2>Merchant login</h2>
        <p class="hint">Prototype picker — each session feels like one brand’s dashboard. Pick a merchant to demo its story.</p>
        <div class="merchant-list">${cards}</div>
      </div>
    </section>`;
}

function bindLogin() {
  document.querySelectorAll(".merchant-pick").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.merchantId = btn.dataset.id;
      state.view = "overview";
      state.method = null;
      saveSession(state.merchantId);
      toast(`Signed in as ${getMerchant(state.merchantId).brand}`);
      render();
    });
  });
}

/* ---------- Overview ---------- */
function renderOverview(merchant) {
  const mode = loadThresholdMode(merchant.id);
  const actions = loadActions(merchant.id);
  const analysis = analyzeMerchant(merchant, mode, actions);

  const dropGmv = analysis.methods
    .filter((m) => m.status.id === "DROP")
    .reduce((s, m) => s + (m.today?.gmv || 0), 0);

  const thrLabel = THRESHOLD_MODES.find((t) => t.id === mode)?.label || mode;
  const defaultMode = defaultThresholdMode(merchant);

  const kpis = `
    <div class="kpi-row">
      <div class="kpi">
        <div class="label">Overall SR (today)</div>
        <div class="value">${formatPct(analysis.overallSr)}</div>
        <div class="foot">${analysis.overallAttempts.toLocaleString("en-IN")} attempts · ${formatInr(analysis.overallGmv)} GMV</div>
      </div>
      <div class="kpi">
        <div class="label">Methods in DROP</div>
        <div class="value" style="color:${analysis.dropCount ? "var(--red)" : "var(--navy)"}">${analysis.dropCount}</div>
        <div class="foot">${analysis.improvedCount} improved · festive window active</div>
      </div>
      <div class="kpi">
        <div class="label">GMV on DROP methods</div>
        <div class="value" style="font-size:20px">${formatInr(dropGmv)}</div>
        <div class="foot">Priority by instrument importance</div>
      </div>
      <div class="kpi">
        <div class="label">Threshold mode</div>
        <div class="value" style="font-size:15px;line-height:1.3">${escapeHtml(thrLabel)}</div>
        <div class="foot">${
          mode === defaultMode
            ? isBrandNewMerchant(merchant)
              ? "Auto: brand-new → PG cohort"
              : "Auto: monthly daily avg"
            : `Default would be ${escapeHtml(THRESHOLD_MODES.find((t) => t.id === defaultMode)?.label || defaultMode)}`
        }</div>
      </div>
    </div>`;

  const methodCards = analysis.methods
    .map((m, idx) => {
      const tone = m.status.tone;
      const acted =
        m.actedWithin24h === true
          ? `<span class="meta-pill acted-ok">Acted within 24h</span>`
          : m.action
            ? `<span class="meta-pill">Action on file</span>`
            : "";
      return `
        <button class="method-card" data-method="${escapeHtml(m.method)}" style="animation-delay:${idx * 0.04}s">
          <div class="row">
            <h3>${escapeHtml(m.method)}</h3>
            <span class="status-pill ${tone}">${m.status.label}</span>
          </div>
          <div class="sr-line">
            <span class="sr">${formatPct(m.sr)}</span>
            <span class="thr">vs threshold ${formatPct(m.thr)} (${m.deltaVsThr >= 0 ? "+" : ""}${m.deltaVsThr ?? "—"} pp)</span>
          </div>
          <p class="reason">${escapeHtml(m.reason)}</p>
          <div class="meta-row">
            <span class="meta-pill ${m.importance.level}">Importance ${m.importance.level.toUpperCase()} · ${m.importance.gmvShare}% GMV</span>
            <span class="meta-pill">TD ${m.mix.tdPct}% / BD ${m.mix.bdPct}%</span>
            <span class="meta-pill">7d ${formatPct(m.d7)}</span>
            ${acted}
          </div>
        </button>`;
    })
    .join("");

  const thrOptions = THRESHOLD_MODES.map(
    (t) =>
      `<option value="${t.id}" ${t.id === mode ? "selected" : ""}>${escapeHtml(t.label)}</option>`
  ).join("");

  return `
    <div class="toolbar">
      <div>
        <h1>${escapeHtml(merchant.brand)}</h1>
        <p class="sub">${escapeHtml(merchant.category)} · ${escapeHtml(merchant.cities)} · ${escapeHtml(merchant.maturityLabel)} · AM ${escapeHtml(merchant.am)}</p>
      </div>
      <div class="controls">
        <div class="field">
          <label for="thrMode">Threshold calculation</label>
          <select id="thrMode">${thrOptions}</select>
        </div>
        <div class="field">
          <label for="windowDays">Chart window</label>
          <select id="windowDays">
            <option value="7" ${state.windowDays === 7 ? "selected" : ""}>Last 7 days</option>
            <option value="14" ${state.windowDays === 14 ? "selected" : ""}>Last 14 days</option>
            <option value="30" ${state.windowDays === 30 ? "selected" : ""}>Last 30 days</option>
            <option value="45" ${state.windowDays === 45 ? "selected" : ""}>Last 45 days</option>
          </select>
        </div>
      </div>
    </div>
    <div class="banner festive">
      <strong>Festive context (Sept–Nov):</strong>
      SR day-to-day noise rises with GMV. Declines often surface T+1/T+2. Wrong diagnosis? Use Request review → PG support on the method screen.
      Leading / lagging product metrics live in the separate <a href="./ops-metrics.html">Ops &amp; PM view</a>.
    </div>
    ${
      analysis.dropCount
        ? `<div class="banner warn"><strong>${analysis.dropCount} payment method(s) in DROP.</strong> Open a method to review diagnosis, accept a corrective action, or request PG support review if the numbers look wrong.</div>`
        : ""
    }
    ${kpis}
    <div class="method-grid">${methodCards}</div>
    <section class="panel">
      <h2>SR trend — all enabled methods</h2>
      <p class="sub">Success rate over recent intervals. SR = successful auths / total payment attempts. 3DS timeouts count as TD.</p>
      <canvas id="overviewChart" height="110" aria-label="SR trend chart"></canvas>
    </section>
    <section class="panel">
      <h2>Demo story for this merchant</h2>
      <p class="sub">${escapeHtml(merchant.demoStory)}</p>
      <div class="meta-row">${merchant.demoTags.map((t) => `<span class="chip teal">${escapeHtml(t)}</span>`).join("")}</div>
    </section>`;
}

function bindOverview(merchant) {
  $("thrMode")?.addEventListener("change", (e) => {
    saveThresholdMode(merchant.id, e.target.value);
    render();
  });
  $("windowDays")?.addEventListener("change", (e) => {
    state.windowDays = Number(e.target.value);
    drawOverviewChart(merchant);
  });
  document.querySelectorAll(".method-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.method = btn.dataset.method;
      state.view = "method";
      // stamp view time for leading metric when opening a DROP method
      sessionStorage.setItem(
        `sr_viewed_${merchant.id}_${state.method}`,
        `${SR_TODAY}T09:00:00+05:30`
      );
      render();
    });
  });
  drawOverviewChart(merchant);
}

function drawOverviewChart(merchant) {
  const ctx = $("overviewChart");
  if (!ctx) return;
  const labels = [];
  const start = addDays(SR_TODAY, -(state.windowDays - 1));
  for (let i = 0; i < state.windowDays; i++) labels.push(addDays(start, i));

  const colors = {
    UPI: "#0e7c6b",
    Cards: "#1a3f63",
    Netbanking: "#b8860b",
    EMI: "#c0392b",
    Wallets: "#3d7ea6",
  };

  const datasets = merchant.enabledMethods.map((method) => {
    const series = seriesFor(merchant.id, method);
    return {
      label: method,
      data: labels.map((d) => dayRow(series, d)?.sr ?? null),
      borderColor: colors[method] || "#666",
      backgroundColor: "transparent",
      tension: 0.25,
      pointRadius: 2,
      borderWidth: 2,
    };
  });

  if (srChart) srChart.destroy();
  srChart = new Chart(ctx, {
    type: "line",
    data: { labels: labels.map((d) => d.slice(5)), datasets },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
      },
      scales: {
        y: {
          min: 55,
          max: 100,
          title: { display: true, text: "SR %", font: { size: 11 } },
        },
      },
    },
  });
}

/* ---------- Method detail ---------- */
function renderMethod(merchant) {
  const mode = loadThresholdMode(merchant.id);
  const actions = loadActions(merchant.id);
  const m = analyzeMethod(merchant, state.method, mode, actions);
  const series = seriesFor(merchant.id, state.method);
  const window = sliceWindow(series, SR_TODAY, state.windowDays);

  const actionBlock = m.action
    ? `
      <div class="actions-box">
        <h3>Corrective action on file</h3>
        <p><strong>Accepted:</strong> Yes · <strong>At:</strong> ${escapeHtml(m.action.createdAt)}</p>
        <p><strong>Cause:</strong> ${escapeHtml(m.action.cause)}</p>
        <p><strong>Action:</strong> ${escapeHtml(m.action.suggestedAction)}</p>
        <p><strong>Fault:</strong> ${escapeHtml(m.action.fault || "—")}</p>
        <div class="meta-row" style="margin-top:8px">
          ${
            m.actedWithin24h
              ? `<span class="meta-pill acted-ok">Leading metric: acted within 24h of viewing</span>`
              : `<span class="meta-pill">View→action &gt; 24h or unknown</span>`
          }
          ${
            m.action.worsenedAfterAction
              ? `<span class="meta-pill high">Edge case: SR worsened after action</span>`
              : ""
          }
          ${
            m.action.attributedImprovement
              ? `<span class="meta-pill" style="background:var(--green-soft);color:var(--green)">Attributed IMPROVED</span>`
              : ""
          }
        </div>
        ${m.action.outcomeNote ? `<p style="margin-top:8px">${escapeHtml(m.action.outcomeNote)}</p>` : ""}
        <div class="btn-row">
          <button class="btn btn-danger" id="btnReverse" ${m.reversible ? "" : "disabled"} title="${
            m.reversible ? "Undo within 24h of enabling" : "Outside 24h undo window (leading metric)"
          }">Reverse / undo action</button>
        </div>
      </div>`
    : `
      <div class="actions-box">
        <h3>Suggested corrective action</h3>
        <p><strong>Cause:</strong> ${escapeHtml(m.suggested.cause)}</p>
        <p><strong>Suggested:</strong> ${escapeHtml(m.suggested.action)}</p>
        <p><strong>Fault:</strong> ${escapeHtml(m.suggested.fault)} · <strong>Recoverable:</strong> ${escapeHtml(m.suggested.recoverable)}</p>
        <div class="btn-row">
          <button class="btn btn-primary" id="btnAccept">Accept action (Yes)</button>
          <button class="btn btn-ghost" id="btnDecline">Decline action (No)</button>
        </div>
      </div>`;

  const reviewBlock = `
    <div class="actions-box" style="margin-top:12px">
      <h3>Wrong diagnosis?</h3>
      <p>If surfaced numbers, diagnosis, or suggested action look wrong, request a review from PG support. This opens a support path — not an in-dashboard dispute wizard.</p>
      ${
        m.misdiagnosis
          ? `<p style="color:var(--red)"><strong>Demo hint:</strong> ${escapeHtml(m.misdiagnosis.reviewHint)} Actual: ${escapeHtml(m.misdiagnosis.actualCause)}</p>`
          : ""
      }
      <div class="btn-row">
        <button class="btn btn-teal" id="btnReview">Request review → PG support</button>
      </div>
    </div>`;

  const history = actions
    .filter((a) => a.method === state.method)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return `
    <a href="#" class="back-link" id="backOverview">← Back to ${escapeHtml(merchant.brand)} overview</a>
    <div class="toolbar">
      <div>
        <h1>${escapeHtml(state.method)} · <span class="status-pill ${m.status.tone}">${m.status.label}</span></h1>
        <p class="sub">${escapeHtml(m.reason)}</p>
      </div>
      <div class="controls">
        <div class="field">
          <label for="thrMode">Threshold calculation</label>
          <select id="thrMode">
            ${THRESHOLD_MODES.map(
              (t) =>
                `<option value="${t.id}" ${t.id === mode ? "selected" : ""}>${escapeHtml(t.label)}</option>`
            ).join("")}
          </select>
        </div>
      </div>
    </div>

    <div class="kpi-row">
      <div class="kpi"><div class="label">Today SR</div><div class="value">${formatPct(m.sr)}</div><div class="foot">Δ vs thr ${m.deltaVsThr >= 0 ? "+" : ""}${m.deltaVsThr ?? "—"} pp</div></div>
      <div class="kpi"><div class="label">Threshold</div><div class="value">${formatPct(m.thr)}</div><div class="foot">${escapeHtml(THRESHOLD_MODES.find((t) => t.id === mode)?.label || "")}</div></div>
      <div class="kpi"><div class="label">Importance</div><div class="value" style="font-size:20px;text-transform:uppercase">${m.importance.level}</div><div class="foot">${m.importance.volShare}% vol · ${m.importance.userShare}% users · ${m.importance.gmvShare}% GMV</div></div>
      <div class="kpi"><div class="label">GMV today (method)</div><div class="value" style="font-size:20px">${formatInr(m.importance.gmvImpacted)}</div><div class="foot">${(m.today?.attempts || 0).toLocaleString("en-IN")} attempts</div></div>
    </div>

    <div class="detail-grid">
      <section class="panel" style="margin-top:0">
        <h2>Interval analysis</h2>
        <p class="sub">Day / rolling windows with festive context ${m.festive ? "on" : "off"}.</p>
        <canvas id="methodChart" height="140"></canvas>
        <table class="stat-table" style="margin-top:12px">
          <thead><tr><th>Window</th><th>SR</th><th>Attempts</th><th>GMV</th></tr></thead>
          <tbody>
            <tr><td>Today</td><td>${formatPct(m.sr)}</td><td>${(m.today?.attempts || 0).toLocaleString("en-IN")}</td><td>${formatInr(m.today?.gmv)}</td></tr>
            <tr><td>Yesterday</td><td>${formatPct(m.yday?.sr)}</td><td>${(m.yday?.attempts || 0).toLocaleString("en-IN")}</td><td>${formatInr(m.yday?.gmv)}</td></tr>
            <tr><td>Rolling 7d</td><td>${formatPct(m.d7)}</td><td>${sumField(sliceWindow(series, SR_TODAY, 7), "attempts").toLocaleString("en-IN")}</td><td>${formatInr(sumField(sliceWindow(series, SR_TODAY, 7), "gmv"))}</td></tr>
            <tr><td>Rolling 30d</td><td>${formatPct(m.d30)}</td><td>${sumField(sliceWindow(series, SR_TODAY, 30), "attempts").toLocaleString("en-IN")}</td><td>${formatInr(sumField(sliceWindow(series, SR_TODAY, 30), "gmv"))}</td></tr>
          </tbody>
        </table>
      </section>

      <div>
        <section class="panel" style="margin-top:0">
          <h2>Decline classification</h2>
          <p class="sub">TD = technical (PG/processor/bank/3DS timeout). BD = business (customer credentials or instrument).</p>
          <table class="stat-table">
            <tr><th>Group</th><th>Count</th><th>Share of fails</th></tr>
            <tr><td>Technical (TD)</td><td>${m.today?.td ?? 0}</td><td>${m.mix.tdPct}%</td></tr>
            <tr><td>Business — customer</td><td>${m.today?.bdCustomer ?? 0}</td><td>${m.mix.bdCustomerPct}% of BD</td></tr>
            <tr><td>Business — instrument</td><td>${m.today?.bdInstrument ?? 0}</td><td>${m.mix.bdInstrumentPct}% of BD</td></tr>
            <tr><td>Abandoned</td><td>${m.today?.abandoned ?? 0}</td><td>—</td></tr>
            <tr><td>Pending</td><td>${m.today?.pending ?? 0}</td><td>—</td></tr>
          </table>
          <p class="sub" style="margin-top:10px">Dominant: <strong>${escapeHtml(m.mix.dominant)}</strong></p>
        </section>
        ${actionBlock}
        ${reviewBlock}
      </div>
    </div>

    <section class="panel">
      <h2>Action log — ${escapeHtml(state.method)}</h2>
      <p class="sub">Captures Action (Yes/No), cause, suggested action, timestamp. Undo within 24h of enabling counts against the leading metric.</p>
      ${
        history.length
          ? `<ul class="timeline">${history
              .map(
                (a) => `
            <li>
              <div class="when">${escapeHtml(a.createdAt)}${a.reversedAt ? ` · reversed ${escapeHtml(a.reversedAt)}` : ""}</div>
              <div class="what"><strong>${a.accepted ? "YES — accepted" : "NO — declined"}</strong>: ${escapeHtml(a.suggestedAction || a.note || "")}</div>
              <div class="what" style="color:var(--muted)">${escapeHtml(a.cause || "")}</div>
            </li>`
              )
              .join("")}</ul>`
          : `<p class="empty">No corrective actions logged yet for this method.</p>`
      }
    </section>`;
}

function bindMethod(merchant) {
  $("backOverview")?.addEventListener("click", (e) => {
    e.preventDefault();
    state.view = "overview";
    state.method = null;
    render();
  });
  $("thrMode")?.addEventListener("change", (e) => {
    saveThresholdMode(merchant.id, e.target.value);
    render();
  });
  $("btnAccept")?.addEventListener("click", () => openActionModal(merchant, true));
  $("btnDecline")?.addEventListener("click", () => openActionModal(merchant, false));
  $("btnReverse")?.addEventListener("click", () => reverseAction(merchant));
  $("btnReview")?.addEventListener("click", () => openReviewModal(merchant));
  drawMethodChart(merchant);
}

function drawMethodChart(merchant) {
  const ctx = $("methodChart");
  if (!ctx) return;
  const mode = loadThresholdMode(merchant.id);
  const series = seriesFor(merchant.id, state.method);
  const labels = [];
  const start = addDays(SR_TODAY, -(state.windowDays - 1));
  for (let i = 0; i < state.windowDays; i++) labels.push(addDays(start, i));
  const srData = labels.map((d) => dayRow(series, d)?.sr ?? null);
  const thrData = labels.map((d) => thresholdValue(merchant, state.method, mode, d));

  if (srChart) srChart.destroy();
  srChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels.map((d) => d.slice(5)),
      datasets: [
        {
          label: "SR %",
          data: srData,
          borderColor: "#0e7c6b",
          tension: 0.25,
          pointRadius: 2,
          borderWidth: 2,
        },
        {
          label: "Threshold",
          data: thrData,
          borderColor: "#c0392b",
          borderDash: [6, 4],
          pointRadius: 0,
          borderWidth: 1.5,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
      scales: { y: { min: 50, max: 100 } },
    },
  });
}

/* ---------- Modals ---------- */
function openActionModal(merchant, accept) {
  const mode = loadThresholdMode(merchant.id);
  const actions = loadActions(merchant.id);
  const m = analyzeMethod(merchant, state.method, mode, actions);
  const root = $("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true">
      <div class="modal">
        <h3>${accept ? "Accept corrective action" : "Decline corrective action"}</h3>
        <p>Logged against ${escapeHtml(state.method)} for ${escapeHtml(merchant.brand)}. Timestamp uses prototype “now” (${SR_TODAY}).</p>
        <label>Cause</label>
        <textarea id="actCause" rows="3">${escapeHtml(m.suggested.cause)}</textarea>
        <label>Suggested / chosen action</label>
        <textarea id="actAction" rows="3">${escapeHtml(m.suggested.action)}</textarea>
        <label>Fault attribution</label>
        <input id="actFault" value="${escapeHtml(m.suggested.fault)}" />
        <div class="btn-row">
          <button class="btn btn-ghost" id="modalCancel">Cancel</button>
          <button class="btn btn-primary" id="modalSave">${accept ? "Confirm Yes" : "Confirm No"}</button>
        </div>
      </div>
    </div>`;
  $("modalCancel").onclick = () => {
    root.innerHTML = "";
  };
  $("modalSave").onclick = () => {
    const viewedAt =
      sessionStorage.getItem(`sr_viewed_${merchant.id}_${state.method}`) ||
      `${SR_TODAY}T08:30:00+05:30`;
    const entry = {
      id: uid("act"),
      method: state.method,
      accepted: accept,
      cause: $("actCause").value.trim(),
      suggestedAction: $("actAction").value.trim(),
      fault: $("actFault").value.trim(),
      diagnosis: m.status.id,
      declineGroup: m.mix.dominant,
      createdAt: `${SR_TODAY}T10:15:00+05:30`,
      viewedAt,
      reversedAt: null,
      outcomeNote: accept ? "Awaiting T+2 SR read for attribution." : "Merchant declined suggested action.",
      attributedImprovement: false,
      worsenedAfterAction: false,
    };
    const next = loadActions(merchant.id);
    next.push(entry);
    saveActions(merchant.id, next);
    root.innerHTML = "";
    toast(accept ? "Corrective action accepted" : "Action declined — logged");
    render();
  };
}

function reverseAction(merchant) {
  const actions = loadActions(merchant.id);
  const active = findRelatedAction(actions, state.method);
  if (!active || !reversibleWithin24h(active)) {
    toast("Undo window closed (>24h since enabling)");
    return;
  }
  active.reversedAt = `${SR_TODAY}T11:00:00+05:30`;
  active.outcomeNote = (active.outcomeNote || "") + " Reversed within 24h.";
  saveActions(merchant.id, actions);
  toast("Action reversed — leading metric will not count this enable");
  render();
}

function openReviewModal(merchant) {
  const mode = loadThresholdMode(merchant.id);
  const m = analyzeMethod(merchant, state.method, mode, loadActions(merchant.id));
  const root = $("modalRoot");
  const defaultNote = m.misdiagnosis
    ? m.misdiagnosis.reviewHint
    : "Please re-check diagnosis and suggested action against auth logs.";
  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true">
      <div class="modal">
        <h3>Request review — PG support</h3>
        <p>Creates a support ticket path for ${escapeHtml(merchant.brand)} / ${escapeHtml(state.method)}. Not an in-dashboard dispute wizard.</p>
        <label>What looks wrong?</label>
        <textarea id="reviewNote" rows="4">${escapeHtml(defaultNote)}</textarea>
        <label>Preferred contact</label>
        <input id="reviewContact" value="am+${escapeHtml(merchant.id).toLowerCase()}@merchant.example" />
        <div class="btn-row">
          <button class="btn btn-ghost" id="modalCancel">Cancel</button>
          <button class="btn btn-teal" id="modalSave">Submit to PG support</button>
        </div>
      </div>
    </div>`;
  $("modalCancel").onclick = () => {
    root.innerHTML = "";
  };
  $("modalSave").onclick = () => {
    const key = `sr_reviews_${merchant.id}`;
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    list.push({
      id: uid("rev"),
      method: state.method,
      note: $("reviewNote").value.trim(),
      contact: $("reviewContact").value.trim(),
      createdAt: `${SR_TODAY}T10:40:00+05:30`,
      status: "submitted_to_pg_support",
    });
    localStorage.setItem(key, JSON.stringify(list));
    // also log on action timeline as a non-accept event
    const actions = loadActions(merchant.id);
    actions.push({
      id: uid("act"),
      method: state.method,
      accepted: false,
      cause: "Request review — merchant disputes surfaced diagnosis/action",
      suggestedAction: "Escalated to PG support",
      fault: "Under review",
      diagnosis: m.status.id,
      note: $("reviewNote").value.trim(),
      createdAt: `${SR_TODAY}T10:40:00+05:30`,
      viewedAt: sessionStorage.getItem(`sr_viewed_${merchant.id}_${state.method}`),
      reversedAt: null,
    });
    saveActions(merchant.id, actions);
    root.innerHTML = "";
    toast("Review requested — PG support ticket path opened");
    render();
  };
}

/* ---------- Boot ---------- */
(function boot() {
  const session = loadSession();
  if (session?.merchantId && getMerchant(session.merchantId)) {
    state.merchantId = session.merchantId;
    state.view = "overview";
  }
  render();
})();
