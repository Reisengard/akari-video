export type MotionMark = 'Keyframe' | 'In/out' | 'Canvas';

export function itemMotionMarks(input: {
    keyframes?: readonly Record<string, unknown>[];
    motion?: Record<string, unknown>;
    canvasMotion?: boolean;
}, property: string): MotionMark[] {
    const marks: MotionMark[] = [];
    const hasKeyframe = input.keyframes?.some(point => {
        const seat = property.startsWith('transform.') ? point.transform : point[property];
        return property.startsWith('transform.')
            ? !!seat && typeof seat === 'object' && property.slice(10) in seat
            : seat !== undefined;
    });
    if (hasKeyframe) marks.push('Keyframe');
    if (input.motion?.in || input.motion?.out || input.motion?.loop) marks.push('In/out');
    if (input.canvasMotion) marks.push('Canvas');
    return marks;
}
