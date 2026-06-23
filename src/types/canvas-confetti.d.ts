declare module "canvas-confetti" {
  type ConfettiOptions = Record<string, unknown>;
  type ConfettiFunction = (options?: ConfettiOptions) => Promise<void> | void;
  const confetti: ConfettiFunction;
  export default confetti;
}
