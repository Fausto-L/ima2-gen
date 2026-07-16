/** True when a long/short CLI flag appears in argv, including --flag=value. */
export function wasFlagPassed(argv: readonly string[], ...flags: string[]): boolean {
  return argv.some((arg) => flags.some((flag) => (
    arg === flag || (flag.startsWith("--") && arg.startsWith(`${flag}=`))
  )));
}
