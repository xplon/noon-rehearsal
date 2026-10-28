/** One sun for painted surfaces, architecture and the independent actor's projection. */
export const SUN={x:-13,y:14,z:-10} as const;
export const SHADOW_SLOPE={x:-SUN.x/SUN.y,z:-SUN.z/SUN.y} as const;
export const SHADOW_HEIGHT=.055;
