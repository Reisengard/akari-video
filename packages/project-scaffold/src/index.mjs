import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

// 履歴に何を入れるかの単一の宣言（issue #48）。ここで別に書き起こすと、雛形とアプリ側の
// 除外規則が片方だけ育つ。相対パスなのは npm 配布 tarball の vendor ミラーでも同じ深さに
// 焼かれるため（akari-launcher/scripts/prepack.mjs の VENDOR_SOURCES）。
import { PROJECT_GITIGNORE } from '../../akari-launcher/src/history-policy.mjs';

const execFileAsync = promisify(execFile);

export { PROJECT_GITIGNORE };

const FALLBACK_CLAUDE_GUIDANCE = [
    '# AKARI Video project',
    '',
    '- `assets/` holds the footage: source video and audio. Do not rewrite or delete the originals.',
    '- `planning/` holds plans and reports, and `exports/` holds finished videos.',
    '- `.akari/sidecars/` holds analysis results, and `.akari/events/` holds the record of milestones in the work.',
    '- Add each milestone record as a new one. Do not change a record that already exists.',
    '- The editing skills are in `.claude/skills/` and are used by their plain names, such as `/analyze-footage`.',
    '- Entry points for other AI agents such as Codex and Cursor are in `.agents/skills/`, `.cursor/skills/`, and `.codex/skills/` (they are links to `.claude/skills/`).',
    '- When `status` in `.akari/intake.json` is `submitted`, follow the `tasks` / `target` / `autonomy` written there. When `autonomy` is `checkpoint` (the default), always check with the user at key points such as plan approval and before export. When `status` is `draft`, how to proceed is not settled yet, so settle it through the form or in conversation before you start work.',
    '- When you write how to proceed into `.akari/intake.json`, use only the five defined ids for `tasks`, and set `target` to either `duration_s` or `keep_length: true`, never both. Check with lint before you set `status` to `submitted`.',
    '- Explain things to the user in the user\'s language, with words such as "version history", "planning notes", and "footage", not the names of internal mechanisms.',
    '',
    'This file belongs to your project. Rewrite it freely.',
    ''
].join('\n');

const FALLBACK_AGENT_GUIDANCE = [
    '# How to work in an AKARI Video project',
    '',
    'Keep the originals in `assets/`. Put deliverables in `planning/` and `exports/`, and analysis results and milestone records in `.akari/`.',
    'Add milestone records to `.akari/events/` one at a time. Do not change a record that already exists.',
    '',
    'Use the skills by their plain names: `/analyze-footage`, `/edit-plan`, `/overlay-authoring`, `/setup-library`,',
    '`/harvest-asset`, and `/bake-3d`. To read the steps directly, open',
    '`.claude/skills/<skill name>/SKILL.md`.',
    'In harnesses such as Codex and Cursor, the same skills are discovered automatically from `.agents/skills/` / `.cursor/skills/` / `.codex/skills/`',
    '(symlinks to `.claude/skills/`).',
    '',
    'When `status` in `.akari/intake.json` is `submitted`, follow its `tasks` / `target` / `autonomy`.',
    'With `autonomy: checkpoint` (the default), check with the user at key points such as plan approval and before export.',
    'With `status: draft`, how to proceed is not settled yet, so settle it through the form or in conversation before you proceed.',
    'When you write how to proceed into `.akari/intake.json`, use only the five defined ids for `tasks`, and set `target` to either `duration_s` or `keep_length: true`, never both.',
    'Check with lint before you set `status` to `submitted`.',
    '',
    'Explain things to the user in the user\'s language, with words that convey the role, not the names of internal mechanisms.',
    'This guide belongs to this project. Rewrite it freely.',
    ''
].join('\n');

const FALLBACK_SKILLS_GUIDANCE = [
    '# このプロジェクトのスキル',
    '',
    '6 本の編集スキルはこのフォルダーに実体で入り、素の名前で使えます。',
    '各手順は `.claude/skills/<スキル名>/SKILL.md` から直接読めます。',
    '`.agents/skills/`、`.cursor/skills/`、`.codex/skills/` は他の AI エージェント用の入り口で、この実体への symlink です。',
    '`AKARI-SKILLS-VERSION` はプロジェクト作成時のスキル内容を示します。',
    'この案内と各スキルは、運用に合わせて自由に書き換えて構いません。',
    ''
].join('\n');

// 進め方フォームの保存先（packages/schemas/intake.schema.json v0 準拠）。
// 新規プロジェクトは常に status: draft・空 tasks で始まり、フォームまたは対話で確定する。
// title は人間向け表示名（task 2026-08-09-project-display-title）。フォルダ名とは独立で、
// 企画が固まった時点でエージェントが書く器として null で始める。
const FALLBACK_INTAKE = {
    version: 1,
    tasks: [],
    target: { duration_s: null, keep_length: false, taste: null },
    autonomy: 'checkpoint',
    status: 'draft',
    submitted_at: null,
    title: null
};

const FALLBACK_WORKFLOW = {
    version: 1,
    roles: [
        { path: 'assets', label: 'Footage', kind: 'assets' },
        { path: 'planning', label: 'Planning', kind: 'planning' },
        { path: 'exports', label: 'Export', kind: 'exports' }
    ],
    tree: {
        hidden: ['.claude', '.agents', '.codex', '.cursor', '.opencode', '.devin', '.akari', 'CLAUDE.md', 'AGENTS.md', '.gitignore', '.gitkeep'],
        sidecarSuffixes: ['.meta.json', '.decisions.json', '.analysis.json'],
        developerModePreference: 'akari.developerMode'
    },
    events: {
        directory: '.akari/events',
        gateTypes: ['report-generated', 'report-approved', 'edit-completed', 'export-completed']
    }
};

// 新規プロジェクトの edit.json 雛形。新規作成は常に v2 で、
// 素材投入前の空 sources / tracks も editV2 schema をそのまま満たす。
const FALLBACK_EDIT_JSON = {
    version: 2,
    output: { width: 1920, height: 1080, fps: 30, geometry: 'source' },
    sources: [],
    tracks: []
};

function portablePath(value) {
    return value.split(path.sep).join('/');
}

function isAlreadyExists(error) {
    return error && typeof error === 'object' && error.code === 'EEXIST';
}

async function runGit(root, args) {
    return execFileAsync('git', ['-C', root, ...args], {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
    });
}

export async function copyTemplateTree(sourceDir, destinationDir) {
    const copiedFiles = [];
    const skippedExisting = [];
    const skippedSymlinks = [];

    await fs.mkdir(destinationDir, { recursive: true });

    async function copyDirectory(source, destination, relativeDirectory) {
        for (const entry of await fs.readdir(source, { withFileTypes: true })) {
            const from = path.join(source, entry.name);
            const to = path.join(destination, entry.name);
            const relativePath = portablePath(path.join(relativeDirectory, entry.name));

            if (entry.isDirectory()) {
                await fs.mkdir(to, { recursive: true });
                await copyDirectory(from, to, relativePath);
            } else if (entry.isSymbolicLink()) {
                console.warn(`[akari-project] skipping template symbolic link: ${relativePath}`);
                skippedSymlinks.push(relativePath);
            } else if (entry.isFile()) {
                try {
                    await fs.writeFile(to, await fs.readFile(from), { flag: 'wx' });
                    copiedFiles.push(relativePath);
                } catch (error) {
                    if (!isAlreadyExists(error)) {
                        throw error;
                    }
                    skippedExisting.push(relativePath);
                }
            }
        }
    }

    await copyDirectory(sourceDir, destinationDir, '');
    return { copiedFiles, skippedExisting, skippedSymlinks };
}

export async function writeFallbackTemplate(destinationDir) {
    const writtenFiles = [];
    const skippedExisting = [];
    const files = {
        '.gitignore': PROJECT_GITIGNORE,
        'CLAUDE.md': FALLBACK_CLAUDE_GUIDANCE,
        'AGENTS.md': FALLBACK_AGENT_GUIDANCE,
        '.claude/settings.json': JSON.stringify({
            permissions: {
                allow: ['Read(./**)', 'Edit(./planning/**)', 'Edit(./exports/**)', 'Edit(./.akari/sidecars/**)', 'Edit(./.akari/events/**)'],
                deny: ['Edit(./assets/**)']
            }
        }, null, 2) + '\n',
        '.claude/skills/README.md': FALLBACK_SKILLS_GUIDANCE,
        '.opencode/config.json': JSON.stringify({
            name: "AKARI Video Project",
            version: "1.0.0",
            description: "AKARI Video プロジェクト設定",
            skills: {
                autoDiscover: true,
                path: "./skills"
            },
            hooks: {
                sessionStart: "./hooks/session-start.mjs"
            },
            project: {
                type: "akari-video",
                version: "0.1.0"
            }
        }, null, 2) + '\n',
        '.akari/workflow.json': JSON.stringify(FALLBACK_WORKFLOW, null, 2) + '\n',
        '.akari/intake.json': JSON.stringify(FALLBACK_INTAKE, null, 2) + '\n',
        'edit.json': JSON.stringify(FALLBACK_EDIT_JSON, null, 2) + '\n',
        'assets/.gitkeep': '',
        'planning/.gitkeep': '',
        'exports/.gitkeep': '',
        '.akari/events/.gitkeep': '',
        '.akari/sidecars/.gitkeep': '',
        '.akari/diffs/.gitkeep': ''
    };

    for (const [name, content] of Object.entries(files)) {
        const destination = path.join(destinationDir, name);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        try {
            await fs.writeFile(destination, content, { encoding: 'utf8', flag: 'wx' });
            writtenFiles.push(name);
        } catch (error) {
            if (!isAlreadyExists(error)) {
                throw error;
            }
            skippedExisting.push(name);
        }
    }

    return { writtenFiles, skippedExisting };
}

const SKILL_ADAPTER_DIRECTORIES = ['.agents', '.codex', '.cursor', '.opencode', '.devin'];

function isPermissionDenied(error) {
    return error && typeof error === 'object' && (error.code === 'EPERM' || error.code === 'EACCES');
}

async function copyDirectoryRecursive(fsImpl, source, destination) {
    await fsImpl.mkdir(destination, { recursive: true });
    for (const entry of await fsImpl.readdir(source, { withFileTypes: true })) {
        const from = path.join(source, entry.name);
        const to = path.join(destination, entry.name);
        if (entry.isDirectory()) {
            await copyDirectoryRecursive(fsImpl, from, to);
        } else if (entry.isSymbolicLink()) {
            console.warn(`[project-scaffold] skipping nested symbolic link during fallback copy: ${from}`);
        } else if (entry.isFile()) {
            await fsImpl.writeFile(to, await fsImpl.readFile(from));
        }
    }
}

/**
 * Creates `linkPath` as a directory symlink pointing at `target` (a path relative to
 * `linkPath`'s own directory). Windows without admin rights / developer mode denies plain
 * symlink creation (EPERM); junctions are the privilege-free NTFS alternative but require an
 * absolute target and only work within the same volume. If junction creation also fails
 * (e.g. cross-volume), falls back to a recursive copy so project creation still succeeds —
 * degraded (the adapter stops tracking future skill updates) but functional.
 */
export async function createSkillAdapterLink(target, linkPath, { fsImpl = fs, platform = process.platform } = {}) {
    try {
        await fsImpl.symlink(target, linkPath, 'dir');
        return { method: 'symlink' };
    } catch (error) {
        if (isAlreadyExists(error)) {
            throw error;
        }
        if (platform !== 'win32' || !isPermissionDenied(error)) {
            throw error;
        }
        const absoluteTarget = path.resolve(path.dirname(linkPath), target);
        try {
            await fsImpl.symlink(absoluteTarget, linkPath, 'junction');
            return { method: 'junction' };
        } catch (junctionError) {
            if (isAlreadyExists(junctionError)) {
                throw junctionError;
            }
            await copyDirectoryRecursive(fsImpl, absoluteTarget, linkPath);
            console.warn(`[project-scaffold] symlink and junction both failed for ${linkPath}; copied the skill directory instead (it will not reflect future skill updates)`);
            return { method: 'copy' };
        }
    }
}

async function copySkillsTree(source, destination) {
    await fs.mkdir(destination, { recursive: true });
    for (const entry of await fs.readdir(source, { withFileTypes: true })) {
        if (entry.name === '.gitkeep' || entry.name === '.DS_Store') {
            continue;
        }
        // dev-fixtures/ はスキル開発用のサンプル素材（例: skills/address-review/dev-fixtures/
        // 配下の edit.json）で、プロジェクトへ持ち込むとシェルの edit.json 探索が誤って拾う
        // （F10）。プロジェクトの .claude/skills/ には不要なため元栓として除外する。
        if (entry.isDirectory() && entry.name === 'dev-fixtures') {
            continue;
        }
        const from = path.join(source, entry.name);
        const to = path.join(destination, entry.name);
        if (entry.isDirectory()) {
            await copySkillsTree(from, to);
        } else if (entry.isSymbolicLink()) {
            console.warn(`[akari-project] skipping skill symbolic link: ${entry.name}`);
        } else if (entry.isFile()) {
            await fs.writeFile(to, await fs.readFile(from));
        }
    }
}

async function skillsSignature(source) {
    const hash = createHash('sha256');
    const walk = async (directory, relative) => {
        const entries = (await fs.readdir(directory, { withFileTypes: true }))
            .sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
            if (entry.name === '.gitkeep' || entry.name === '.DS_Store') {
                continue;
            }
            const absolute = path.join(directory, entry.name);
            const relativePath = relative ? `${relative}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                await walk(absolute, relativePath);
            } else if (entry.isFile()) {
                hash.update(relativePath);
                hash.update(await fs.readFile(absolute));
            }
        }
    };
    await walk(source, '');
    return hash.digest('hex').slice(0, 16);
}

export async function installProjectSkills(destinationDir, skillsSourceDir, schemasSourceDir) {
    const destination = path.join(destinationDir, '.claude', 'skills');
    await copySkillsTree(skillsSourceDir, destination);
    await fs.writeFile(
        path.join(destination, 'AKARI-SKILLS-VERSION'),
        `${await skillsSignature(skillsSourceDir)}\n`,
        'utf8'
    );

    if (schemasSourceDir) {
        const schema = JSON.parse(
            await fs.readFile(path.join(schemasSourceDir, 'analysis.schema.json'), 'utf8')
        );
        const provenance = '（この analysis.schema.json は packages/schemas/analysis.schema.json からプロジェクト作成時に installProjectSkills() が機械コピーしたものです。手編集しないでください。再生成するにはプロジェクトを作り直すか、スキルの再インストールを行ってください。）';
        schema.$comment = typeof schema.$comment === 'string'
            ? `${schema.$comment} ${provenance}`
            : provenance;
        const schemaDestination = path.join(destination, 'analyze-footage', 'references', 'analysis.schema.json');
        await fs.mkdir(path.dirname(schemaDestination), { recursive: true });
        await fs.writeFile(schemaDestination, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
    }
}

export async function installSkillAdapters(destinationDir, options = {}) {
    const { fsImpl = fs, platform = process.platform, env = process.env } = options;
    const skillsDir = path.join(destinationDir, '.claude', 'skills');
    const skillNames = (await fsImpl.readdir(skillsDir, { withFileTypes: true }))
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    const kitSkillsDir = path.join(env.AKARI_HOME || path.join(homedir(), '.akari'), 'kits', 'plugin', 'skills');
    let kitSkillNames = [];
    try {
        kitSkillNames = (await fsImpl.readdir(kitSkillsDir, { withFileTypes: true }))
            .filter(entry => entry.isDirectory() || entry.isSymbolicLink())
            .map(entry => entry.name);
    } catch (error) {
        if (!error || typeof error !== 'object' || error.code !== 'ENOENT') throw error;
    }

    const created = [];
    const skippedExisting = [];
    const degraded = [];
    const warnings = [];
    for (const adapter of SKILL_ADAPTER_DIRECTORIES) {
        const adapterDir = path.join(destinationDir, adapter, 'skills');
        await fsImpl.mkdir(adapterDir, { recursive: true });
        for (const name of skillNames) {
            const relativeName = `${adapter}/skills/${name}`;
            try {
                const { method } = await createSkillAdapterLink(
                    `../../.claude/skills/${name}`,
                    path.join(adapterDir, name),
                    { fsImpl, platform }
                );
                created.push(relativeName);
                if (method !== 'symlink') {
                    degraded.push({ name: relativeName, method });
                }
            } catch (error) {
                if (!isAlreadyExists(error)) {
                    throw error;
                }
                skippedExisting.push(relativeName);
            }
        }
        for (const name of kitSkillNames) {
            const relativeName = `${adapter}/skills/${name}`;
            if (skillNames.includes(name)) {
                warnings.push(`${relativeName}: kept the built-in skill and skipped the extension kit skill with the same name`);
                continue;
            }
            try {
                const { method } = await createSkillAdapterLink(
                    path.relative(adapterDir, path.join(kitSkillsDir, name)),
                    path.join(adapterDir, name),
                    { fsImpl, platform }
                );
                created.push(relativeName);
                if (method !== 'symlink') degraded.push({ name: relativeName, method });
            } catch (error) {
                if (!isAlreadyExists(error)) throw error;
                skippedExisting.push(relativeName);
            }
        }
    }
    return { created, skippedExisting, degraded, warnings };
}

export async function readSkillsVersion(destinationDir) {
    try {
        return (await fs.readFile(
            path.join(destinationDir, '.claude', 'skills', 'AKARI-SKILLS-VERSION'),
            'utf8'
        )).trim();
    } catch (error) {
        if (error && typeof error === 'object' && error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

export async function checkGitBoundary(destinationDir) {
    try {
        const { stdout } = await runGit(destinationDir, ['rev-parse', '--is-inside-work-tree']);
        if (stdout.trim() !== 'true') {
            return { eligibility: 'none', parentRoot: null };
        }
    } catch {
        return { eligibility: 'none', parentRoot: null };
    }

    const { stdout } = await runGit(destinationDir, ['rev-parse', '--show-toplevel']);
    const [parentRoot, destinationRoot] = await Promise.all([
        fs.realpath(stdout.trim()),
        fs.realpath(destinationDir)
    ]);
    if (parentRoot === destinationRoot) {
        return { eligibility: 'own-root', parentRoot: null };
    }
    return { eligibility: 'inside-parent-repository', parentRoot };
}

export async function commitInitialProject(destinationDir, message = 'Create project') {
    await runGit(destinationDir, ['init']);
    await runGit(destinationDir, ['add', '-A', '--', '.']);
    const { stdout } = await runGit(destinationDir, ['status', '--porcelain']);
    if (!stdout.trim()) {
        return { committed: false };
    }
    await runGit(destinationDir, [
        '-c', 'user.name=AKARI Video',
        '-c', 'user.email=local@akari.video',
        'commit', '-m', message
    ]);
    return { committed: true };
}

function firstErrorLine(error) {
    const detail = error && typeof error === 'object' && typeof error.stderr === 'string'
        ? error.stderr
        : error instanceof Error
            ? error.message
            : String(error);
    return detail.split(/\r?\n/, 1)[0].trim() || 'unknown error';
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function renderList(items, emptyText = 'None') {
    if (items.length === 0) {
        return `<p>${escapeHtml(emptyText)}</p>`;
    }
    return `<ul>${items.map(item => `<li><code>${escapeHtml(item)}</code></li>`).join('')}</ul>`;
}

export function renderReportHtml(report) {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AKARI Video project creation report</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; line-height: 1.6; }
    body { max-width: 960px; margin: 0 auto; padding: 2rem; }
    h1, h2 { line-height: 1.25; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: .4rem 1rem; }
    dt { font-weight: 700; }
    dd { margin: 0; overflow-wrap: anywhere; }
    code { overflow-wrap: anywhere; }
    section { margin-block: 2rem; }
  </style>
</head>
<body>
  <main>
    <h1>AKARI Video project creation report</h1>
    <dl>
      <dt>Created</dt><dd>${escapeHtml(report.createdAt)}</dd>
      <dt>Destination</dt><dd><code>${escapeHtml(report.destination)}</code></dd>
      <dt>Template used</dt><dd><code>${escapeHtml(report.templateDir)}</code></dd>
    </dl>
    <section>
      <h2>Copied files (${escapeHtml(report.copy.copiedFiles.length)})</h2>
      ${renderList(report.copy.copiedFiles)}
    </section>
    <section>
      <h2>Files filled in from the built-in fallback (${escapeHtml(report.fallback.writtenFiles.length)})</h2>
      ${renderList(report.fallback.writtenFiles)}
    </section>
    <section>
      <h2>Skipped symbolic links (${escapeHtml(report.copy.skippedSymlinks.length)})</h2>
      ${renderList(report.copy.skippedSymlinks)}
    </section>
    <section>
      <h2>Template version</h2>
      <p>${report.skillsVersion === null ? 'Not recorded' : `<code>${escapeHtml(report.skillsVersion)}</code>`}</p>
    </section>
    <section>
      <h2>Git setup</h2>
      <dl>
        <dt>Result</dt><dd>${report.git.action === 'initialized-and-committed' ? 'Done' : 'Skipped'}</dd>
        <dt>Repository check</dt><dd>${escapeHtml(report.git.eligibility)}</dd>
        <dt>Reason</dt><dd>${escapeHtml(report.git.reason)}</dd>
      </dl>
    </section>
  </main>
</body>
</html>
`;
}

export async function createProject(destinationDir, templateDir, options = {}) {
    const destination = path.resolve(destinationDir);
    const resolvedTemplateDir = path.resolve(templateDir);
    const reportPath = path.join(destination, '.akari', 'reports', 'create-project-report.html');

    await fs.mkdir(destination, { recursive: true });
    const copy = await copyTemplateTree(resolvedTemplateDir, destination);
    const fallback = await writeFallbackTemplate(destination);
    if (options.skillsSourceDir) {
        await installProjectSkills(destination, options.skillsSourceDir, options.schemasSourceDir);
        await installSkillAdapters(destination, { env: options.env });
    }
    const skillsVersion = await readSkillsVersion(destination);
    const boundary = await checkGitBoundary(destination);

    let action;
    let reason;
    if (boundary.eligibility === 'none') {
        try {
            await commitInitialProject(destination);
            action = 'initialized-and-committed';
            reason = 'Initialized git and created a single commit';
        } catch (error) {
            action = 'skipped';
            reason = `Skipped because git is not available. The project is put under git automatically the next time it is opened (${firstErrorLine(error)})`;
        }
    } else if (boundary.eligibility === 'own-root') {
        action = 'skipped';
        reason = 'Skipped git init because this folder is already a git repository';
    } else {
        action = 'skipped';
        reason = `Skipped git init because this folder is inside the parent repository ${boundary.parentRoot}`;
    }

    const report = {
        destination,
        templateDir: resolvedTemplateDir,
        createdAt: new Date().toISOString(),
        copy,
        fallback,
        skillsVersion,
        git: {
            eligibility: boundary.eligibility,
            parentRoot: boundary.parentRoot,
            action,
            reason
        },
        reportPath
    };

    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, renderReportHtml(report), 'utf8');

    return report;
}
