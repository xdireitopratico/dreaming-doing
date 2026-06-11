/** Shared guards so runAgent / connect / coordinator never POST in parallel. */

let connectInFlight = false;

export function tryAcquireAgentConnect(): boolean {
  if (connectInFlight) return false;
  connectInFlight = true;
  return true;
}

export function releaseAgentConnect(): void {
  connectInFlight = false;
}

export function isAgentConnectInFlight(): boolean {
  return connectInFlight;
}
