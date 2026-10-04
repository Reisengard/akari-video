export const GENERATE_USAGE = [
  "Usage: akari generate <still|video|resume> ...",
  "  still   Make a still or a text card from a beat sheet",
  "  video   Replace a still clip with video",
  "  resume  Fetch a generation job that is still running",
].join("\n");

export const STILL_USAGE = [
  "Usage: akari generate still <projectDir> --spec <beats.json> [options]",
  '  Save a video plan on a beat with video: { "prompt"?: string, "last"?: "next" | "<beat id>" | null }',
  '  first_frame is that beat\'s image. last: "next" is the next beat\'s image (not valid on the last beat)',
  "  A beat without video stays an image. video --item uses the footage meta next (--inputs wins)",
  "  --parallel N   How many Codex jobs run at once (default: 4)",
  "  --placeholder  Make a text card and do not call Codex",
  "  --dry-run      Show the planned paths and do not write",
  "  --json         Print the result as JSON",
  "  --help         Show this help",
].join("\n");
