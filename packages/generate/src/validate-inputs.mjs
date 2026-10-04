import {
  SlotInputError,
  normalizeInputs,
  normalizeOutput,
  referenceSeconds,
} from './slots.mjs';

import { resolveSendSide } from './send-side.mjs';

const EPSILON = 1e-9;

function fmt(value) {
  return Number(value.toFixed(3)).toString();
}

function durationFmt(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

function addReferenceMessages(messages, references, capability, slot, label) {
  const count = references.length;
  if (Number.isFinite(capability?.max) && count > capability.max) {
    messages.push({
      level: 'error',
      code: `${slot}.max`,
      text: `${label}: up to ${fmt(capability.max)} (got ${fmt(count)})`,
    });
  }

  const seconds = references.map(referenceSeconds).filter((value) => value !== null);
  if (Number.isFinite(capability?.seconds_each) && seconds.length > 0) {
    const maximum = Math.max(...seconds);
    if (maximum > capability.seconds_each) {
      messages.push({
        level: 'error',
        code: `${slot}.seconds_each`,
        text: `${label}: up to ${fmt(capability.seconds_each)} seconds each (got ${fmt(maximum)} seconds)`,
      });
    }
  }

  if (Number.isFinite(capability?.seconds_total)) {
    const total = seconds.reduce((sum, value) => sum + value, 0);
    if (total > capability.seconds_total) {
      messages.push({
        level: 'error',
        code: `${slot}.seconds_total`,
        text: `${label}: up to ${fmt(capability.seconds_total)} seconds in total (got ${fmt(total)} seconds)`,
      });
    }
  }
}

function coveringEnum(value, values) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered.find(candidate => candidate >= value) ?? ordered.at(-1);
}

function roundHalfDown(value) {
  const floor = Math.floor(value);
  return Math.abs(value - floor - 0.5) <= EPSILON ? floor : Math.round(value);
}

function roundedDuration(value, duration) {
  if (duration.kind === 'enum') {
    return { value: coveringEnum(value, duration.values), reason: 'enum' };
  }

  if (duration.kind === 'range') {
    const clamped = Math.min(duration.max, Math.max(duration.min, value));
    const wasClamped = Math.abs(clamped - value) > EPSILON;
    let result = clamped;
    if (typeof duration.step === 'number' && duration.step > 0) {
      const steps = roundHalfDown((clamped - duration.min) / duration.step);
      result = duration.min + steps * duration.step;
    }
    result = Math.min(duration.max, Math.max(duration.min, result));
    return { value: result, reason: wasClamped ? 'clamp' : 'step' };
  }

  return { value, reason: null };
}

function durationMessage(model, from, to) {
  const duration = model.duration;
  const family = model.family ?? model.id;
  const allowed = duration.kind === 'enum'
    ? `${duration.values.map(durationFmt).join(' / ')} seconds only`
    : `${durationFmt(duration.min)}-${durationFmt(duration.max)} seconds`;
  const difference = Math.abs(from - to);
  const suffix = difference > 0.5 ? `. Difference ${durationFmt(difference)} seconds` : '';
  return `Rounded duration ${durationFmt(from)}s to ${durationFmt(to)}s (${family} allows ${allowed})${suffix}`;
}

export function validateInputs({ inputs, output, model }) {
  if (model == null) {
    throw new SlotInputError('model.required', 'model (a catalog row) is required');
  }

  const { inputs: selectedInputs, side } = resolveSendSide(inputs);
  const normalizedInputs = normalizeInputs(selectedInputs);
  const requestedOutput = normalizeOutput(output);
  const usedDefaultDuration = requestedOutput.duration_s === null;
  const normalizedOutput = {
    ...requestedOutput,
    duration_s: usedDefaultDuration ? model.duration.default : requestedOutput.duration_s,
  };

  if (model.audio_out === 'always') normalizedOutput.audio_out = true;
  else if (model.audio_out === false) normalizedOutput.audio_out = false;
  else normalizedOutput.audio_out = requestedOutput.audio_out ?? true;

  const messages = [];
  const modelInputs = model.inputs;

  if (modelInputs.first_frame === 'required' && !normalizedInputs.first_frame) {
    messages.push({ level: 'error', code: 'first_frame.required', text: 'This model requires a first frame' });
  } else if (modelInputs.first_frame === 'none' && normalizedInputs.first_frame) {
    messages.push({
      level: 'error',
      code: 'first_frame.unsupported',
      text: 'This model cannot use a first frame. Remove it, or switch to a model that accepts one',
    });
  }

  if (modelInputs.last_frame === 'required' && !normalizedInputs.last_frame) {
    messages.push({ level: 'error', code: 'last_frame.required', text: 'This model requires a last frame' });
  } else if (modelInputs.last_frame === 'none' && normalizedInputs.last_frame) {
    messages.push({
      level: 'error',
      code: 'last_frame.unsupported',
      text: 'This model cannot use a last frame. Remove it, or switch to a model that accepts one',
    });
  }

  const hasFrames = normalizedInputs.first_frame !== null || normalizedInputs.last_frame !== null;
  const hasReferences = normalizedInputs.reference_images.length > 0
    || normalizedInputs.reference_videos.length > 0
    || normalizedInputs.reference_audios.length > 0;
  if (!hasFrames && !hasReferences && !normalizedInputs.prompt?.trim()) {
    messages.push({ level: 'error', code: 'prompt.required', text: 'A prompt or an image is required' });
  }
  if (modelInputs.frames_and_refs_exclusive === true && hasFrames && hasReferences) {
    messages.push({
      level: 'error',
      code: 'frames_refs.exclusive',
      text: 'This model cannot use frames and references together. Use one of them',
    });
  }

  addReferenceMessages(messages, normalizedInputs.reference_images, modelInputs.reference_images, 'reference_images', 'Reference images');
  addReferenceMessages(messages, normalizedInputs.reference_videos, modelInputs.reference_videos, 'reference_videos', 'Reference videos');
  addReferenceMessages(messages, normalizedInputs.reference_audios, modelInputs.reference_audios, 'reference_audios', 'Reference audio');

  if (modelInputs.negative_prompt === false && normalizedInputs.negative_prompt) {
    messages.push({
      level: 'error',
      code: 'negative_prompt.unsupported',
      text: 'This model does not accept a negative prompt',
    });
  }

  if (normalizedInputs.camera) {
    const notation = normalizedInputs.camera.notation;
    const accepted = modelInputs.camera;
    if (notation !== 'prose' && notation !== accepted) {
      messages.push({
        level: 'info',
        code: 'camera.notation_fallback',
        text: `This model does not accept camera notation ${notation}. It is rewritten as prose and merged into the prompt`,
      });
      normalizedInputs.camera.notation = 'prose';
    }
  }

  const allowedExtra = new Set(modelInputs.extra_allowed ?? []);
  for (const key of Object.keys(normalizedInputs.extra)) {
    if (!allowedExtra.has(key)) {
      messages.push({
        level: 'error',
        code: 'extra.not_allowed',
        text: `This model does not accept extra.${key}`,
      });
      delete normalizedInputs.extra[key];
    }
  }

  if (model.seed === false && normalizedInputs.seed !== null) {
    messages.push({
      level: 'info',
      code: 'seed.unsupported',
      text: 'This model does not accept seed. The seed is not sent',
    });
    normalizedInputs.seed = null;
  }

  if (normalizedOutput.resolution !== null) {
    if (!Array.isArray(model.resolutions) || model.resolutions.length === 0) {
      messages.push({
        level: 'error',
        code: 'resolution.invalid',
        text: `Resolution ${normalizedOutput.resolution} is not available on this model (this model has no resolution choice)`,
      });
    } else if (!model.resolutions.includes(normalizedOutput.resolution)) {
      messages.push({
        level: 'error',
        code: 'resolution.invalid',
        text: `Resolution ${normalizedOutput.resolution} is not available on this model (${model.resolutions.join(' / ')})`,
      });
    }
  }

  if (normalizedOutput.aspect !== null) {
    if (!Array.isArray(model.aspects) || model.aspects.length === 0) {
      messages.push({
        level: 'error',
        code: 'aspect.invalid',
        text: `Aspect ratio ${normalizedOutput.aspect} is not available on this model (this model has no aspect-ratio choice)`,
      });
    } else if (!model.aspects.includes(normalizedOutput.aspect)) {
      messages.push({
        level: 'error',
        code: 'aspect.invalid',
        text: `Aspect ratio ${normalizedOutput.aspect} is not available on this model (${model.aspects.join(' / ')})`,
      });
    }
  }

  let rounded = null;
  if (!usedDefaultDuration) {
    const result = roundedDuration(requestedOutput.duration_s, model.duration);
    if (Math.abs(result.value - requestedOutput.duration_s) > EPSILON) {
      rounded = {
        duration_s: {
          from: requestedOutput.duration_s,
          to: result.value,
          reason: result.reason,
        },
      };
      normalizedOutput.duration_s = result.value;
      messages.push({
        level: 'warn',
        code: 'duration.rounded',
        text: durationMessage(model, requestedOutput.duration_s, result.value),
      });
    }
  }

  const unit = model.price?.by_resolution?.[normalizedOutput.resolution ?? ''];
  let cost;
  if (Number.isFinite(unit)) {
    const audioMultiplier = normalizedOutput.audio_out
      ? (model.price.audio_multiplier ?? 1)
      : 1;
    cost = {
      estimate_usd: Number((unit * normalizedOutput.duration_s * audioMultiplier).toFixed(4)),
      as_of: model.as_of ?? null,
      source: 'estimate',
    };
  } else {
    cost = { estimate_usd: null, needs_explicit_confirm: true };
    messages.push({
      level: 'warn',
      code: 'price.unknown',
      text: 'No estimate (no price on record). An explicit confirmation is required before running',
    });
  }

  return {
    ok: !messages.some((message) => message.level === 'error'),
    normalized: { inputs: normalizedInputs, output: normalizedOutput },
    send_side: side,
    references: Object.fromEntries(['reference_images', 'reference_videos', 'reference_audios'].map((slot) => [slot, {
      count: normalizedInputs[slot].length,
      max: modelInputs[slot]?.max ?? null,
      seconds_total: normalizedInputs[slot].reduce((sum, reference) => sum + (referenceSeconds(reference) ?? 0), 0),
      max_seconds_total: modelInputs[slot]?.seconds_total ?? null,
    }])),
    rounded,
    messages,
    cost,
  };
}
