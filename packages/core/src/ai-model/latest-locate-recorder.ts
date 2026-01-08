interface ILocate {
  prompt: string;
  bbox: [number, number, number, number];
}

export class LatestLocateRecorder {
  latestLocate: ILocate | undefined = undefined;
  source = '';

  recordLocate(locate: ILocate, source: string) {
    this.latestLocate = locate;
    this.source = source;
  }

  getLatestLocate(): { locate: ILocate | undefined; source: string } {
    return {
      locate: this.latestLocate,
      source: this.source,
    };
  }
}
