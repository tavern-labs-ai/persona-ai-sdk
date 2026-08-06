export class CharacterMemoryError extends Error {
  override readonly name: string = "CharacterMemoryError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class ProviderResponseError extends CharacterMemoryError {
  override readonly name = "ProviderResponseError";

  constructor(
    readonly provider: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`${provider}: ${message}`, options);
  }
}

export class StoreFormatError extends CharacterMemoryError {
  override readonly name = "StoreFormatError";
}
