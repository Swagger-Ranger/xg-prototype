type IconName = 'bell' | 'gear' | 'robot' | 'sparkles' | 'check' | 'check-circle' | 'alert' | 'alert-triangle' | 'briefcase' | 'edit' | 'chevron-right' | 'arrow-right' | 'mic' | 'send' | 'x' | 'home' | 'wallet' | 'file-text' | 'grid' | 'user' | 'calendar' | 'log-out';
interface Props {
    name: IconName;
    color?: string;
    /** Stroke width in viewBox units (default 2). */
    weight?: number;
    /** Pixel size; mini-app uses rpx — pass numbers like 32, 36, 40. */
    size?: number;
}
export declare function Icon({ name, color, weight, size }: Props): import("react/jsx-runtime").JSX.Element;
export type { IconName };
//# sourceMappingURL=icons.d.ts.map