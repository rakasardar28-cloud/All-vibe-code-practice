const scored = merchants.map(scoredMerchant);
let selectedId = scored[0].id;
let pieChart;

const bandColor = { green: "#1a9d6b", yellow: "#c99712", grey: "#8b95a1" };

function renderPipeline() {
  const counts = Object.fromEntries(STAGE_ORDER.map((s) => [s, 0]));
  scored.forEach((m) => {
    counts[m.currentStage] = (counts[m.currentStage] || 0) + 1;
  });
  document.getElementById("pipeline").innerHTML = STAGE_ORDER.map((stage) => {
    const n = counts[stage] || 0;
    return `<div class="stage ${n ? "active" : ""}"><strong>${n}</strong>${stage}</div>`;
  }).join("");
}

function renderCards() {
  document.getElementById("cards").innerHTML = scored
    .map((m) => {
      const blocker = m.blockers[0]
        ? `<div class="blocker">Blocker: ${escapeHtml(m.blockers[0].detail)}</div>`
        : "";
      return `
        <button class="card ${m.id === selectedId ? "selected" : ""}" data-id="${m.id}">
          <div class="card-head">
            <div>
              <h2>${escapeHtml(m.name)}</h2>
              <div class="mid">${escapeHtml(m.id)}</div>
            </div>
            <span class="stage-pill">${escapeHtml(m.currentStage)}</span>
          </div>
          <div class="meta">AM ${escapeHtml(m.am)} · Ops ${escapeHtml(m.opsOwner)}</div>
          <div class="progress ${m.band}"><i style="width:${m.overall}%"></i></div>
          <div class="pct-row"><span>Overall progress</span><b class="${m.band}">${m.overall}%</b></div>
          ${blocker}
        </button>`;
    })
    .join("");

  document.querySelectorAll(".card").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedId = btn.dataset.id;
      renderCards();
      renderDetail();
    });
  });
}

function subTag(pct) {
  if (pct === null) return `<span class="tag grey">NA</span>`;
  const b = band(pct);
  return `<span class="tag ${b}">${pct}%</span>`;
}

function boolRow(label, done) {
  const pct = done ? 100 : 0;
  return `<li><span>${label}</span>${subTag(pct)}</li>`;
}

function renderDetail() {
  const m = scored.find((x) => x.id === selectedId);
  const el = document.getElementById("detail");
  el.hidden = false;

  const customRows = m.api.customizations.length
    ? m.api.customizations
        .map(
          (c) =>
            `<li><span>${escapeHtml(c.name)} — ${escapeHtml(customLabel(c.status))}</span>${
              c.status === "no_blocker" ? `<span class="tag red">Blocker</span>` : subTag(checkPct(c.status))
            }</li>`
        )
        .join("")
    : `<li><span>No custom areas logged</span><span class="tag grey">NA</span></li>`;

  const blockerList = m.blockers.length
    ? m.blockers.map((b) => `<div class="blocker">${escapeHtml(b.detail)}</div>`).join("")
    : `<p class="meta">No go-live blockers on file.</p>`;

  el.innerHTML = `
    <div class="detail-head">
      <div>
        <h2 style="margin:0">${escapeHtml(m.name)}</h2>
        <p class="meta">${escapeHtml(m.id)} · Integrator ${escapeHtml(m.integrator)} · current stage: ${escapeHtml(m.currentStage)}</p>
      </div>
      <div>
        <div class="progress ${m.band}" style="width:220px"><i style="width:${m.overall}%"></i></div>
        <div class="pct-row"><span>Equal-weight overall</span><b class="${m.band}">${m.overall}%</b></div>
      </div>
    </div>
    ${blockerList}
    <div class="charts">
      <div class="pie-wrap"><canvas id="areaPie" aria-label="Area completion pie"></canvas></div>
      <div class="areas">
        ${areaBlock("Documentation & KYC", m.areas.kyc, `
          <li><span>Identity & tax — ${kycLabel(m.kyc.identityTax)}</span>${subTag(checkPct(m.kyc.identityTax))}</li>
          <li><span>Entity specific — ${kycLabel(m.kyc.entitySpecific)}</span>${subTag(checkPct(m.kyc.entitySpecific))}</li>
          <li><span>Bank a/c — ${kycLabel(m.kyc.bankAccount)}</span>${subTag(checkPct(m.kyc.bankAccount))}</li>
        `)}
        ${areaBlock("API integration", m.areas.api, `
          ${boolRow("Test credentials generated", m.api.testCredentials)}
          ${boolRow("Test API hits", m.api.testApiHits)}
          ${customRows}
        `)}
        ${areaBlock("Reports & reconciliation", m.areas.reports, `
          <li><span>Customer reports requirement — ${reportsLabel(m.reports.status)}</span>${
            m.reports.status === "tbd_blocker" ? `<span class="tag red">Blocker</span>` : subTag(m.areas.reports)
          }</li>
        `)}
        ${areaBlock("Settlement a/c setup", m.areas.settlement, `
          ${boolRow("A/c documentation validated", m.settlement.docsValidated)}
          ${boolRow("Penny drop", m.settlement.pennyDrop)}
        `)}
        ${areaBlock("Test transaction", m.areas.testTxn, `
          <li><span>${testTxnLabel(m.testTxn)}</span>${subTag(m.areas.testTxn)}</li>
        `)}
        ${areaBlock("Go-live", m.areas.goLive, `
          <li><span>${m.goLive.ready ? "Ready" : "Not ready"}</span>${subTag(m.areas.goLive)}</li>
        `)}
        ${areaBlock("Transaction active", m.areas.txnActive, `
          <li><span>${txnActiveLabel(m.txnActive.status)}</span>${subTag(m.areas.txnActive)}</li>
        `)}
      </div>
    </div>
  `;

  drawPie(m);
}

function areaBlock(title, pct, rows) {
  const shown = pct === null ? "NA" : `${pct}%`;
  const cls = pct === null ? "grey" : band(pct);
  return `<article class="area"><h3>${title}<span class="tag ${cls}">${shown}</span></h3><ul class="subs">${rows}</ul></article>`;
}

function drawPie(m) {
  const labels = [];
  const values = [];
  const colors = [];
  AREAS.forEach((a) => {
    const pct = m.areas[a.id];
    labels.push(`${a.label} (${pct === null ? "NA" : pct + "%"})`);
    values.push(1);
    colors.push(pct === null ? "#d5dbe3" : bandColor[band(pct)]);
  });

  const ctx = document.getElementById("areaPie");
  if (pieChart) pieChart.destroy();
  pieChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 1, borderColor: "#fff" }],
    },
    options: {
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
        title: { display: true, text: "Area completion", font: { size: 13 } },
      },
    },
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

renderPipeline();
renderCards();
renderDetail();
