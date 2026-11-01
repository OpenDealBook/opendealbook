export class PollAgain extends Error {
  constructor(readonly resumeAt: Date) {
    super(`Checking again at ${resumeAt.toISOString()}`);
  }
}
