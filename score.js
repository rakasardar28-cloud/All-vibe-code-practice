function band(pct) {
  if (pct > 60) return "green";
  if (pct >= 30) return "yellow";
  return "grey";
}

function checkPct(value) {
  if (value === true || value === "done" || value === "yes" || value === "success") return 100;
  if (value === "wip" || value === "failed") return 50;
  if (value === "na") return null;
  return 0;
}

function avg(values) {
  const usable = values.filter((v) => v !== null && v !== undefined);
  if (!usable.length) return 100;
  return Math.round(usable.reduce((a, b) => a + b, 0) / usable.length);
}

function kycPct(kyc) {
  return avg([
    checkPct(kyc.identityTax),
    checkPct(kyc.entitySpecific),
    checkPct(kyc.bankAccount),
  ]);
}

function apiPct(api) {
  const custom = api.customizations.length
    ? avg(api.customizations.map((c) => checkPct(c.status)))
    : 100;
  return avg([
    checkPct(api.testCredentials),
    checkPct(api.testApiHits),
    custom,
  ]);
}

function reportsPct(reports) {
  if (reports.status === "na") return null;
  if (reports.status === "yes") return 100;
  if (reports.status === "wip") return 50;
  return 0;
}

function settlementPct(s) {
  return avg([checkPct(s.docsValidated), checkPct(s.pennyDrop)]);
}

function testTxnPct(t) {
  return checkPct(t.status);
}

function goLivePct(g) {
  return g.ready ? 100 : 0;
}

function txnActivePct(t) {
  if (t.status === "yes") return 100;
  return 0;
}

function areaPercents(merchant) {
  return {
    kyc: kycPct(merchant.kyc),
    api: apiPct(merchant.api),
    reports: reportsPct(merchant.reports),
    settlement: settlementPct(merchant.settlement),
    testTxn: testTxnPct(merchant.testTxn),
    goLive: goLivePct(merchant.goLive),
    txnActive: txnActivePct(merchant.txnActive),
  };
}

function overallPct(merchant) {
  const areas = areaPercents(merchant);
  return avg(AREAS.map((a) => areas[a.id]));
}

function blockers(merchant) {
  const items = [];
  merchant.api.customizations.forEach((c) => {
    if (c.status === "no_blocker") {
      items.push({ area: "API integration", detail: `${c.name} — not done (go-live blocker)` });
    }
  });
  if (merchant.reports.status === "tbd_blocker") {
    items.push({ area: "Reports & reconciliation", detail: "Customer reports TBD (go-live blocker)" });
  }
  return items;
}

function kycLabel(v) {
  return { done: "Done", wip: "WIP", pending: "Pending" }[v] || v;
}

function customLabel(v) {
  return {
    na: "NA",
    yes: "Yes",
    wip: "WIP",
    no_blocker: "No — go-live blocker",
    no_non_blocker: "No — non-blocker",
  }[v] || v;
}

function reportsLabel(v) {
  return {
    na: "NA",
    yes: "Yes — done",
    wip: "Yes — WIP",
    tbd_blocker: "TBD — go-live blocker",
    tbd_non_blocker: "TBD — non-blocker",
  }[v] || v;
}

function testTxnLabel(t) {
  if (t.status === "success") return "Performed — success";
  if (t.status === "failed") return "Performed — failed";
  return `To be done — planned ${t.plannedDate}`;
}

function txnActiveLabel(v) {
  return { yes: "Yes", no: "No", not_live: "Not live yet" }[v] || v;
}

function scoredMerchant(merchant) {
  const areas = areaPercents(merchant);
  const overall = overallPct(merchant);
  return {
    ...merchant,
    areas,
    overall,
    band: band(overall),
    blockers: blockers(merchant),
  };
}
