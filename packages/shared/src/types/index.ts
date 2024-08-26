export interface Point {
  left: number;
  top: number;
}

export interface Size {
  width: number;
  height: number;
}

export type Rect = Point & Size;
