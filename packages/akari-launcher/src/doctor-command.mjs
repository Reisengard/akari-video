import { doctorExitCode, resolveDoctorReport } from './runtime-diagnostics.mjs';

const usage = [
  'Usage: akari doctor [--json]',
  '',
  'Checks that the required parts exist, where each one is resolved from, and PATH.',
  '  --json  Print the diagnosis as one machine-readable object',
].join('\n');

export async function runDoctorCommand(argv, options = {}) {
  const log = options.log ?? ((line) => process.stdout.write(`${line}\n`));
  const error = options.error ?? ((line) => process.stderr.write(`${line}\n`));
  if (argv.includes('--help') || argv.includes('-h')) {
    log(usage);
    return { exitCode: 0 };
  }
  const unknown = argv.find((argument) => argument !== '--json');
  if (unknown) {
    error(`Unknown doctor option: ${unknown}\n${usage}`);
    return { exitCode: 2 };
  }

  const report = options.report ?? await (options.resolveReport ?? resolveDoctorReport)(options);
  if (argv.includes('--json')) log(JSON.stringify(report));
  else log(formatDoctorReport(report));
  return { exitCode: doctorExitCode(report.verdict), report };
}

export function formatDoctorReport(report) {
  const rows = [
    ['cli', 'ok', `v${report.cli.version} — ${report.cli.entry_path}`],
    ['node', report.cli.node?.runtime ?? 'unknown', report.cli.node
      ? `v${report.cli.node.version} — ${report.cli.node.exec_path}${report.cli.node.runtime === 'electron' ? ' (to use it as Node, call it with ELECTRON_RUN_AS_NODE=1)' : ''}`
      : 'No diagnostic information'],
    ['app_managed', report.app_managed.status, detail(report.app_managed.path, report.app_managed.version)],
    ['app_bundle', report.app_bundle.found ? 'found' : 'missing', detail(report.app_bundle.path, report.app_bundle.version)],
    ['render_cut', report.render_cut.origin, report.render_cut.path ?? 'not found'],
    ['edit_lint', report.edit_lint.origin, report.edit_lint.path ?? 'not found'],
    ['ffmpeg', report.ffmpeg.origin, report.ffmpeg.path ?? 'not found'],
    ['ffprobe', report.ffprobe.origin, report.ffprobe.path ?? 'not found'],
    ['gpu_export', report.gpu_export?.available ? 'ok' : 'unavailable', report.gpu_export?.reason ?? 'No diagnostic information'],
    ['fal_key', report.fal_key?.source ?? 'missing', report.fal_key?.source === 'env'
      ? 'FAL_KEY environment variable'
      : report.fal_key?.source === 'credentials.env'
        ? report.fal_key.credentials_path
        : 'Not in the environment and not in credentials.env'],
    ['Key location', report.fal_key?.location ?? 'none', 'new / old / both'],
    ['path', report.path.on_path ? 'ok' : 'missing', report.path.cli_shim_dir],
  ];
  const widths = [
    Math.max('Item'.length, ...rows.map((row) => row[0].length)),
    Math.max('Status'.length, ...rows.map((row) => row[1].length)),
  ];
  const lines = [
    'AKARI Video doctor',
    '',
    `${'Item'.padEnd(widths[0])}  ${'Status'.padEnd(widths[1])}  Details`,
    `${'-'.repeat(widths[0])}  ${'-'.repeat(widths[1])}  ${'-'.repeat(20)}`,
    ...rows.map((row) => `${row[0].padEnd(widths[0])}  ${row[1].padEnd(widths[1])}  ${row[2]}`),
    '',
    `Verdict: ${report.verdict}`,
  ];
  if (report.next_steps.length > 0) {
    lines.push('Next steps:');
    lines.push(...report.next_steps.map((step) => `  - ${step}`));
  }
  return lines.join('\n');
}

function detail(path, version) {
  const location = path ?? 'not found';
  return version ? `v${version} — ${location}` : location;
}
