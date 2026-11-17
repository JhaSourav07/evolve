export class CircularDependencyError extends Error {
  constructor(
    message: string,
    public readonly cycle: readonly string[],
  ) {
    super(message);
    this.name = 'CircularDependencyError';
  }
}

export class InvalidDependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDependencyError';
  }
}

