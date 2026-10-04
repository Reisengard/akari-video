// packages/akari-launcher/src/kits.mjs の enableHint() が正本。この定数は UI 用の写し。
export const KIT_ENABLE_HINT = [
    'Enable the extension kit in Claude Code:',
    '  claude plugin marketplace add ~/.akari/kits',
    '  claude plugin install akari-kits@akari-kits',
    'If claude is not on PATH, add ~/.akari/kits as a marketplace in Claude Code plugin settings.'
].join('\n');
