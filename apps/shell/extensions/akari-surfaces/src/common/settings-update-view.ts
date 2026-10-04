import {
    formatDownloadedBannerText, formatDownloadingBannerText, formatUpdaterFallbackText,
    ShellUpdaterEventKind, ShellUpdaterUiState
} from './shell-update-applier';

export interface SettingsUpdateView {
    label: string;
    detail: string;
    button: { kind: 'check' | 'restart'; label: string; disabled: boolean; primary: boolean };
    browserFallback: boolean;
}

/** 設定画面の更新行。イベントの解釈は shell-update-applier に委ね、ここでは表示だけを決める。 */
export function resolveSettingsUpdateView(input: {
    state: ShellUpdaterUiState;
    lastEventKind?: ShellUpdaterEventKind;
    currentVersion: string;
    lastChecked: string;
    downloadUrl?: string;
}): SettingsUpdateView {
    const { state, lastEventKind, currentVersion, lastChecked, downloadUrl } = input;
    const checked = `Last checked: ${lastChecked}`;
    if (state.downloaded && state.downloadedVersion) {
        return {
            label: `v${state.downloadedVersion} is ready`,
            detail: `${formatDownloadedBannerText(state)} Current v${currentVersion} · ${checked}`,
            button: { kind: 'restart', label: 'Restart to update', disabled: false, primary: true },
            browserFallback: false
        };
    }
    if (state.downloading && state.downloadingVersion) {
        return {
            label: `v${state.downloadingVersion} is downloading`,
            detail: `${formatDownloadingBannerText(state)} Current v${currentVersion} · ${checked}`,
            button: { kind: 'check', label: 'Downloading', disabled: true, primary: false },
            browserFallback: false
        };
    }
    if (state.failed) {
        return {
            label: state.failureReason ?? 'Could not check for updates. Wait a while and try again',
            detail: state.fallbackReason ? `${formatUpdaterFallbackText(state)} · ${checked}` : checked,
            button: { kind: 'check', label: 'Check again', disabled: false, primary: false },
            browserFallback: !!downloadUrl
        };
    }
    if (state.checkRequestedByUser || lastEventKind === 'checking-for-update') {
        return {
            label: 'Checking…', detail: checked,
            button: { kind: 'check', label: 'Check for updates', disabled: true, primary: false },
            browserFallback: false
        };
    }
    return {
        label: lastEventKind === 'update-not-available' ? `Up to date (v${currentVersion}）` : 'Updates can be checked',
        detail: checked,
        button: { kind: 'check', label: 'Check for updates', disabled: false, primary: false },
        browserFallback: false
    };
}
