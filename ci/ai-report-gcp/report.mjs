// AI-assisted release report — GCP variant.
//
// Same logic as ci/ai-report/report.mjs but uses Claude on Vertex AI
// instead of Amazon Bedrock. Authentication is automatic: when running on the
// Jenkins VM the service account credentials come from the GCP metadata server
// (Application Default Credentials). No API key is needed.
//
// This step must never block a release: on any error it prints a plain,
// rule-based report and exits 0.
//
// Usage: node report.mjs <reports-dir>

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';

const reportDir = process.argv[2] ?? 'reports';
const MODEL     = process.env.VERTEX_MODEL_ID || 'claude-opus-4-5';
const MAX_CHARS_PER_FILE = 20000;

const env = (k) => process.env[k] ?? 'n/a';

async function loadReports() {
  const files = (await readdir(reportDir).catch(() => [])).filter(
    (f) => /\.(txt|json|md)$/.test(f) && f !== 'release-summary.md',
  );
  const out = {};
  for (const f of files.sort()) {
    let text = await readFile(path.join(reportDir, f), 'utf8');
    if (f === 'gar-scan.json') {
      // Keep only what matters to a reviewer: counts + top findings.
      const scan = JSON.parse(text);
      const vulns = scan.package_vulnerability_summary?.vulnerabilities ?? {};
      text = JSON.stringify(
        {
          total_vulnerabilities: scan.image_summary?.vulnerability_occurrence_count ?? 0,
          counts: Object.fromEntries(
            Object.entries(vulns).map(([sev, items]) => [sev, items.length]),
          ),
          top_findings: Object.entries(vulns)
            .flatMap(([sev, items]) =>
              items.slice(0, 5).map((v) => ({
                id:  v.vulnerability?.vulnerability_id ?? 'unknown',
                severity: sev,
                package: v.vulnerability?.package_issue?.[0]?.affected_package ?? 'unknown',
              })),
            )
            .slice(0, 20),
        },
        null,
        1,
      );
    }
    if (text.length > MAX_CHARS_PER_FILE) {
      text = `[note: first ${text.length - MAX_CHARS_PER_FILE} characters omitted]\n` + text.slice(-MAX_CHARS_PER_FILE);
    }
    out[f] = text;
  }
  return out;
}

function header() {
  return [
    `# OneClick ERP — release ${env('IMAGE_TAG')}`,
    '',
    `- Build: #${env('BUILD_NUMBER')} (${env('BUILD_URL')})`,
    `- Commit: ${env('GIT_SHORT')} — ${env('COMMIT_MSG')} (by ${env('COMMIT_AUTHOR')})`,
    `- Image: ${env('IMAGE_URI')}`,
    '',
  ].join('\n');
}

function plainReport(reports, reason) {
  const checks = {
    'lint.txt':        'Lint',
    'typecheck.txt':   'Type check',
    'tests.txt':       'Unit tests',
    'integration.txt': 'Integration tests (real PostgreSQL)',
    'migrations.txt':  'Migration safety',
    'sast.txt':        'SAST',
    'sca.txt':         'SCA (dependencies)',
    'sonarqube.txt':   'SonarQube',
    'gar-scan.json':   'Container scan (Artifact Registry)',
  };
  const lines = Object.entries(checks)
    .filter(([f]) => f in reports)
    .map(([f, name]) => `- ${name}: passed`);
  const tests = /ℹ tests (\d+)[\s\S]*?ℹ pass (\d+)/.exec(reports['tests.txt'] ?? '');
  return [
    header(),
    '## Checks (all gates passed to reach this step)',
    ...lines,
    tests ? `\nTests: ${tests[2]}/${tests[1]} passing.` : '',
    '',
    `_Automatic summary unavailable (${reason}); this is the rule-based report._`,
  ].join('\n');
}

async function aiReport(reports) {
  // AnthropicVertex uses Application Default Credentials automatically.
  const client = new AnthropicVertex({
    projectId: process.env.GCP_PROJECT,
    region:    process.env.VERTEX_REGION || 'us-east5',
  });

  const evidence = Object.entries(reports)
    .map(([name, text]) => `<report name="${name}">\n${text}\n</report>`)
    .join('\n\n');

  const response = await client.messages.create({
    model:      MODEL,
    max_tokens: 1024,
    system:
      'You write release summaries for a release approver who is not reading the raw CI logs. ' +
      'Be factual and only use what is in the reports. Output GitHub-flavoured Markdown, at most about 250 words, with these sections: ' +
      '"Summary" (2-3 sentences: what is being released and whether it looks safe), ' +
      '"Quality gate" (one line per check with its result and key numbers), ' +
      '"Security" (dependency and container findings by severity; name any HIGH/CRITICAL items), ' +
      '"Risks to review before approving" (bullets; write "None found" if there are none). ' +
      'Never invent results for checks that have no report.',
    messages: [
      {
        role: 'user',
        content:
          `Release ${env('IMAGE_TAG')}, commit ${env('GIT_SHORT')}: "${env('COMMIT_MSG')}" by ${env('COMMIT_AUTHOR')}.\n\n` +
          `Pipeline check outputs:\n\n${evidence}`,
      },
    ],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!text) throw new Error(`empty response (stop_reason=${response.stop_reason})`);
  return `${header()}\n${text}\n\n_Summary written by ${MODEL} on Vertex AI from the pipeline reports. Always check the build log for detail._`;
}

const reports = await loadReports();
try {
  console.log(await aiReport(reports));
} catch (err) {
  console.error(`[ai-report-gcp] falling back to plain report: ${err.message}`);
  console.log(plainReport(reports, err.message.split('\n')[0]));
}
