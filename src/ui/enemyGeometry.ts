// How the map draws an enemy individual, in cells from its centre (SVG y grows downward).

export const avatarRadius = 0.36;
export const ringStroke = 0.05;
export const ringOuter = avatarRadius + ringStroke / 2;

export const stayBarWidth = 0.64;
export const stayBarHeight = 0.08;
const stayBarRise = 0.52;
const harmlessTagHeight = 0.22;
/** The 停留 bar's top edge; over a 無害 enemy it rises clear of the tag. */
export const stayBarTop = (harmless: boolean) =>
  -(stayBarRise + (harmless ? harmlessTagHeight : 0));
