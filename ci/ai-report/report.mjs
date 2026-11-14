// AI-assisted release report.
//
// Reads the output of every pipeline check from the reports folder and asks
// Claude (on Amazon Bedrock, authenticated by the Jenkins EC2 instance role)
// to write a short summary for the approver. Prints Markdown to stdout.
//
// This step must never block a release: on any error or refusal it prints a
// plain, rule-based report instead and exits 0.
//
// Usage: node report.mjs <reports-dir>

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';

const reportDir = process.argv[2] ?? 'reports';
const MODEL = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-opus-5-5';
const MAX_CHARS_PER_FILE = 20000;

const env = (k) => process.env[k] ?? 'n/a';

async function loadReports() {
  const files = (await readdir(reportDir).catch(() => [])).filter((f) => /\.(txt|json|md)$/.test(f) && f !== 'release-summary.md');
  const out = {};
  for (const f of files.sort()) {
    let text = await readFile(path.join(reportDir, f), 'utf8');
    if (f === 'ecr-scan.json') {
      // Keep only what matters to a reviewer: counts + finding names/severities.
      const scan = JSON.parse(text).imageScanFindings ?? {};
      text = JSON.stringify(
        {
          counts: scan.findingSeverityCounts ?? {},
          findings: (scan.findings ?? []).map((x) => ({ name: x.name, severity: x.severity, package: x.attributes?.find((a) => a.key === 'package_name')?.value })),
        },
        null,
        1,
      );
    }
    if (text.length > MAX_CHARS_PER_FILE) {
      // Long logs: keep the end (where results and failures are) and say so explicitly.
      text = `[note: first ${text.length - MAX_CHARS_PER_FILE} characters omitted]\n` + text.slice(-MAX_CHARS_PER_FILE);
    }
    out[f] = text;
  }
  return out;
}

function header() {
  return [
    `# OneClick ERP - release ${env('IMAGE_TAG')}`,
    '',
    `- Build: #${env('BUILD_NUMBER')} (${env('BUILD_URL')})`,
    `- Commit: ${env('GIT_SHORT')} - ${env('COMMIT_MSG')} (by ${env('COMMIT_AUTHOR')})`,
    `- Image: ${env('IMAGE_URI')}`,
    '',
  ].join('\n');
}

function plainReport(reports, reason) {
  const checks = {
    'lint.txt': 'Lint',
    'typecheck.txt': 'Type check',
    'tests.txt': 'Unit tests',
    'migrations.txt': 'Migration safety',
    'sast.txt': 'SAST',
    'sca.txt': 'SCA (dependencies)',
    'sonarqube.txt': 'SonarQube',
    'ecr-scan-summary.txt': 'Container scan (ECR)',
  };
  const lines = Object.entries(checks)
    .filter(([f]) => f in reports)
    .map(([f, name]) => `- ${name}: passed${f === 'ecr-scan-summary.txt' ? ` - severity counts ${reports[f].replace(/\s+/g, ' ').trim()}` : ''}`);
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
  const client = new AnthropicBedrockMantle({ awsRegion: process.env.AWS_REGION });

  const evidence = Object.entries(reports)
    .map(([name, text]) => `<report name="${name}">\n${text}\n</report>`)
    .join('\n\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: 'low' },
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

  if (response.stop_reason === 'refusal') throw new Error('model declined the request');
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!text) throw new Error(`empty response (stop_reason=${response.stop_reason})`);
  return `${header()}\n${text}\n\n_Summary written by ${MODEL} on Amazon Bedrock from the pipeline reports. Always check the build log for detail._`;
}

const reports = await loadReports();
try {
  console.log(await aiReport(reports));
} catch (err) {
  console.error(`[ai-report] falling back to plain report: ${err.message}`);
  console.log(plainReport(reports, err.message.split('\n')[0]));
}
