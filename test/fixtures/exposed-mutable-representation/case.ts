export class SessionCache {
  private entries = new Map<string, string>();

  entriesView() {
    return this.entries;
  }

  get entriesReference() {
    return this.entries;
  }
}
