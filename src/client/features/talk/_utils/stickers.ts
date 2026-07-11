import { STICKER_BASE } from "./constants";

export interface Sticker {
  id: number;
  image: string;
  sound: string;
}

export function buildStickers(ids: number[]): Sticker[] {
  return ids.map((id) => ({
    id,
    image: `${STICKER_BASE}/animation@2x/${id}@2x.png`,
    sound: `${STICKER_BASE}/sound/${id}.m4a`,
  }));
}
