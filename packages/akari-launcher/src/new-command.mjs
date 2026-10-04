import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveLauncherAssets } from './repo-assets.mjs';

const usage = 'Usage: akari new <target-dir> [--template <path>]';

function parseArguments(args) {
    let target;
    let template;

    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];
        if (argument === '--template') {
            const value = args[index + 1];
            if (!value || value.startsWith('--')) {
                throw new Error(`${usage}\n--template requires a path.`);
            }
            template = value;
            index += 1;
        } else if (argument.startsWith('-')) {
            throw new Error(`${usage}\nUnknown option: ${argument}`);
        } else if (target === undefined) {
            target = argument;
        } else {
            throw new Error(`${usage}\nGive only one destination.`);
        }
    }

    if (target === undefined) {
        throw new Error(usage);
    }
    return { target, template };
}

async function directoryHasFile(directory, relativeFile) {
    if (!directory) return false;
    try {
        return (await fs.stat(path.join(directory, relativeFile))).isFile();
    } catch {
        return false;
    }
}

export async function runNewCommand(args, options = {}) {
    const log = options.log ?? ((line) => console.log(line));
    const logError = options.logError ?? ((line) => console.error(line));
    const cwd = options.cwd ?? process.cwd();
    const assets = options.assets ?? resolveLauncherAssets();

    if (args.includes('--help') || args.includes('-h')) {
        log(usage);
        return { exitCode: 0 };
    }

    let parsed;
    try {
        parsed = parseArguments(args);
    } catch (error) {
        logError(error instanceof Error ? error.message : String(error));
        return { exitCode: 1 };
    }

    const { target, template } = parsed;
    const targetDir = path.resolve(cwd, target);
    const templateDir = template ? path.resolve(cwd, template) : assets.templateDir;

    if (!templateDir) {
        logError('The project template was not found.');
        return { exitCode: 1 };
    }

    try {
        const templateStat = await fs.stat(templateDir);
        if (!templateStat.isDirectory()) {
            throw new Error('not a directory');
        }
    } catch {
        logError(`Template not found: ${templateDir}`);
        return { exitCode: 1 };
    }

    const skillsSourceDir = assets.skillsSourceDir;
    const hasSkills = await directoryHasFile(skillsSourceDir, 'analyze-footage/SKILL.md');
    if (!hasSkills) {
        logError(`The skill source was not found, so bundling skills is skipped: ${skillsSourceDir ?? 'not found'}`);
    }
    const schemasSourceDir = assets.schemasSourceDir;
    const hasSchemas = await directoryHasFile(schemasSourceDir, 'analysis.schema.json');

    if (!assets.scaffoldModulePath && !options.createProject) {
        logError('The project creation module was not found.');
        return { exitCode: 1 };
    }

    try {
        const createProject = options.createProject ?? await defaultCreateProject(assets.scaffoldModulePath);
        const result = await createProject(targetDir, templateDir, hasSkills
            ? { skillsSourceDir, schemasSourceDir: hasSchemas ? schemasSourceDir : undefined }
            : {});
        log(`Project created: ${result.destination}`);
        log(`Copied: ${result.copy.copiedFiles.length}`);
        log(`Filled in from the fallback: ${result.fallback.writtenFiles.length}`);
        log(`Skipped symbolic links: ${result.copy.skippedSymlinks.length}`);
        log(`Skills bundled: ${hasSkills ? `yes (${skillsSourceDir})` : 'skipped'}`);
        log(`git: ${result.git.action}`);
        log(`Creation report: ${result.reportPath}`);
        return { exitCode: 0, result };
    } catch (error) {
        logError(error instanceof Error ? error.message : String(error));
        return { exitCode: 1 };
    }
}

async function defaultCreateProject(scaffoldModulePath) {
    const { createProject } = await import(pathToFileURL(scaffoldModulePath).href);
    return createProject;
}
