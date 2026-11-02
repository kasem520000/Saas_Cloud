// PHASE-025 T4b — report-hammer noisy-neighbor check.
// STATUS: SCAFFOLD — staging-only. One tenant hammers report renders while
// others' p95 must stay within budget (quota enforcement, ADR-0011 isolation).
import http from "k6/http";

export const options = {
  vus: 20,
  duration: "15m",
  thresholds: {
    "http_req_duration{route:report}": ["p(95)<8000"],
    "http_req_duration{route:doclist}": ["p(95)<500"], // neighbors unaffected
  },
};

export default function () {
  const base = __ENV.API_BASE;
  const token = __ENV.HAMMER_TOKEN;
  http.post(`${base}/api/reports/render`, JSON.stringify({ template: "trial_balance" }), {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    tags: { route: "report" },
  });
}
