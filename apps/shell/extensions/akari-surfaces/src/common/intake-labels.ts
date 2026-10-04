/**
 * 進め方フォーム（intake サーフェス）の表示ラベル定数。
 *
 * 表示語の正典は `packages/schemas/intake.schema.json` の
 * `x-akari-labels`（tasks）と `x-akari-autonomy-labels`（autonomy）。
 * このファイルは手動ミラーであり、表示語の変更時は両方を更新する。
 */

export type IntakeTaskId =
    | 'transcribe-captions'
    | 'silence-cut'
    | 'bgm-sfx'
    | 'narration'
    | '3d-inserts';

/** フォーム表示順（正本モック `mock-2026-07-21-shell-home-chat-first.html` の順）。 */
export const INTAKE_TASK_IDS: readonly IntakeTaskId[] = [
    'transcribe-captions',
    'silence-cut',
    'bgm-sfx',
    'narration',
    '3d-inserts'
];

export const INTAKE_TASK_LABELS: Readonly<Record<IntakeTaskId, string>> = {
    'transcribe-captions': 'Transcribe and captions',
    'silence-cut': 'Cut silences and NG takes',
    'bgm-sfx': 'BGM and sound effects',
    narration: 'Narration',
    '3d-inserts': '3D inserts'
};

/** モックの説明文（`<small>`）。schema には無い UI コピーなのでここが正。 */
export const INTAKE_TASK_DESCRIPTIONS: Readonly<Record<IntakeTaskId, string>> = {
    'transcribe-captions': 'Turn speech into captions, with backgrounds and line breaks for Japanese text',
    'silence-cut': 'Detect and trim silences and retakes. Adjust cuts afterward',
    'bgm-sfx': 'Choose music from the library to match the mood. Lower its volume during narration',
    narration: 'Generate speech from a script, including with a clone of your own voice',
    '3d-inserts': 'Insert footage into phone and computer screens'
};

/** 既定でチェック済みにする 2 件（モックの初期状態）。 */
export const INTAKE_TASK_DEFAULTS: readonly IntakeTaskId[] = ['transcribe-captions', 'silence-cut'];

export type IntakeDurationChoice = '15' | '30' | '60' | '180' | 'keep';

export const INTAKE_DURATION_LABELS: Readonly<Record<IntakeDurationChoice, string>> = {
    '15': '15 seconds',
    '30': '30 seconds',
    '60': '60 seconds',
    '180': 'Up to 3 minutes',
    keep: 'Keep original length'
};

export const INTAKE_DURATION_ORDER: readonly IntakeDurationChoice[] = ['15', '30', '60', '180', 'keep'];

export const INTAKE_DEFAULT_DURATION: IntakeDurationChoice = '30';

export function durationChoiceToTarget(choice: IntakeDurationChoice): { duration_s: number | null; keep_length: boolean } {
    if (choice === 'keep') {
        return { duration_s: null, keep_length: true };
    }
    return { duration_s: Number(choice), keep_length: false };
}

export type IntakeAutonomy = 'full-auto' | 'checkpoint' | 'collaborative';

export const INTAKE_AUTONOMY_LABELS: Readonly<Record<IntakeAutonomy, string>> = {
    'full-auto': 'As is',
    checkpoint: 'With suggestions',
    collaborative: 'Make it together'
};

export const INTAKE_AUTONOMY_DESCRIPTIONS: Readonly<Record<IntakeAutonomy, string>> = {
    'full-auto': 'Follow your instructions and export without review',
    checkpoint: 'Add suitable suggestions and show them. Remove anything unwanted. Review once before export',
    collaborative: 'Review key decisions about direction, footage, and execution'
};

export const INTAKE_AUTONOMY_ORDER: readonly IntakeAutonomy[] = ['full-auto', 'checkpoint', 'collaborative'];

export const INTAKE_DEFAULT_AUTONOMY: IntakeAutonomy = 'checkpoint';
