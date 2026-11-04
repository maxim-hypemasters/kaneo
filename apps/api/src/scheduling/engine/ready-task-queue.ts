import type { PlanningTask } from "./types";

export class ReadyTaskQueue {
  private readonly items: PlanningTask[] = [];

  constructor(
    private readonly compare: (a: PlanningTask, b: PlanningTask) => number,
  ) {}

  push(item: PlanningTask) {
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.items[parent]!, item) <= 0) break;
      this.items[index] = this.items[parent]!;
      index = parent;
    }
    this.items[index] = item;
  }

  pop() {
    const result = this.items[0];
    const last = this.items.pop();
    if (!this.items.length || !last) return result;
    let index = 0;
    while (index * 2 + 1 < this.items.length) {
      const left = index * 2 + 1;
      const right = left + 1;
      const child =
        right < this.items.length &&
        this.compare(this.items[right]!, this.items[left]!) < 0
          ? right
          : left;
      if (this.compare(last, this.items[child]!) <= 0) break;
      this.items[index] = this.items[child]!;
      index = child;
    }
    this.items[index] = last;
    return result;
  }
}
