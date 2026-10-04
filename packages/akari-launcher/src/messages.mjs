import { compareVersions } from './update-check.mjs';

const AUTONOMY_LABELS = {
  'full-auto': 'As is',
  checkpoint: 'With suggestions (default)',
  collaborative: 'Make it together'
};

/** channel が prerelease のときだけ付ける版名の注記（CLI・シェルで共通の規則）。 */
function channelSuffix(channel) {
  return channel === 'prerelease' ? ' (prerelease)' : '';
}

/**
 * `.akari/intake.json`（進め方フォーム）の状態を、利用者の言葉で 1 段落に要約する。
 */
export function describeIntake(intake, taskLabels) {
  if (!intake) {
    return 'There is no intake form (.akari/intake.json) yet.';
  }
  if (intake.status !== 'submitted') {
    return 'How to proceed is not settled yet (.akari/intake.json: draft). Settle what to do, the length, and how much to leave to the agent in the intake form or in conversation.';
  }

  const tasks = Array.isArray(intake.tasks) ? intake.tasks : [];
  const taskText = tasks.length > 0
    ? tasks.map((id) => taskLabels?.[id] ?? id).join(', ')
    : '(no tasks selected)';
  const autonomyText = AUTONOMY_LABELS[intake.autonomy] ?? intake.autonomy ?? 'not set';
  const target = intake.target ?? {};
  const targetText = target.keep_length
    ? 'keep the footage length'
    : typeof target.duration_s === 'number'
      ? `target length ${target.duration_s} s`
      : 'length not specified';

  return `How to proceed: ${taskText} / ${targetText} / autonomy: ${autonomyText}. Proceeding with this.`;
}

export function claudeMissingGuidance() {
  return [
    'The claude command was not found.',
    'Install Claude Code: https://claude.ai/install.sh',
    'After installing, run `akari` again in this folder.'
  ].join('\n');
}

export function opencodeMissingGuidance() {
  return [
    'The opencode command was not found.',
    'Install opencode: npm install -g opencode-ai',
    'After installing, run `akari --opencode` again in this folder.'
  ].join('\n');
}

/**
 * `akari` 起動時、claude 起動直前に出す 1 行通知（契約 §4-1）。
 * `checkForUpdateSync` が返す状態から組み立てる。新版が無ければ null。
 */
export function formatUpdateNotice(status) {
  if (!status?.available) {
    if (status?.mismatch) {
      return formatVersionMismatch(status);
    }
    return null;
  }
  const current = status.mismatch
    ? `CLI v${status.cliVersion} / app v${status.appVersion} → ${versionRelationLabel(status)}`
    : `current v${status.currentVersion}`;
  return `⬆ AKARI Video v${status.latestVersion}${channelSuffix(status.channel)} is available (${current}) → details: akari update`;
}

/** `akari doctor` 系出力に足す 1 行（現在版 + フィード取得状態）。 */
export function describeVersionStatus(versionOrInfo, cache, runtimeDiagnostics) {
  if (typeof versionOrInfo === 'string') {
    if (!cache?.feed) {
      return `Version: v${versionOrInfo} (update feed: not fetched)`;
    }
    const fetchedAt = typeof cache.fetched_at === 'string' ? cache.fetched_at : 'unknown';
    return `Version: v${versionOrInfo} (update feed: fetched, as of ${fetchedAt})`;
  }
  const info = normalizeVersionInfo(versionOrInfo);
  const installed = describeInstalledVersions(info, runtimeDiagnostics).join(' / ');
  if (!cache?.feed) {
    return `${installed} (update feed: not fetched)`;
  }
  const fetchedAt = typeof cache.fetched_at === 'string' ? cache.fetched_at : 'unknown';
  return `${installed} (update feed: fetched, as of ${fetchedAt})`;
}

export function describeInstalledVersions(versionOrInfo, runtimeDiagnostics) {
  const info = normalizeVersionInfo(versionOrInfo);
  if (info.installRefNeedsRepair) {
    const installRefPath = info.installRefPath ?? '~/.akari/app/.akari-install-ref';
    return [
      `CLI version: v${info.cliVersion}`,
      `The app version cannot be determined (\`${installRefPath}\` is damaged).`,
      'To repair it, run `akari update --force`.'
    ];
  }
  if (!info.appVersion) {
    if (info.installRefStatus === 'missing' && runtimeDiagnostics?.render_cut) {
      const renderCut = runtimeDiagnostics.render_cut;
      const availability = renderCut.origin === 'none'
        ? 'render-cut was not found, so export is not possible'
        : `export uses render-cut from ${humanRenderOrigin(renderCut.origin)}`;
      const lines = [
        `Current version: v${info.currentVersion}`,
        `CLI version: v${info.cliVersion}`,
        `The app from install.sh is not installed (${availability}. Details: \`akari doctor\`)`,
      ];
      if (renderCut.origin === 'none') {
        lines.push('To recover, install the desktop app or install the app with install.sh.');
      }
      return lines;
    }
    return [
      `Current version: v${info.currentVersion}`,
      `CLI version: v${info.cliVersion}`,
      `App version: not recorded (update checks fall back to CLI v${info.currentVersion})`
    ];
  }
  const lines = [`CLI version: v${info.cliVersion}`, `App version: v${info.appVersion} (the basis for update checks)`];
  if (info.mismatch) {
    lines.push(`Version mismatch: CLI v${info.cliVersion} / app v${info.appVersion} → ${versionRelationLabel(info)}`);
  }
  return lines;
}

function humanRenderOrigin(origin) {
  return origin === 'monorepo' ? 'the development repository' : origin;
}

export function describeForceReinstall(versionOrInfo, targetVersion) {
  const info = normalizeVersionInfo(versionOrInfo);
  return info.installRefNeedsRepair
    ? `--force: reinstalling the install.sh app, whose version cannot be determined → v${targetVersion}.`
    : `--force: reinstalling the install.sh app v${info.currentVersion} → v${targetVersion}.`;
}

function normalizeVersionInfo(value) {
  if (typeof value === 'string') {
    return { cliVersion: value, appVersion: null, currentVersion: value, mismatch: false };
  }
  return value;
}

function versionRelationLabel(info) {
  return compareVersions(info.appVersion, info.cliVersion) < 0 ? 'the app is older' : 'the CLI is older';
}

function formatVersionMismatch(info) {
  const relation = versionRelationLabel(info);
  const guidance = relation === 'the app is older'
    ? 'Update the app with `akari update`.'
    : 'Update the CLI with `npm i -g akari-video@latest`.';
  return `⚠ CLI v${info.cliVersion} / app v${info.appVersion} → ${relation}. ${guidance}`;
}

/**
 * 初回動線（作業場・creator-root）関連の 1 行メッセージ群（契約
 * `docs/contract-2026-08-02-creator-root-v1.md` §5）。既存の流儀に従い日本語・1 行主義。
 */

/** (a) 既存プロジェクトが作業場の中にある場合に添える 1 行。 */
export function creatorRootFoundNotice(rootDir) {
  return `Workspace: ${rootDir}`;
}

/** (b) 作業場の中だがプロジェクトではない cwd から新規プロジェクトを作るときの 1 行。 */
export function creatorRootNewProjectNotice(rootDir, projectDir) {
  return `Creating a new project in the workspace ${rootDir}: ${projectDir}`;
}

/** (c) 作業場を新規作成してプロジェクトを作るときの 1 行。 */
export function creatorRootCreatedNotice(rootDir, projectDir) {
  return `Workspace created: ${rootDir} (new project: ${projectDir})`;
}

/** (c) 作業場の作成でエラーが発生した場合の 1 行（このフォルダでの単体運用を続ける）。 */
export function creatorRootCreateFailedNotice(errorMessage) {
  return `Creating the workspace failed (continuing in this folder on its own): ${errorMessage}`;
}

/** (c) の TTY プロンプト文言。既定パスを 1 行で提示する。 */
export function creatorRootPromptText(defaultPath) {
  return `Create a workspace to start in? [Enter: ${defaultPath} / type a path / n: just try this folder] `;
}

/**
 * `akari update` の出力本文（複数行）。フィード未取得・最新・新版ありで案内が変わる。
 * `dismissed` は今回の実行で dismiss 記録を書いたかどうか（表示文言の切り替えのみに使う）。
 */
export function describeUpdateCommand({ currentVersion, versionInfo, cache, dismissed, usingCachedFeed = false, runtimeDiagnostics, npmAvailable = true }) {
  const info = versionInfo ?? normalizeVersionInfo(currentVersion);
  const lines = versionInfo ? describeInstalledVersions(info, runtimeDiagnostics) : [`Current version: v${currentVersion}`];
  const feed = cache?.feed;
  if (!feed) {
    lines.push('The latest information has not been fetched yet (you may be offline, or this may be right after the first launch).');
    lines.push('Wait a little and run `akari` again, and it will be checked next time.');
    return lines;
  }

  if (usingCachedFeed) {
    lines.push(describeUpdateCacheFallback(cache));
  }

  lines.push(`Latest version: v${feed.product}${channelSuffix(feed.channel)}`);
  if (feed.notes_url) {
    lines.push(`Release notes: ${feed.notes_url}`);
  }

  if (info.installRefNeedsRepair) {
    lines.push('The app version cannot be determined, so no update check is made.');
    return lines;
  }

  if (compareVersions(feed.product, info.currentVersion) <= 0) {
    lines.push('You are on the latest version.');
    return lines;
  }

  const tarballUrl = feed.components?.cli?.tarball?.url;
  if (npmAvailable) {
    lines.push('To update the CLI, run this command (it is not run for you):');
    lines.push(tarballUrl ? `  npm i -g ${tarballUrl}` : '  npm i -g akari-video@latest');
  } else {
    lines.push('npm is not on PATH, so the npm command for updating the CLI is not shown.');
  }
  lines.push(
    dismissed
      ? `Notices for this version (v${feed.product}) will no longer be shown.`
      : 'To stop notices for this version, run `akari update --dismiss`.'
  );
  return lines;
}

/** 明示 update の再取得失敗時に、参照するキャッシュの取得時刻を示す 1 行。 */
export function describeUpdateCacheFallback(cache) {
  const fetchedAt = typeof cache?.fetched_at === 'string' ? cache.fetched_at : 'an unknown time';
  return `The update feed could not be fetched, so the cache from ${fetchedAt} is shown.`;
}

/**
 * `akari init` の出力文言（タスク契約 launcher-init・内部リポ）。作業場
 * （creator-root）の作成・確認だけを行う入口コマンド専用。1 行主義の既存流儀に従う。
 */

/** 既存の作業場が見つかり、何も作らず確認しただけの場合の人間向け行。 */
export function initFoundNotice(rootDir) {
  return `Found the existing workspace: ${rootDir}`;
}

/** 新規に作業場を作成した場合の人間向け行。 */
export function initCreatedNotice(rootDir) {
  return `Workspace created: ${rootDir}`;
}

/** creator-root モジュールが解決できない場合のエラー（stderr 1 行。init にフォールバック先は無い）。 */
export function initModuleMissingError() {
  return 'The workspace module (creator-root) was not found.';
}

/** 作業場の初期化に失敗した場合のエラー（root.json 破損・未知 schema・書き込み不能など。stderr 1 行）。 */
export function initFailedError(errorMessage) {
  return `Initializing the workspace failed: ${errorMessage}`;
}

/**
 * 素材の取得方式案内 + 無料スターターパック（`akari store connect`）+ 公式音源ライブラリ
 * （AKARI Sounds）明示再入口（`akari sounds`）の文言群。1 行主義の既存流儀に従う。
 *
 * 2026-08-04 オーナー方針（正本: `planning/notes-2026-08-04-asset-reference-distribution.md`
 * §8）により、初回起動での AKARI Sounds 一括ダウンロード [Y/n] 質問（2026-08-03 裁定）は
 * 廃止した。素材は resolver がオンデマンド取得する設計に一本化されたため、質問文言
 * （`soundsPromptText` / `soundsDeclinedNotice`）はもう使わない。
 *
 * 2026-08-11 オーナー裁定（正本: 内部リポ `planning/notes-2026-08-11-onboarding-firstrun.md`
 * §3 R2）により、無料スターターパックの案内を同じ 1 回だけの通知に統合した（別画面を増やさない
 * ＝「1 画面 1 問まで」の精神）。件数は明記しない（実際のパック内容は入れ替わりうるため
 * 実数依存の表現にしない）。表示条件は `sounds-setup.mjs` の `maybeShowAssetIntroNotice` が
 * 持つ — 既にアカウント連携済みなら、この文言ごと表示をスキップする（連携ずみの人には
 * 「連携すると使える」という案内自体が的外れなため）。
 */

/** `akari` 起動時に生涯 1 回だけ出す素材案内（質問ではない・対話をブロックしない）。 */
export function assetIntroNotice() {
  return 'Assets (B-roll, backgrounds, audio) are fetched automatically when they are used, only as much as needed. There is also a free asset pack: link your account with `akari store connect` to use it. If you only want the audio in bulk, `akari sounds` downloads it all at once (this notice is not shown again).';
}

/** ダウンロード成功後の完了 + 追加カタログ（外部補完）の案内。`akari sounds` の完了時に使う。 */
export function soundsCompleteNotice() {
  return 'The official sound library is registered. Sounds it does not have (applause, fail sounds, Japanese-style hits, and so on) are in an additional catalog: ask in a session to "add the extra sounds too" and they are fetched for you.';
}

/** ダウンロード失敗時の 1 行（起動は止めない・再入口を示す）。 */
export function soundsFailedNotice() {
  return 'Downloading the sounds failed (continuing). You can retry later with `akari sounds`.';
}

/** `akari sounds`: セットアップスクリプトが同梱されていない場合のエラー（stderr 1 行）。 */
export function soundsUnavailableError() {
  return 'The sound setup script (audio-library-setup) was not found.';
}

/** `akari assets`: 素材 resolver（asset-resolver）が同梱されていない場合のエラー（stderr 1 行）。 */
export function assetsResolverUnavailableError() {
  return 'The asset resolver (asset-resolver) was not found. `akari assets` cannot be used.';
}

/**
 * `akari --help` / `akari -h`（Node CLI 版。npm 配布 `akari-video` パッケージの `akari`
 * コマンド）の出力（タスク契約 `2026-08-11-onboarding-o3-firstrun-plain` §4）。
 * `akari.sh` の `-h|--help` 出力と同じ「作る → プレビュー → 連携/素材 → 更新」の初心者目線の
 * 並びに揃え、開発者向けのフラグ・サブコマンドは末尾に降格する。プレビューサーバーは
 * シェル版（`akari.sh --preview`）専用の機能で npm 版の `akari` 単体には同梱されないため、
 * 案内が行き止まりにならないようその旨を明示する。
 */
export function describeCliHelp() {
  return [
    'AKARI Video — a video editing tool where AI does the editing',
    '',
    'Usage: akari [command] [options...]',
    '',
    'Common commands:',
    '  (no arguments)         Open the project and start the AI agent (created automatically if missing)',
    '  store connect          Link your account (the free asset pack and purchased assets become available)',
    '  sounds                 Download the official sound library in one go (free)',
    '  doctor [--json]        Diagnose whether the required parts exist and where they are resolved from',
    '  update [--force]       Check for updates (--force reinstalls the app that install.sh installs)',
    '  status                 Check the connection status',
    '  migrate [dir]          Convert an old edit.json to v2, with a backup',
    '  generate               Generate still-image clips from the beats of a script',
    '  storyboard             Make a printable storyboard from the timeline',
    '  akari clean [dir]      List and delete disposable intermediate files (lists only by default)',
    '',
    'For developers:',
    '  --opencode              Start opencode instead of Claude Code',
    '  --claude, --claudecode  Start Claude Code explicitly',
    '  -y, --yes               Auto-approve (skip confirmations)',
    '  --version, -v            Show the installed version',
    '  new <dir>                Create a new project from the template',
    '  init                     Only create or check the save folder (workspace)',
    '  narration / assets / internal / capability   For details of each: `akari <command> --help`',
    '  -h, --help               Show this help',
    '',
    'The preview server (the page you check in a browser) is only in the shell version: akari.sh --preview'
  ];
}
