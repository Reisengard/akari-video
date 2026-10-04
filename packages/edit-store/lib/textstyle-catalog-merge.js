"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerLibraryTextstylePresets = registerLibraryTextstylePresets;
exports.registeredLibraryTextstylePresets = registeredLibraryTextstylePresets;
exports.resolveTextstyleCatalog = resolveTextstyleCatalog;
const textstyle_catalog_1 = require("./generated/textstyle-catalog");
let registered = [];
function registerLibraryTextstylePresets(presets) {
    registered = [...presets];
}
function registeredLibraryTextstylePresets() {
    return [...registered];
}
function resolveTextstyleCatalog({ builtin = textstyle_catalog_1.TEXTSTYLE_CATALOG, library = registered } = {}) {
    const catalog = { ...builtin };
    const conflicts = [];
    const warnings = [];
    for (const preset of library) {
        if (Object.prototype.hasOwnProperty.call(builtin, preset.id)) {
            conflicts.push(preset.id);
            warnings.push(`captions.style-preset-library-shadowed: ${preset.id} comes from the library, but a built-in preset has the same id, so the built-in preset is used.`);
        }
        else if (!Object.prototype.hasOwnProperty.call(catalog, preset.id)) {
            catalog[preset.id] = preset;
        }
    }
    return { catalog, conflicts, warnings };
}
