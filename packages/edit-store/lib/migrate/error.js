"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyEditVersionError = void 0;
class LegacyEditVersionError extends Error {
    constructor(version) {
        super(`This project uses an older format (edit.json version ${version}). `
            + 'Convert it with `akari migrate <dir>` before opening. '
            + 'After the converter leaves the app, use `npx akari-migrate@<version> <dir>`.');
        this.version = version;
        this.name = 'LegacyEditVersionError';
    }
}
exports.LegacyEditVersionError = LegacyEditVersionError;
