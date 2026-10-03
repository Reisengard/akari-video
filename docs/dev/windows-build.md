**English** | [Japanese](./windows-build.ja.md)

# Windows machine build checklist, Tier 0

A checklist you can copy and run from top to bottom to build, package, and launch the AKARI Video shell on a Windows machine. The shell is `apps/shell`, Theia plus Electron.

Use this checklist when you build this repository for the first time on a Windows machine. Assume x64. On an ARM64 machine, read each `x64` as `arm64`.

> Background. The viewer is not a new native implementation. It is Electron and Chromium `<video>` plus WebCodecs, so **you do not add a native viewer**. What still depends on macOS is the scripts around packaging. This checklist is how you check that a Windows build actually succeeds on top of that.

## Prerequisite check

- [ ] **Node.js.** Match the repository. Use **26.3.0**. `.github/workflows/ci.yml` pins `node-version: '26.3.0'`. A local development machine was also measured at v26.3.0. Install the Windows x64 installer from [nodejs.org](https://nodejs.org/), or run `winget install OpenJS.NodeJS`.
- [ ] **git.** A normal installer is enough. The repository root contains **several git-managed symlinks**, so do one of the following before `git clone`. If you clone without that, the symlinks turn into text files and break. That failure is a known gap, covered below.
      - On Windows 10 version 1703 or later, turn on Developer Mode, set `git config --global core.symlinks true`, and then clone. Or
      - clone from an elevated shell. That is the alternative for a machine that requires a privilege to create a symlink.
- [ ] **Visual Studio Build Tools, Python 3.x, and the Spectre-mitigated libraries. Treat these as required.** They were first written down as "basically unnecessary", and an on-device Windows check then showed they are required. Issues #6 and #8. drivelist stopped shipping a prebuilt at v6.4.3. From v11 on, the GitHub Releases assets are empty. Every Windows machine therefore falls through to a node-gyp source build. GitHub's Windows runners already have the tools, so CI does not show the failure.
      - In the Visual Studio Installer, select the "Desktop development with C++" workload.
      - Select the individual component **"MSVC v143 - VS 2022 C++ x64/x64 Spectre-mitigated libs (Latest)"**. Without it, the Theia build or package fails in the MSB8040 family. The failure is hard to separate from other errors. See the troubleshooting section below.
      - Python 3.x, from [python.org](https://www.python.org/) or `winget install Python.Python.3.12`.
- [ ] **Turn on long paths. Recommended. Issue #6.** From an elevated PowerShell:
      ```powershell
      New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" `
        -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
      ```
      This is **not** git `core.longpaths`. A normal build can still succeed while long paths are off. If a broken dependency tree nests deeply, `node_modules` then passes the MAX_PATH limit of 260 and cannot be deleted. See the troubleshooting section below.

### How native modules are handled. Checked on a machine, 2026-07-23

The native dependencies in this repository are `node-pty`, `drivelist`, `keytar`, `msgpackr-extract`, and `@parcel/watcher`. All of them are distributed through a prebuild-install style mechanism, or through npm `optionalDependencies`. What a machine check found:

| Package | Role | How win32-x64 is obtained |
|---|---|---|
| `node-pty` | Terminal, the PTY | The npm package **bundles** `prebuilds/win32-x64/{conpty,conpty_console_list}.node`. No download. |
| `drivelist` | Drive list | The `install` script tries `prebuild-install --runtime napi` first. **The v12 line has no prebuilt.** GitHub Releases stopped at v6.4.3, and from v11 on the assets are empty. It **always falls through to a node-gyp source build**. Confirmed on a machine in issue #6. |
| `keytar` | Credential storage | `prebuild-install \|\| npm run build` |
| `msgpackr-extract` | Faster msgpack | `node-gyp-build-optional-packages`, a prebuilt binary through npm `optionalDependencies` |
| `@parcel/watcher` | File watching. Theia uses it. | `optionalDependencies` names `@parcel/watcher-win32-x64` and `-win32-arm64`. npm selects one. |

A desk check on 2026-07-23 expected that a normal install would finish without a compiler. **An on-device Windows check on 2026-07-27, issue #6, refuted that.** drivelist always falls through to a source build, so `npm install` in practice requires VS Build Tools, Python, and the LTO-off environment from the build steps. In addition, `npm run package` rebuilds node-pty through `@electron/rebuild`, and that rebuild also needs the Spectre-mitigated libraries. Issue #8.

**ABI conversion for Electron.** `build.npmRebuild` in `apps/shell/package.json` is unset, so electron-builder's default `true` applies. When `npm run package` runs, which is `electron-builder --dir`, **`@electron/rebuild` checks every native module and fetches it again for the ABI of Electron 39.8.7**. That ABI is separate from the host Node.js ABI at `npm install` time. This is standard electron-builder behavior. No extra setting is required. A cross-build check on a Mac confirmed that `@electron/rebuild` itself runs. A Mac-to-Windows cross compile fails because of a node-gyp limit. That limit is specific to the Mac machine. It does not happen on a Windows machine.

## Build steps

Run every step with `apps/shell/` as the current directory.

```powershell
cd apps\shell

# 1. Install dependencies for apps/shell alone, with --no-workspaces.
#    apps/shell/package-lock.json has been a tracked file since 2026-08-19.
#    Unlike CI, do not pass --ignore-scripts.
#    An on-device build needs the real native modules.
#
#    Disabling LTO is required, issue #6. The official Windows node.exe is a
#    ClangCL build with thin LTO. node-gyp copies process.config, so every
#    native addon link is injected with /opt:lldltojobs=2, and MSVC link.exe
#    fails with LNK1117. drivelist has no prebuilt and always builds from
#    source, so every Windows machine needs this environment.
#    The same workaround is in CI, windows-build.yml.
$env:npm_config_enable_lto = 'false'
$env:npm_config_enable_thin_lto = 'false'
npm install --no-workspaces

# 1b. Check the electron binary, and place it directly if it is missing.
#     Issue #7. On Windows with Node 24 or later, electron's postinstall can
#     exit 0 with no output. The zip extract, extract-zip then yauzl, stops
#     its read stream, and node_modules\electron\dist is never created.
#     If you continue, the Theia build dies on an error that looks unrelated.
#     Check dist here. If it is missing, place the official release zip
#     directly. The same fix is in CI, windows-build.yml.
#     On an ARM64 machine, read x64 in the zip name as arm64.
#
#     Upstream, as of 2026-07-28, tracked in issue #7. The source of truth is
#     yauzl#176. thejoshwolfe/yauzl#177 was closed as a duplicate. Before
#     yauzl 3.3.1, destroy() on a node stream was used in a way that is
#     undefined behavior, and newer Node shows that as a stream callback that
#     never fires. The fix is on the v3 line only. It is not backported to v2.
#     electron's install.js goes through extract-zip 2.0.1 to yauzl ^2, so the
#     upstream fix waits on extract-zip, or on electron, bumping yauzl to v3.
#     Treat this direct placement as the lasting fix, not a temporary one.
if (-not (Test-Path node_modules/electron/dist/electron.exe)) {
  $v = node -p "require('./node_modules/electron/package.json').version"
  curl.exe -sSL -o electron.zip "https://github.com/electron/electron/releases/download/v$v/electron-v$v-win32-x64.zip"
  if (Test-Path node_modules/electron/dist) { Remove-Item -Recurse -Force node_modules/electron/dist }
  Expand-Archive electron.zip -DestinationPath node_modules/electron/dist -Force
  Remove-Item electron.zip
  Set-Content -NoNewline node_modules/electron/path.txt "electron.exe"
}
node -e "require('fs').accessSync('node_modules/electron/dist/electron.exe'); console.log('electron.exe OK')"

# 2. Build the extensions. TypeScript.
npm run build:ext

# 3. Build Theia itself. Production mode.
npm run build

# 4. Package. The --dir target means no installer, only an unpacked directory.
#    NSIS and other distribution forms are the second wave. They are outside
#    this checklist.
npm run package
```

`npm run package` runs the following order internally. These are the npm lifecycle hooks in `package.json`. `prepackage` runs `copy-native-helpers.mjs`, which bundles overlay-runtime, skills, schemas, and the project-default template. On win32 there is no extra copy for node-pty. The table above is why. The `.node` files alone are enough. It also runs `patch-ripgrep-asar-path.mjs`, which patches the bundled rgPath so it works with asar.unpacked. Issue #5. Next is `electron-builder --dir --win`, which runs `@electron/rebuild`, then the file copy, then asar generation. Then `postpackage` runs `verify-asar-contents.mjs`. That script checks that the extensions, skills, schemas, the project-default template, and the win32 native module for node-pty are inside `electron-builder-out/win-unpacked/resources/app.asar`. It also checks that ripgrep is unpacked on the `app.asar.unpacked` side and that the rgPath patch is applied. Issue #5. The same script warns, and does not block distribution, when the size is over the 1536MB guide.

On success you get `apps\shell\electron-builder-out\win-unpacked\AKARI Video.exe`.

## Tier 0 verification checklist

- [ ] Double-click `electron-builder-out\win-unpacked\AKARI Video.exe` and confirm it launches. **An unsigned build shows a SmartScreen warning.** That is a known gap, covered below. On an English Windows, choose More info, then Run anyway.
- [ ] After launch, create a new project from the app's Start screen, or open an existing project folder. A project is only a folder plus the event log under `.akari/events`. There is no separate install step.
- [ ] Load one video file and confirm native playback in the preview. The path is Chromium `<video>` plus WebCodecs. Check it with H.264 footage. For HEVC, see the known gaps.
- [ ] Confirm the timeline shows a clip thumbnail and a waveform. Both come through `ffmpeg`. If they do not appear, do the "Install ffmpeg" step immediately below, then restart the app. The waveform is drawn as a band along the bottom of the clip **when the footage has an audio stream**. To check the waveform on the audio-track side, put one wav or mp3 file in `audio.sfx` in `edit.json`. Footage whose amplitude is almost constant, such as a sine wave, draws a uniform band that is hard to see. For the check, use footage whose amplitude changes, such as a live recording. This correction comes from the separation work in issue #9.
- [ ] **Install ffmpeg.** Thumbnail generation, waveform generation, and audio-preview conversion all assume `ffmpeg` is **on PATH**. There is no bundled binary. The check is only that the binary exists. There is no version requirement. If it is not installed:
      ```powershell
      winget install "Gyan.FFmpeg"
      ```
      After install, open a new terminal or restart the app, so PATH is picked up. If `ffmpeg` is not found, the app disables the feature quietly and does not crash. The design is a notice that thumbnails and waveforms stay hidden because ffmpeg was not found.

## Known gaps

- **HEVC decode.** It depends on the GPU and OS codec extension on that machine. Many Windows setups do not include "HEVC Video Extensions" by default. In that case decode fails completely. There is no expected escape through a software fallback. A fallback that converts the file to an H.264 proxy is designed for the second wave and is not started. See the windows-port design plan in the internal repo.
- **Font look.** Captions currently depend on OS font fallback, such as Yu Gothic, so the look differs from macOS. It does not break. The look changes. Bundling Noto Sans JP is designed for the second wave and is not started.
- **codex and claude CLI integration, the akari-partner extension.** An environment where `claude` is on PATH is **confirmed working on a Windows machine**. Issue #9. The right-pane PTY reaches the CLI's trust-confirmation prompt. It works through conpty and the node-pty prebuild. **It also starts when the tool is not on PATH.** bootstrap-runner first looks up known install locations by absolute path, and reuses a binary it finds. The locations are `~/.local/bin`, `~/.claude/bin`, and `~/.claude/local`. On win32 the file name is `claude.exe`. Issue #9 confirmed this on a Windows machine. Remove the directory from PATH and `~\.local\bin\claude.exe` still starts. The bootstrap body that runs an installer is therefore entered only when none of those candidates exist. **That path is implemented on the win32 branch and is not yet verified on a machine.** The old sentence, that win32 throws, was written before the bootstrap implementation. It was updated after the on-device check in issue #9.
- **Unsigned distribution, and the SmartScreen warning.** The build is not code-signed, so Windows SmartScreen warns on the first launch. Signing for distribution, and an NSIS installer, are distribution work. They are outside this checklist, and they are work for the second wave or later.
- **How render-cut resolves Chrome and Playwright.** The Chrome executable search in `packages/render-cut` has a darwin branch that is hardcoded for macOS. win32 falls through to the Linux branch. The Playwright cache path and the binary-name pattern are then likely to disagree with Windows. Setting `CHROME_PATH` or `PUPPETEER_EXECUTABLE_PATH` is a likely workaround, and it is not verified. `packages/render-cut/**` was an edit-forbidden area for the task that wrote this checklist. A parallel task, `win-render-cut`, was going to take it, and at the time of writing that task was waiting.
- **Absolute-path checks.** Some checks for an absolute path on a footage source or an audio source assume `startsWith('/')`. A path of the form `C:\...` may not work. See `akari-preview-open-handler.ts`. `apps/shell/extensions/**` was an edit-forbidden area for the task that wrote this checklist.
- **`npm test`, which is `node --test test/*.mjs`.** It depends on the shell expanding the glob. `cmd.exe` on Windows does not expand `*`, so the run matches zero files. The same problem can happen from PowerShell, depending on how the Node-side script is invoked. Not verified. The build steps in this checklist do not go through `npm test`, so reaching Tier 0 is unaffected.

## Troubleshooting. Holes actually hit on a Windows machine

### If install fails once, delete node_modules and put the lockfile back to the tracked copy. Issue #6

A failed `npm install` can rewrite `apps\shell\package-lock.json` and pin a broken dependency tree. One example is `@theia/monaco-editor-core` not hoisted to the root, and nested in 13 places instead. A symptom is the Theia build's esbuild failing, and keeping on failing, with `Could not resolve "@theia/monaco-editor-core/esm/vs/editor/common/services/editorWebWorkerMain.js"`.

The lockfile has been tracked since 2026-08-19, so **put the file back to the tracked copy. Do not delete the file.** Deleting it recreates a lock that is not pinned.

```powershell
Remove-Item -Recurse -Force node_modules
git checkout -- package-lock.json
# Then set the LTO-off environment again and rerun npm install --no-workspaces.
```

### Failure on MSB8040, the Spectre-mitigated libraries. Issue #8

The visible form is `error MSB8040`, the project requires the Spectre-mitigated libraries. It shows up in two places.

- **`@vscode/windows-ca-certs`**, an `optionalDependency`. Install still exits 0, the package is **silently** dropped, and a later Theia build stops on `Could not resolve path of module: @vscode/windows-ca-certs [plugin @theia/esbuild-plugin]`. This is the representative case where the error text does not lead you to Spectre. The implementation resolves this package only on win32, so macOS and Linux do not show it.
- **node-pty**, during `@electron/rebuild` inside `npm run package`. It is not optional, so package fails for certain.

The lasting fix is the Spectre-mitigated library from the prerequisite check. If you only need to move verification forward, skip the node-pty rebuild with `npx electron-builder --dir -c.npmRebuild=false`. node-pty ships a NAPI prebuild, so the PTY still works. That matches the Tier 0 measurement in issue #9. Do not use the skip as the lasting setup.

### node_modules cannot be deleted because of a long path. Supplement to issue #6

On a machine with `LongPathsEnabled=0`, the Windows default, a nested `node_modules` that passes MAX_PATH 260 can no longer be deleted by ordinary tools. One symptom is WinError 145 from Python `shutil.rmtree`. An absolute path with the `\\?\` prefix can still delete it, for example `cmd /c rd /s /q "\\?\C:\path\to\node_modules"`. The lasting fix is to turn on `LongPathsEnabled`, from the prerequisite check.

### When npm holds install scripts back

On the CI runner's npm, the allow-scripts gate has been measured holding back install scripts such as electron's. See the comment in windows-build.yml. On npm 11.16 on a machine, there is also an observation that the warning is the only effect and the script still runs. Issue #7. The behavior depends on the environment. In either case, the direct placement in step 1b is the deterministic workaround for electron. If another native module is held back, approve it with `npm approve-scripts --no-workspaces <package-name...>` and then run `npm rebuild --no-workspaces`. That is the same fix CI uses.

## References

- The design source of truth is the windows-port design plan in the internal repo, `akari-video-internal`.
- On-device Windows verification records. Issue #5, packaged-build file search. Issue #6, install prerequisites. Issue #7, electron postinstall. Issue #8, Spectre. Issue #9, one pass of the Tier 0 checklist.
- The range this checklist verifies is Tier 0. The build succeeds, the app launches, and the basic features work. Distribution forms such as NSIS, code signing, and a Windows CI job are outside that range.
