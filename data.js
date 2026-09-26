const AREAS = [
  { id: "kyc", label: "Documentation & KYC" },
  { id: "api", label: "API integration" },
  { id: "reports", label: "Reports & reconciliation" },
  { id: "settlement", label: "Settlement a/c setup" },
  { id: "testTxn", label: "Test transaction" },
  { id: "goLive", label: "Go-live" },
  { id: "txnActive", label: "Transaction active" },
];

const STAGE_ORDER = [
  "Documentation & KYC",
  "API integration",
  "Reports & reconciliation",
  "Settlement a/c setup",
  "Test transaction",
  "Go-live",
  "Transaction active",
];

/**
 * Five sample merchants, roughly one per pipeline stage.
 * In a full product these fields would be pulled from KYC, creds,
 * recon, settlement, and switch systems.
 */
const merchants = [
  {
    id: "MID1001",
    name: "Sunrise Foods Pvt Ltd",
    am: "Ritika Shah",
    integrator: "Aman Verma",
    opsOwner: "Neha Kulkarni",
    currentStage: "Documentation & KYC",
    kyc: {
      identityTax: "done",
      entitySpecific: "wip",
      bankAccount: "pending",
    },
    api: {
      testCredentials: false,
      testApiHits: false,
      customizations: [],
    },
    reports: { status: "na" },
    settlement: {
      docsValidated: false,
      pennyDrop: false,
    },
    testTxn: { status: "tbd", plannedDate: "2026-10-20" },
    goLive: { ready: false },
    txnActive: { status: "not_live" },
  },
  {
    id: "MID1002",
    name: "Nova Retail LLP",
    am: "Vikram Iyer",
    integrator: "Sana Qureshi",
    opsOwner: "Neha Kulkarni",
    currentStage: "API integration",
    kyc: {
      identityTax: "done",
      entitySpecific: "done",
      bankAccount: "done",
    },
    api: {
      testCredentials: true,
      testApiHits: true,
      customizations: [
        { name: "Split settlements", status: "wip" },
        { name: "Custom webhook payload", status: "yes" },
      ],
    },
    reports: { status: "tbd_non_blocker" },
    settlement: {
      docsValidated: false,
      pennyDrop: false,
    },
    testTxn: { status: "tbd", plannedDate: "2026-10-12" },
    goLive: { ready: false },
    txnActive: { status: "not_live" },
  },
  {
    id: "MID1003",
    name: "Orbit Travel Co.",
    am: "Ritika Shah",
    integrator: "Aman Verma",
    opsOwner: "Priya Nair",
    currentStage: "Reports & reconciliation",
    kyc: {
      identityTax: "done",
      entitySpecific: "done",
      bankAccount: "done",
    },
    api: {
      testCredentials: true,
      testApiHits: true,
      customizations: [
        { name: "Refund auto-retry", status: "yes" },
        { name: "Multi-currency quote", status: "na" },
      ],
    },
    reports: { status: "wip" },
    settlement: {
      docsValidated: true,
      pennyDrop: false,
    },
    testTxn: { status: "tbd", plannedDate: "2026-10-08" },
    goLive: { ready: false },
    txnActive: { status: "not_live" },
  },
  {
    id: "MID1004",
    name: "Pixel Labs Pvt Ltd",
    am: "Mehul Desai",
    integrator: "Sana Qureshi",
    opsOwner: "Priya Nair",
    currentStage: "Test transaction",
    kyc: {
      identityTax: "done",
      entitySpecific: "done",
      bankAccount: "done",
    },
    api: {
      testCredentials: true,
      testApiHits: true,
      customizations: [
        { name: "EMI tenure mapping", status: "no_blocker" },
        { name: "Tokenized cards", status: "yes" },
      ],
    },
    reports: { status: "yes" },
    settlement: {
      docsValidated: true,
      pennyDrop: true,
    },
    testTxn: { status: "failed", plannedDate: "2026-09-24" },
    goLive: { ready: false },
    txnActive: { status: "no" },
  },
  {
    id: "MID1005",
    name: "Harbor Collective",
    am: "Vikram Iyer",
    integrator: "Aman Verma",
    opsOwner: "Neha Kulkarni",
    currentStage: "Transaction active",
    kyc: {
      identityTax: "done",
      entitySpecific: "done",
      bankAccount: "done",
    },
    api: {
      testCredentials: true,
      testApiHits: true,
      customizations: [
        { name: "Marketplace sub-merchants", status: "yes" },
      ],
    },
    reports: { status: "yes" },
    settlement: {
      docsValidated: true,
      pennyDrop: true,
    },
    testTxn: { status: "success", plannedDate: "2026-09-10" },
    goLive: { ready: true },
    txnActive: { status: "yes" },
  },
];
