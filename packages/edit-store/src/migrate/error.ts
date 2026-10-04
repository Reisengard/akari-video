export class LegacyEditVersionError extends Error {
    constructor(readonly version: number) {
        super(
            `This project uses an older format (edit.json version ${version}). `
            + 'Convert it with `akari migrate <dir>` before opening. '
            + 'After the converter leaves the app, use `npx akari-migrate@<version> <dir>`.'
        );
        this.name = 'LegacyEditVersionError';
    }
}
